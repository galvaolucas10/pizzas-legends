import { describe, expect, it } from "vitest";
import {
  applyBattleResult,
  createBattle,
  enemyIntent,
  resolveTurn,
  restAtOven,
  slicesLeft,
  type BattleState,
  type PlayerChoice,
} from "../../src/core/battle";
import { cookPizza } from "../../src/core/cooking";
import { addIngredients } from "../../src/core/inventory";
import { newGame } from "../../src/core/newGame";
import { activeCharacter, withCharacter, type SaveData } from "../../src/core/types";
import { content } from "../helpers";

const REAL = content();
/**
 * O rato do jogo cai com um golpe (3 PV, sem Ágil). Para testar as mecânicas de batalha
 * (Ágil, Belisco, várias rodadas) estes testes usam um rato mais forte, com os valores antigos.
 */
const C = {
  ...REAL,
  enemies: {
    ...REAL.enemies,
    "enemy.rato_despensa": {
      ...REAL.enemies["enemy.rato_despensa"]!,
      maxHp: 18,
      traits: [{ type: "agile" as const }],
    },
  },
};

/** Save com pizzas prontas (cada entrada = receita + ingredientes). */
function saveWith(pizzas: [string, string[]][], seed = 42): SaveData {
  // Receitas liberadas sem XP: o personagem continua no nível 1 (40 de PV).
  let save = withCharacter(newGame(C, { name: "Nico", seed }), (c) => ({
    ...c,
    knownRecipes: [...c.knownRecipes, "rec.quatro_queijos", "rec.brasa"],
  }));
  for (const [recipe, ingredients] of pizzas) {
    save = addIngredients(
      save,
      ingredients.map((ingredientId) => ({ ingredientId, count: 1 })),
      C,
    );
    const result = cookPizza(save, recipe, ingredients, C);
    if ("kind" in result) throw new Error(JSON.stringify(result));
    save = result.save;
  }
  return save;
}

const MARGHERITA: [string, string[]] = [
  "rec.margherita",
  ["ing.farinha", "ing.molho_tomate", "ing.mussarela"],
];
const QUATRO: [string, string[]] = [
  "rec.quatro_queijos",
  ["ing.farinha", "ing.mussarela", "ing.queijo_cabra"],
];
const BRASA: [string, string[]] = [
  "rec.brasa",
  ["ing.farinha", "ing.molho_apimentado", "ing.mussarela"],
];

function start(enemyId: string, pizzas: [string, string[]][], seed = 42) {
  const save = saveWith(pizzas, seed);
  const battle = createBattle(
    save,
    enemyId,
    save.inventory.pizzas.map((p) => p.id),
    C,
  );
  return { save, battle };
}

const slice = (b: BattleState, i = 0): PlayerChoice => ({
  kind: "slice",
  pizzaId: b.basket[i]!.id,
});
const damageTo = (b: BattleState, target: "player" | "enemy") =>
  b.log
    .filter((e) => e.kind === "damage" && e.target === target)
    .map((e) => (e as { amount: number }).amount);

