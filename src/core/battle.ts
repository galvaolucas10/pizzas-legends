import type { ContentRegistry } from "../content/registry";
import type { BattleActionDef, Enemy, Profile } from "../content/schemas/gameplay";
import { addIngredients } from "./inventory";
import { grantXp, maxHpFor } from "./progression";
import { nextRandom, type RngState } from "./rng";
import { activeCharacter, type PizzaInstance, type SaveData, type StatusApplied } from "./types";

/** Batalha por turnos, 1 contra 1 (GDD 7). Tudo puro: estado + escolha + rng → novo estado + log. */

export interface ActiveStatus {
  status: string;
  /** Turnos restantes; null = até ser consumido. */
  remaining: number | null;
  /** Escudo: pontos; Queimadura: dano por turno. */
  value?: number;
}

export interface Combatant {
  hp: number;
  maxHp: number;
  profile: Profile | null;
  statuses: ActiveStatus[];
}

export type Side = "player" | "enemy";

export interface BattleState {
  turn: number;
  phase: "playerChoice" | "victory" | "defeat" | "fled";
  enemyId: string;
  player: Combatant;
  enemy: Combatant & {
    phaseIndex: number;
    patternIndex: number;
    pendingAction: string | null;
    usesLeft: Record<string, number>;
  };
  /** Cópias das pizzas da cesta; o inventário só muda no fim (DATA_MODELS 5.1). */
  basket: PizzaInstance[];
  slicesUsedByProfile: Partial<Record<Profile, number>>;
  defendUsed: number;
  improviseUsed: number;
  log: BattleLogEntry[];
}

export type BattleLogEntry =
  | { kind: "action"; side: Side; name: string; pizzaId?: string }
  | {
      kind: "damage";
      target: Side;
      amount: number;
      absorbed: number;
      effectiveness: "strong" | "weak" | "normal";
    }
  | { kind: "heal"; target: Side; amount: number }
  | { kind: "shield"; target: Side; amount: number }
  | { kind: "status"; target: Side; status: string }
  | { kind: "cleanse"; target: Side; status: string }
  | { kind: "tick"; target: Side; status: string; amount: number }
  | { kind: "stealSlice"; pizzaId: string }
  | { kind: "skipTurn"; side: Side }
  | { kind: "defend" }
  | { kind: "phaseChange"; phaseIndex: number; profile: Profile | null }
  | { kind: "victory" }
  | { kind: "defeat" }
  | { kind: "fled" };

export type PlayerChoice =
  | { kind: "slice"; pizzaId: string }
  | { kind: "defend" }
  | { kind: "improvise" }
  | { kind: "flee" };

/** Intenção do inimigo para o próximo turno (sempre mostrada ao jogador). */
export function enemyIntent(
  battle: BattleState,
  content: ContentRegistry,
): BattleActionDef | undefined {
  return content.actions[nextEnemyActionId(battle, content)];
}

function enemyDef(battle: BattleState, content: ContentRegistry): Enemy {
  const enemy = content.enemies[battle.enemyId];
  if (!enemy) throw new Error(`inimigo inexistente: ${battle.enemyId}`);
  return enemy;
}

function nextEnemyActionId(battle: BattleState, content: ContentRegistry): string {
  if (battle.enemy.pendingAction) return battle.enemy.pendingAction;
  const phase = enemyDef(battle, content).phases[battle.enemy.phaseIndex]!;
  return phase.pattern[battle.enemy.patternIndex % phase.pattern.length]!;
}

