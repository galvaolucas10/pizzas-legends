import type { ContentRegistry } from "../../content/registry";
import {
  createBattle,
  enemyIntent,
  resolveTurn,
  slicesLeft,
  type BattleLogEntry,
  type BattleState,
  type PlayerChoice,
} from "../../core/battle";
import type { SaveData } from "../../core/types";
import type { GameSession } from "../GameSession";

/** Visão da batalha para a interface: só textos e números prontos (a UI não importa o core). */
export interface CombatantView {
  name: string;
  hp: number;
  maxHp: number;
  profile: string | null;
  profileName: string;
  statuses: { id: string; name: string; remaining: number | null; value?: number }[];
}

export interface PizzaView {
  id: string;
  name: string;
  profile: string;
  quality: number;
  slicesLeft: number;
  maxSlices: number;
  /** Dano previsto contra o inimigo atual (com perfil, Enfraquecido e Resistente). */
  predictedDamage: number;
  effectiveness: "strong" | "weak" | "normal";
  summary: string;
}

export interface BattleView {
  turn: number;
  phase: BattleState["phase"];
  player: CombatantView;
  enemy: CombatantView & { canFlee: boolean };
  intent: { name: string; icon: string; detail: string } | null;
  basket: PizzaView[];
  canImprovise: boolean;
}

export interface BattleEndSummary {
  phase: "victory" | "defeat" | "fled";
  xp: number;
  drops: { name: string; count: number }[];
  levelUp: number | null;
}

/**
 * Liga a interface às regras puras da batalha: guarda o BattleState, traduz o log em
 * mensagens legíveis e grava o resultado na sessão ao final.
 */
export class BattleController {
  private state: BattleState;
  readonly enemyId: string;

  constructor(
    private readonly session: GameSession,
    private readonly content: ContentRegistry,
    enemyId: string,
    basketIds: readonly string[],
    private readonly enemyGlobalId?: string,
  ) {
    this.enemyId = enemyId;
    session.dispatch({ type: "setBasket", pizzaIds: [...basketIds] });
    this.state = createBattle(session.state as SaveData, enemyId, basketIds, content);
  }

  /** Mensagens do que aconteceu antes do primeiro turno (ex.: o Rato é Ágil). */
  get openingMessages(): string[] {
    return this.describe(this.state.log);
  }

  get finished(): boolean {
    return this.state.phase !== "playerChoice";
  }

  get raw(): BattleState {
    return this.state;
  }

  view(): BattleView {
    const s = this.state;
    const c = this.content;
    const enemy = c.enemies[this.enemyId]!;
    const intent = enemyIntent(s, c);
    const char = this.session.state.characters[0]!;
    return {
      turn: s.turn,
      phase: s.phase,
      player: this.combatant(char.name, s.player),
      enemy: {
        ...this.combatant(this.text(`${this.enemyId}.name`), s.enemy),
        canFlee: enemy.canFlee,
      },
      intent: intent
        ? {
            name: this.text(`${intent.id}.name`),
            icon: intent.intentIcon,
            detail: this.intentDetail(intent.id),
          }
        : null,
      basket: s.basket.map((p) => this.pizzaView(p)),
      canImprovise: slicesLeft(s) === 0,
    };
  }

  /** Executa a escolha do jogador e devolve as mensagens do turno, na ordem. */
  choose(choice: PlayerChoice): string[] {
    const next = resolveTurn(this.state, choice, this.content);
    if (next === this.state) return [];
    this.state = next;
    return this.describe(next.log);
  }

  /** Grava o resultado na sessão (fatias, XP, drops) e resume para a tela final. */
  finish(): BattleEndSummary {
    const levelBefore = this.session.state.characters[0]!.level;
    const result = this.session.dispatch({
      type: "applyBattleResult",
      battle: this.state,
      enemyGlobalId: this.enemyGlobalId,
    });
    const levelAfter = this.session.state.characters[0]!.level;
    const drops = result.ok ? (result.drops ?? []) : [];
    return {
      phase: this.state.phase as BattleEndSummary["phase"],
      xp: result.ok ? (result.xp ?? 0) : 0,
      drops: drops.map((d) => ({ name: this.text(`${d.ingredientId}.name`), count: d.count })),
      levelUp: levelAfter > levelBefore ? levelAfter : null,
    };
  }

  private combatant(name: string, c: BattleState["player"]): CombatantView {
    return {
      name,
      hp: c.hp,
      maxHp: c.maxHp,
      profile: c.profile,
      profileName: (c.profile && PROFILE_NAMES[c.profile]) || "—",
      statuses: c.statuses.map((s) => ({
        id: s.status,
        name: this.text(`${s.status}.name`),
        remaining: s.remaining,
        value: s.value,
      })),
    };
  }