describe("batalha (F1-10, GDD 7.3–7.5)", () => {
  it("o rato do jogo cai com um golpe só, antes de morder", () => {
    const save = saveWith([MARGHERITA]);
    const battle = createBattle(
      save,
      "enemy.rato_despensa",
      save.inventory.pizzas.map((p) => p.id),
      REAL,
    );
    expect(battle.player.hp).toBe(battle.player.maxHp); // não age primeiro
    expect(resolveTurn(battle, slice(battle), REAL).phase).toBe("victory");
  });

  it("Ágil: o Rato age antes do jogador no primeiro turno", () => {
    const { battle } = start("enemy.rato_despensa", [MARGHERITA]);
    expect(battle.player.hp).toBe(46); // 50 PV − Mordida (4)
    expect(battle.enemy.patternIndex).toBe(1);
  });

  it("perfil: mesmo perfil ×0,75; vantagem ×1,5; Resistente −2 por golpe", () => {
    const rato = start("enemy.rato_despensa", [MARGHERITA]).battle;
    expect(damageTo(resolveTurn(rato, slice(rato), C), "enemy")).toEqual([3]); // floor(5 × 0,75)
    const fungo = start("enemy.fungo_rabugento", [QUATRO]).battle;
    // Quatro Queijos P 10 → dano 7; Cremoso vence Defumado: floor(7 × 1,5) = 10; −2 = 8.
    expect(damageTo(resolveTurn(fungo, slice(fungo), C), "enemy")).toEqual([8]);
  });

  it("Margherita cura e remove 1 efeito negativo", () => {
    let { battle } = start("enemy.vespa_pimenta", [MARGHERITA]);
    battle = resolveTurn(battle, { kind: "defend" }, C); // Ferroada: 5 → 2 (defendendo) + Queimadura
    expect(battle.player.statuses.map((s) => s.status)).toContain("status.queimadura");
    battle = resolveTurn(battle, slice(battle), C);
    expect(battle.log.some((e) => e.kind === "cleanse" && e.status === "status.queimadura")).toBe(
      true,
    );
  });

  it("Defender reduz o dano à metade; Queimadura causa 2 no início do turno", () => {
    let { battle } = start("enemy.vespa_pimenta", [MARGHERITA]);
    battle = resolveTurn(battle, { kind: "defend" }, C);
    expect(damageTo(battle, "player")).toEqual([2]); // floor(5 × 0,5)
    expect(battle.log.some((e) => e.kind === "tick" && e.amount === 2)).toBe(true);
    expect(battle.player.hp).toBe(50 - 2 - 2);
  });

  it("Preparando dobra a próxima ação (Ferroada 5 → 10)", () => {
    let { battle } = start("enemy.vespa_pimenta", [MARGHERITA, MARGHERITA]);
    battle = resolveTurn(battle, slice(battle), C); // Ferroada 5
    battle = resolveTurn(battle, slice(battle), C); // Zumbido (Preparando)
    expect(battle.enemy.statuses.map((s) => s.status)).toContain("status.preparando");
    battle = resolveTurn(battle, slice(battle), C); // Ferroada 10
    expect(damageTo(battle, "player")).toEqual([10]);
    expect(battle.enemy.statuses.map((s) => s.status)).not.toContain("status.preparando");
  });

  it("Escudo absorve dano e expira no início do próximo turno de quem o recebeu", () => {
    let { battle } = start("enemy.fungo_rabugento", [QUATRO, QUATRO]);
    battle = resolveTurn(battle, { kind: "defend" }, C); // Esporos: Enfraquecido no jogador
    battle = resolveTurn(battle, slice(battle), C); // Escudo 10; Pancada 6 → absorvida
    const hit = battle.log.find((e) => e.kind === "damage" && e.target === "player") as {
      amount: number;
      absorbed: number;
    };
    expect([hit.amount, hit.absorbed]).toEqual([0, 6]);
    expect(battle.player.statuses.find((s) => s.status === "status.escudo")).toBeUndefined();
  });

  it("Enfraquecido: o afetado causa −30% de dano", () => {
    let { battle } = start("enemy.fungo_rabugento", [BRASA]);
    battle = resolveTurn(battle, { kind: "defend" }, C); // Esporos
    battle = resolveTurn(battle, slice(battle), C);
    // Brasa P 8 → 8; Picante × Defumado = neutro; × 0,7 = 5,6 → floor 5; −2 = 3.
    expect(damageTo(battle, "enemy")[0]).toBe(3);
  });

  it("Belisco rouba 1 fatia da pizza com mais fatias", () => {
    let { battle } = start("enemy.rato_despensa", [MARGHERITA, QUATRO]);
    battle = resolveTurn(battle, slice(battle, 1), C); // Mordida
    battle = resolveTurn(battle, slice(battle, 1), C); // Belisco: Margherita tem 4 (mais fatias)
    expect(battle.basket.map((p) => p.slicesLeft)).toEqual([3, 1]);
  });

  it("Improvisar só sem fatias; Fugir só contra inimigos comuns", () => {
    const { battle } = start("enemy.rato_despensa", [MARGHERITA]);
    expect(resolveTurn(battle, { kind: "improvise" }, C)).toBe(battle);
    const empty = { ...battle, basket: battle.basket.map((p) => ({ ...p, slicesLeft: 0 })) };
    expect(slicesLeft(empty)).toBe(0);
    expect(damageTo(resolveTurn(empty, { kind: "improvise" }, C), "enemy")).toEqual([3]);
    expect(resolveTurn(battle, { kind: "flee" }, C).phase).toBe("fled");
    const boss = start("enemy.rival_ravena", [MARGHERITA]).battle;
    expect(resolveTurn(boss, { kind: "flee" }, C)).toBe(boss);
  });

  it("Ravena: troca de fase em 45 PV, anuncia 'Atiça o forno!' e muda para Picante", () => {
    let { battle } = start("enemy.rival_ravena", [QUATRO]);
    battle = { ...battle, enemy: { ...battle.enemy, hp: 50 } };
    battle = resolveTurn(battle, slice(battle), C);
    expect(battle.enemy.phaseIndex).toBe(1);
    expect(battle.enemy.profile).toBe("picante");
    expect(enemyIntent(battle, C)?.id).toBe("act.atica_forno");
    battle = resolveTurn(battle, { kind: "defend" }, C);
    expect(battle.log.some((e) => e.kind === "skipTurn")).toBe(true);
    expect(enemyIntent(battle, C)?.id).toBe("act.labareda");
  });

  it("vitória e derrota", () => {
    let { battle } = start("enemy.rato_despensa", [MARGHERITA]);
    battle = { ...battle, enemy: { ...battle.enemy, hp: 2 } };
    expect(resolveTurn(battle, slice(battle), C).phase).toBe("victory");
    let lost = start("enemy.rato_despensa", [MARGHERITA]).battle;
    lost = { ...lost, player: { ...lost.player, hp: 1 } };
    expect(resolveTurn(lost, { kind: "defend" }, C).phase).toBe("defeat");
  });
});