export function createBattle(
  save: SaveData,
  enemyId: string,
  basketIds: readonly string[],
  content: ContentRegistry,
): BattleState {
  const enemy = content.enemies[enemyId];
  if (!enemy) throw new Error(`inimigo inexistente: ${enemyId}`);
  const char = activeCharacter(save);
  const maxHp = maxHpFor(char.level, content);
  const basket = basketIds
    .slice(0, content.balance.basketSize)
    .map((id) => save.inventory.pizzas.find((p) => p.id === id))
    .filter((p): p is PizzaInstance => !!p && p.slicesLeft > 0)
    .map((p) => ({
      ...p,
      action: { ...p.action, applyStatus: p.action.applyStatus.map((a) => ({ ...a })) },
    }));

  const battle: BattleState = {
    turn: 1,
    phase: "playerChoice",
    enemyId,
    player: { hp: maxHp, maxHp, profile: null, statuses: [] },
    enemy: {
      hp: enemy.maxHp,
      maxHp: enemy.maxHp,
      profile: enemy.phases[0]?.profile ?? enemy.profile,
      statuses: [],
      phaseIndex: 0,
      patternIndex: 0,
      pendingAction: null,
      usesLeft: {},
    },
    basket,
    slicesUsedByProfile: {},
    defendUsed: 0,
    improviseUsed: 0,
    log: [],
  };
  // Ágil: age antes do jogador no primeiro turno (GDD 7.3).
  if (enemy.traits.some((t) => t.type === "agile")) return enemyTurn(battle, content, false);
  return battle;
}

/** Fatias restantes na cesta (Improvisar só quando acabam todas). */
export function slicesLeft(battle: BattleState): number {
  return battle.basket.reduce((sum, p) => sum + p.slicesLeft, 0);
}

export function resolveTurn(
  battle: BattleState,
  choice: PlayerChoice,
  content: ContentRegistry,
): BattleState {
  if (battle.phase !== "playerChoice") return battle;
  const enemy = enemyDef(battle, content);
  let b: BattleState = { ...battle, log: [] };
  let defending = false;

  switch (choice.kind) {
    case "flee":
      if (!enemy.canFlee) return battle;
      return { ...b, phase: "fled", log: [{ kind: "fled" }] };
    case "defend":
      defending = true;
      b.defendUsed += 1;
      b.log.push({ kind: "defend" });
      break;
    case "improvise":
      if (slicesLeft(b) > 0) return battle;
      b.improviseUsed += 1;
      b.log.push({ kind: "action", side: "player", name: "improvise" });
      b = dealDamage(b, "enemy", content.balance.improviseDamage, null, content);
      break;
    case "slice": {
      const index = b.basket.findIndex((p) => p.id === choice.pizzaId && p.slicesLeft > 0);
      if (index < 0) return battle;
      const pizza = b.basket[index]!;
      const last = pizza.slicesLeft === 1 ? pizza.lastSliceMultiplier : 1;
      b.basket = b.basket.map((p, i) => (i === index ? { ...p, slicesLeft: p.slicesLeft - 1 } : p));
      b.slicesUsedByProfile = {
        ...b.slicesUsedByProfile,
        [pizza.profile]: (b.slicesUsedByProfile[pizza.profile] ?? 0) + 1,
      };
      b.log.push({ kind: "action", side: "player", name: pizza.recipeId, pizzaId: pizza.id });
      b = applyAction(
        b,
        "player",
        {
          profile: pizza.profile,
          damage: Math.floor(pizza.action.damage * last),
          heal: Math.floor(pizza.action.heal * last),
          shield: Math.floor(pizza.action.shield * last),
          applyStatus: pizza.action.applyStatus,
          cleanseNegative: pizza.action.cleanseNegative,
          potency: pizza.potency,
        },
        content,
      );
      break;
    }
  }

  if (b.enemy.hp <= 0) return finish(b, "victory");
  b = enemyTurn(b, content, defending);
  return b;
}