  private pizzaView(p: BattleState["basket"][number]): PizzaView {
    const c = this.content;
    const enemyProfile = this.state.enemy.profile;
    let multiplier = 1;
    let effectiveness: PizzaView["effectiveness"] = "normal";
    if (enemyProfile && c.balance.profileBeats[p.profile] === enemyProfile) {
      multiplier = c.balance.advantageMultiplier;
      effectiveness = "strong";
    } else if (enemyProfile === p.profile) {
      multiplier = c.balance.sameProfileMultiplier;
      effectiveness = "weak";
    }
    for (const s of this.state.player.statuses)
      multiplier *= c.statuses[s.status]?.damageDealtMultiplier ?? 1;
    let predicted = Math.floor(p.action.damage * multiplier);
    for (const t of c.enemies[this.enemyId]!.traits)
      if (t.type === "resistant") predicted = Math.max(0, predicted - t.flatReduction);

    const parts: string[] = [];
    if (p.action.damage) parts.push(`${p.action.damage} dano`);
    if (p.action.heal) parts.push(`+${p.action.heal} PV`);
    if (p.action.shield) parts.push(`escudo ${p.action.shield}`);
    for (const a of p.action.applyStatus) parts.push(this.text(`${a.status}.name`));
    if (p.action.cleanseNegative) parts.push("limpa efeito");
    return {
      id: p.id,
      name: this.text(`${p.recipeId}.name`),
      profile: p.profile,
      quality: p.quality,
      slicesLeft: p.slicesLeft,
      maxSlices: p.maxSlices,
      predictedDamage: predicted,
      effectiveness,
      summary: parts.join(" · "),
    };
  }

  private intentDetail(actionId: string): string {
    const a = this.content.actions[actionId];
    if (!a) return "";
    const parts: string[] = [];
    if (a.damage) {
      const preparing = this.state.enemy.statuses.some(
        (s) => this.content.statuses[s.status]?.nextActionMultiplier,
      );
      parts.push(`ataque ${preparing ? a.damage * 2 : a.damage}`);
    }
    if (a.heal) parts.push(`cura ${a.heal}`);
    for (const s of a.applyStatus ?? []) parts.push(this.text(`${s.status}.name`));
    if (a.stealSlice) parts.push("rouba 1 fatia");
    if (a.skipTurn) parts.push("perde o turno");
    return parts.join(" + ");
  }

  /** Log do core → frases curtas para a caixa de mensagens. */
  private describe(log: BattleLogEntry[]): string[] {
    const enemyName = this.text(`${this.enemyId}.name`);
    const playerName = this.session.state.characters[0]!.name;
    const who = (side: "player" | "enemy") => (side === "player" ? playerName : enemyName);
    const out: string[] = [];
    for (const e of log) {
      switch (e.kind) {
        case "action":
          if (e.side === "player") {
            out.push(
              e.name === "improvise"
                ? `${playerName} improvisa com a pá!`
                : `${playerName} serve uma fatia de ${this.text(`${e.name}.name`)}!`,
            );
          } else {
            out.push(`${enemyName} usa ${this.text(`${e.name}.name`)}!`);
          }
          break;
        case "damage": {
          const extra =
            e.effectiveness === "strong"
              ? " É super saboroso!"
              : e.effectiveness === "weak"
                ? " Não combinou muito..."
                : "";
          const shield = e.absorbed ? ` (escudo absorveu ${e.absorbed})` : "";
          out.push(`${who(e.target)} sofre ${e.amount} de dano${shield}.${extra}`);
          break;
        }
        case "heal":
          if (e.amount) out.push(`${who(e.target)} recupera ${e.amount} PV.`);
          break;
        case "shield":
          out.push(`${who(e.target)} ganha ${e.amount} de escudo.`);
          break;
        case "status":
          out.push(`${who(e.target)}: ${this.text(`${e.status}.name`)}!`);
          break;
        case "cleanse":
          out.push(`${who(e.target)} se livra de ${this.text(`${e.status}.name`)}.`);
          break;
        case "tick":
          out.push(`${who(e.target)} sofre ${e.amount} de ${this.text(`${e.status}.name`)}.`);
          break;
        case "stealSlice":
          out.push(`${enemyName} roubou uma fatia!`);
          break;
        case "skipTurn":
          if (e.side === "enemy") out.push(`${enemyName} não faz nada neste turno.`);
          break;
        case "defend":
          out.push(`${playerName} se protege.`);
          break;
        case "phaseChange":
          out.push(
            `${enemyName} mudou de estilo! Agora é ${e.profile ? PROFILE_NAMES[e.profile] : "neutro"}.`,
          );
          break;
        case "victory":
          out.push(`${enemyName} foi derrotado!`);
          break;
        case "defeat":
          out.push(`${playerName} ficou sem forças...`);
          break;
        case "fled":
          out.push(`${playerName} fugiu!`);
          break;
      }
    }
    return out;
  }

  private text(key: string): string {
    return this.content.locale[key] ?? key;
  }
}

export const PROFILE_NAMES: Record<string, string> = {
  picante: "Picante",
  cremoso: "Cremoso",
  defumado: "Defumado",
  fresco: "Fresco",
};

/** Cesta padrão (GDD 7.2): a última usada + reposição pelas pizzas mais fortes. */
export function defaultBasket(session: GameSession, content: ContentRegistry): string[] {
  const pizzas = session.state.inventory.pizzas.filter((p) => p.slicesLeft > 0);
  const chosen = session.state.inventory.lastBasket.filter((id) => pizzas.some((p) => p.id === id));
  const rest = pizzas
    .filter((p) => !chosen.includes(p.id))
    .sort((a, b) => b.potency * b.slicesLeft - a.potency * a.slicesLeft);
  return [...chosen, ...rest.map((p) => p.id)].slice(0, content.balance.basketSize);
}