describe("fim da batalha (F1-11, GDD 7.6)", () => {
  function win(seed: number) {
    const started = start("enemy.rato_despensa", [MARGHERITA, MARGHERITA], seed);
    const save = started.save;
    let battle = started.battle;
    for (let i = 0; i < 20 && battle.phase === "playerChoice"; i++) {
      const pizza = battle.basket.find((p) => p.slicesLeft > 0);
      battle = resolveTurn(
        battle,
        pizza ? { kind: "slice", pizzaId: pizza.id } : { kind: "improvise" },
        C,
      );
    }
    return { save, battle, outcome: applyBattleResult(save, battle, C) };
  }

  it("vitória: XP, drops sorteados pela semente (mesma semente = mesmo resultado) e fatias gastas", () => {
    const a = win(7);
    expect(a.battle.phase).toBe("victory");
    expect(a.outcome.xp).toBe(15);
    expect(activeCharacter(a.outcome.save).xp).toBe(10 + 15); // 10 do primeiro preparo
    expect(a.outcome.drops).toContainEqual({ ingredientId: "ing.farinha", count: 1 }); // 100%
    expect(win(7).outcome.drops).toEqual(a.outcome.drops);
    const totalSlices = a.outcome.save.inventory.pizzas.reduce((s, p) => s + p.slicesLeft, 0);
    expect(totalSlices).toBe(slicesLeft(a.battle));
    expect(a.outcome.save.stats.battlesWon).toBe(1);
  });

  it("derrota mantém XP, ingredientes e progresso; perde só as fatias usadas", () => {
    const started = start("enemy.rato_despensa", [MARGHERITA]);
    const save = started.save;
    let battle = resolveTurn(started.battle, slice(started.battle), C);
    battle = { ...battle, phase: "defeat" };
    const outcome = applyBattleResult(save, battle, C);
    expect(outcome.save.inventory.pizzas[0]!.slicesLeft).toBe(3);
    expect(activeCharacter(outcome.save).xp).toBe(activeCharacter(save).xp);
    expect(outcome.save.inventory.ingredients).toEqual(save.inventory.ingredients);
    expect(outcome.save.stats.battlesLost).toBe(1);
  });

  it("descansar no forno traz os inimigos de volta e marca o ponto de retorno", () => {
    const save = { ...newGame(C, { name: "N", seed: 1 }) };
    save.world = { ...save.world, defeatedEnemies: ["map.despensa/rato_1"] };
    const rested = restAtOven(save, "oven.acampamento");
    expect([rested.world.defeatedEnemies, rested.world.lastOvenId]).toEqual([
      [],
      "oven.acampamento",
    ]);
  });
});

describe("simulação (F1-20)", () => {
  it("nível 1 com 2 Margheritas vence o Rato em ≥ 90% das sementes", () => {
    let wins = 0;
    for (let seed = 1; seed <= 50; seed++) {
      let { battle } = start("enemy.rato_despensa", [MARGHERITA, MARGHERITA], seed);
      for (let i = 0; i < 30 && battle.phase === "playerChoice"; i++) {
        const pizza = [...battle.basket].sort((a, b) => b.slicesLeft - a.slicesLeft)[0];
        battle = resolveTurn(
          battle,
          pizza && pizza.slicesLeft > 0
            ? { kind: "slice", pizzaId: pizza.id }
            : { kind: "improvise" },
          C,
        );
      }
      if (battle.phase === "victory") wins++;
    }
    expect(wins / 50).toBeGreaterThanOrEqual(0.9);
  });
});