/** Turno do inimigo: efeitos contínuos, ação anunciada, troca de fase; depois começa o turno do jogador. */
function enemyTurn(
  battle: BattleState,
  content: ContentRegistry,
  playerDefending: boolean,
): BattleState {
  const enemy = enemyDef(battle, content);
  let b = startTurn(battle, "enemy", content);
  if (b.enemy.hp <= 0) return finish(b, "victory");

  const actionId = nextEnemyActionId(b, content);
  const action = content.actions[actionId];
  const wasPending = b.enemy.pendingAction !== null;
  if (action) {
    const uses = b.enemy.usesLeft[actionId] ?? action.usesPerBattle ?? Infinity;
    b.log.push({ kind: "action", side: "enemy", name: actionId });
    if (uses <= 0) {
      b.log.push({ kind: "skipTurn", side: "enemy" });
    } else {
      if (action.usesPerBattle !== undefined)
        b.enemy = { ...b.enemy, usesLeft: { ...b.enemy.usesLeft, [actionId]: uses - 1 } };
      if (action.skipTurn) b.log.push({ kind: "skipTurn", side: "enemy" });
      if (action.stealSlice) b = stealSlice(b);
      b = applyAction(
        b,
        "enemy",
        {
          profile: action.profile ?? b.enemy.profile,
          damage: action.damage ?? 0,
          heal: action.heal ?? 0,
          shield: action.shield ?? 0,
          applyStatus: (action.applyStatus ?? []).map((a) => ({
            status: a.status,
            target: a.target,
            duration: a.duration ?? content.statuses[a.status]?.defaultDuration ?? 1,
          })),
          cleanseNegative: 0,
          potency: action.damage ?? 0,
          defended: playerDefending,
        },
        content,
      );
    }
  }
  b.enemy = wasPending
    ? { ...b.enemy, pendingAction: null }
    : { ...b.enemy, patternIndex: b.enemy.patternIndex + 1 };

  // Troca de fase ao cruzar o limiar de PV (a ação de transição vira a próxima intenção).
  const phase = enemy.phases[b.enemy.phaseIndex];
  const nextPhase = enemy.phases[b.enemy.phaseIndex + 1];
  if (phase && nextPhase && b.enemy.hp <= phase.untilHpAtOrBelow) {
    b.enemy = {
      ...b.enemy,
      phaseIndex: b.enemy.phaseIndex + 1,
      patternIndex: 0,
      profile: nextPhase.profile ?? enemy.profile,
      pendingAction: nextPhase.onEnterAction ?? null,
    };
    b.log.push({ kind: "phaseChange", phaseIndex: b.enemy.phaseIndex, profile: b.enemy.profile });
  }

  if (b.player.hp <= 0) return finish(b, "defeat");
  b = startTurn(b, "player", content);
  if (b.player.hp <= 0) return finish(b, "defeat");
  return { ...b, turn: b.turn + 1 };
}

/** Início do turno de um lado: Queimadura causa dano, o Escudo expira e as durações diminuem (GDD 7.3/7.5). */
function startTurn(battle: BattleState, side: Side, content: ContentRegistry): BattleState {
  let b = battle;
  const who = b[side];
  for (const s of who.statuses) {
    const tick = content.statuses[s.status]?.tick?.damage;
    if (tick) {
      const amount = s.value ?? tick;
      b = setCombatant(b, side, { hp: Math.max(0, b[side].hp - amount) });
      b.log.push({ kind: "tick", target: side, status: s.status, amount });
    }
  }
  const statuses = b[side].statuses
    .filter((s) => s.status !== "status.escudo")
    .map((s) => (s.remaining === null ? s : { ...s, remaining: s.remaining - 1 }))
    .filter((s) => s.remaining === null || s.remaining > 0);
  return setCombatant(b, side, { statuses });
}

interface ActionEffect {
  profile: Profile | null;
  damage: number;
  heal: number;
  shield: number;
  applyStatus: StatusApplied[];
  cleanseNegative: number;
  potency: number;
  defended?: boolean;
}

function applyAction(
  battle: BattleState,
  source: Side,
  effect: ActionEffect,
  content: ContentRegistry,
): BattleState {
  const target: Side = source === "player" ? "enemy" : "player";
  let b = battle;

  if (effect.damage > 0) {
    let multiplier = 1;
    const attacker = b[source];
    for (const s of attacker.statuses) {
      const def = content.statuses[s.status];
      if (def?.damageDealtMultiplier) multiplier *= def.damageDealtMultiplier;
      if (def?.nextActionMultiplier) multiplier *= def.nextActionMultiplier;
    }
    // "Preparando" vale só para a próxima ação.
    b = setCombatant(b, source, {
      statuses: b[source].statuses.filter((s) => !content.statuses[s.status]?.nextActionMultiplier),
    });
    if (effect.defended) multiplier *= content.balance.defendMultiplier;
    b = dealDamage(b, target, effect.damage * multiplier, effect.profile, content);
  }
  if (effect.heal > 0) {
    const me = b[source];
    const amount = Math.min(effect.heal, me.maxHp - me.hp);
    b = setCombatant(b, source, { hp: me.hp + amount });
    b.log.push({ kind: "heal", target: source, amount });
  }
  if (effect.shield > 0) {
    const cap = (content.statuses["status.escudo"]?.maxValue ?? 2) * effect.potency;
    const current = b[source].statuses.find((s) => s.status === "status.escudo")?.value ?? 0;
    const value = Math.min(current + effect.shield, cap);
    b = setCombatant(b, source, {
      statuses: [
        ...b[source].statuses.filter((s) => s.status !== "status.escudo"),
        { status: "status.escudo", remaining: 1, value },
      ],
    });
    b.log.push({ kind: "shield", target: source, amount: value - current });
  }
  for (let n = 0; n < effect.cleanseNegative; n++) {
    const negative = b[source].statuses.find(
      (s) => content.statuses[s.status]?.polarity === "negative",
    );
    if (!negative) break;
    b = setCombatant(b, source, { statuses: b[source].statuses.filter((s) => s !== negative) });
    b.log.push({ kind: "cleanse", target: source, status: negative.status });
  }
  for (const app of effect.applyStatus) {
    const who: Side = app.target === "self" ? source : target;
    const def = content.statuses[app.status];
    const value =
      def?.tick?.damage !== undefined ? def.tick.damage + (app.bonusDamage ?? 0) : undefined;
    const remaining = def?.defaultDuration === null ? null : app.duration;
    b = setCombatant(b, who, {
      // Sem acúmulo: renova a duração (GDD 7.5).
      statuses: [
        ...b[who].statuses.filter((s) => s.status !== app.status),
        { status: app.status, remaining, value },
      ],
    });
    b.log.push({ kind: "status", target: who, status: app.status });
  }
  return b;
}

/** Dano com perfil, resistência e escudo (GDD 7.4). */
function dealDamage(
  battle: BattleState,
  target: Side,
  base: number,
  profile: Profile | null,
  content: ContentRegistry,
): BattleState {
  const victim = battle[target];
  let multiplier = 1;
  let effectiveness: "strong" | "weak" | "normal" = "normal";
  if (profile && victim.profile) {
    if (content.balance.profileBeats[profile] === victim.profile) {
      multiplier = content.balance.advantageMultiplier;
      effectiveness = "strong";
    } else if (profile === victim.profile) {
      multiplier = content.balance.sameProfileMultiplier;
      effectiveness = "weak";
    }
  }
  let amount = Math.floor(base * multiplier);
  if (target === "enemy") {
    for (const trait of enemyDef(battle, content).traits) {
      if (trait.type === "resistant") amount = Math.max(0, amount - trait.flatReduction);
    }
  }
  const shield = victim.statuses.find((s) => s.status === "status.escudo");
  const absorbed = Math.min(shield?.value ?? 0, amount);
  const statuses = shield
    ? victim.statuses
        .map((s) => (s === shield ? { ...s, value: (s.value ?? 0) - absorbed } : s))
        .filter((s) => s.status !== "status.escudo" || (s.value ?? 0) > 0)
    : victim.statuses;
  const b = setCombatant(battle, target, {
    hp: Math.max(0, victim.hp - (amount - absorbed)),
    statuses,
  });
  b.log.push({ kind: "damage", target, amount: amount - absorbed, absorbed, effectiveness });
  return b;
}

function stealSlice(battle: BattleState): BattleState {
  const richest = [...battle.basket].sort((a, b) => b.slicesLeft - a.slicesLeft)[0];
  if (!richest || richest.slicesLeft === 0) return battle;
  const b = {
    ...battle,
    basket: battle.basket.map((p) => (p === richest ? { ...p, slicesLeft: p.slicesLeft - 1 } : p)),
  };
  b.log.push({ kind: "stealSlice", pizzaId: richest.id });
  return b;
}

function setCombatant(battle: BattleState, side: Side, patch: Partial<Combatant>): BattleState {
  return { ...battle, [side]: { ...battle[side], ...patch } };
}

function finish(battle: BattleState, phase: "victory" | "defeat"): BattleState {
  battle.log.push({ kind: phase });
  return { ...battle, phase };
}

export interface BattleOutcome {
  save: SaveData;
  drops: { ingredientId: string; count: number }[];
  xp: number;
  levelsGained: number;
}

/**
 * Aplica o fim da batalha ao save (GDD 7.6): fatias gastas sempre; na vitória, XP e drops
 * sorteados com o rng do save (recarregar e repetir a luta dá o mesmo resultado).
 */
export function applyBattleResult(
  save: SaveData,
  battle: BattleState,
  content: ContentRegistry,
): BattleOutcome {
  const enemy = enemyDef(battle, content);
  const used = new Map(battle.basket.map((p) => [p.id, p.slicesLeft]));
  const pizzas = save.inventory.pizzas
    .map((p) => (used.has(p.id) ? { ...p, slicesLeft: used.get(p.id)! } : p))
    .filter((p) => p.slicesLeft > 0);
  const kept = new Set(pizzas.map((p) => p.id));
  const stats = { ...save.stats };
  stats.defendUsed += battle.defendUsed;
  stats.improviseUsed += battle.improviseUsed;
  stats.slicesUsedByProfile = { ...stats.slicesUsedByProfile };
  for (const [profile, n] of Object.entries(battle.slicesUsedByProfile)) {
    stats.slicesUsedByProfile[profile as Profile] += n ?? 0;
  }
  if (!enemy.canFlee)
    stats.bossAttempts = {
      ...stats.bossAttempts,
      [enemy.id]: (stats.bossAttempts[enemy.id] ?? 0) + 1,
    };

  let next: SaveData = {
    ...save,
    inventory: {
      ...save.inventory,
      pizzas,
      lastBasket: battle.basket.map((p) => p.id).filter((id) => kept.has(id)),
    },
    stats,
  };

  if (battle.phase !== "victory") {
    if (battle.phase === "defeat") next.stats.battlesLost += 1;
    if (battle.phase === "fled") next.stats.fled += 1;
    return { save: next, drops: [], xp: 0, levelsGained: 0 };
  }

  next.stats.battlesWon += 1;
  next.stats.firstVictoryAtMs ??= next.stats.playTimeMs;
  let rng: RngState = next.rng;
  const drops: { ingredientId: string; count: number }[] = [];
  for (const drop of enemy.drops) {
    const roll = nextRandom(rng);
    rng = roll.rng;
    if (roll.value < drop.chance)
      drops.push({ ingredientId: drop.ingredientId, count: drop.count });
  }
  next = addIngredients({ ...next, rng }, drops, content);
  const xp = grantXp(next, enemy.xp, content);
  return { save: xp.save, drops, xp: enemy.xp, levelsGained: xp.levelsGained };
}

/** Descanso no forno (DATA_MODELS 6): inimigos e coletas renováveis voltam; vira ponto de retorno. */
export function restAtOven(save: SaveData, ovenId: string): SaveData {
  return {
    ...save,
    world: { ...save.world, lastOvenId: ovenId, defeatedEnemies: [], harvested: [] },
  };
}
