import { describe, expect, it } from "vitest";
import { suggestIngredients } from "../../src/core/cooking";
import { newGame } from "../../src/core/newGame";
import type { SaveData } from "../../src/core/types";
import { BattleController, defaultBasket } from "../../src/game/battle/BattleController";
import { GameSession } from "../../src/game/GameSession";
import { content } from "../helpers";

const C = content();
const Q = "quest.primeiro_desafio";

/** Luta jogando "bem": a fatia de maior dano previsto; sem fatias, improvisa. */
function fight(s: GameSession, enemyId: string, basket = defaultBasket(s, C)): string {
  const c = new BattleController(s, C, enemyId, basket);
  for (let turn = 0; turn < 60 && !c.finished; turn++) {
    const best = c
      .view()
      .basket.filter((p) => p.slicesLeft > 0)
      .sort((a, b) => b.predictedDamage - a.predictedDamage)[0];
    c.choose(best ? { kind: "slice", pizzaId: best.id } : { kind: "improvise" });
  }
  return c.finish().phase;
}

/** Prepara o que der da receita (até `n`), com as coberturas que melhoram a qualidade. */
function cook(s: GameSession, recipeId: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const r = s.dispatch({ type: "cookPizza", recipeId, ingredientIds: suggest(s, recipeId) });
    if (!r.ok) return;
  }
}

function suggest(s: GameSession, recipeId: string): string[] {
  return suggestIngredients(s.state as SaveData, recipeId, C);
}

describe("jogada completa da demo", () => {
  it("dá para terminar a missão principal jogando normalmente", () => {
    const s = new GameSession(C, newGame(C, { name: "Nico", seed: 42 }));
    cook(s, "rec.margherita", 1);
    expect(s.state.quests[Q]!.step).toBe(1);
    cook(s, "rec.margherita", 3);
    for (let i = 0; i < 2; i++) {
      expect(fight(s, "enemy.rato_despensa")).toBe("victory");
      s.dispatch({ type: "incrementFlag", flag: "flag.ratos_derrotados", by: 1 });
    }
    expect(s.state.quests[Q]!.step).toBe(2);
    cook(s, "rec.margherita", 4);
    cook(s, "rec.quatro_queijos", 4);
    for (let i = 0; i < 3; i++) {
      const r = fight(s, "enemy.vespa_pimenta");
      expect(r).toBe("victory");
      s.dispatch({ type: "incrementFlag", flag: "flag.vespas_derrotadas", by: 1 });
      cook(s, "rec.margherita", 2);
    }
    expect(s.state.quests[Q]!.step).toBe(3);
    s.dispatch({ type: "setFlag", flag: "flag.mestre_explicou_arvore", value: true });
    cook(s, "rec.quatro_queijos", 4);
    cook(s, "rec.margherita", 4);
    cook(s, "rec.brasa", 4);
    const snapshot = {
      level: s.state.characters[0]!.level,
      pizzas: s.state.inventory.pizzas.map((p) => `${p.recipeId}:Q${p.quality}`),
      stock: s.state.inventory.ingredients,
    };
    const pick = (r: string, n: number) =>
      s.state.inventory.pizzas
        .filter((p) => p.recipeId === r)
        .slice(0, n)
        .map((p) => p.id);
    // Cesta como o guia sugere: Quatro Queijos (fase Defumado) + Margherita (fase Picante).
    const result = fight(s, "enemy.rival_ravena", [
      ...pick("rec.quatro_queijos", 2),
      ...pick("rec.margherita", 2),
    ]);
    expect({ result, ...snapshot }).toMatchObject({ result: "victory" });
  });

  it("o pedido do Lenhador é possível: Quatro Queijos + Azeite Dourado chega à qualidade 4", () => {
    const s = new GameSession(C, newGame(C, { name: "Nico", seed: 1 }));
    s.dispatch({ type: "claimReward", rewardId: "rew.primeiro_desafio_etapa2" });
    s.dispatch({ type: "claimReward", rewardId: "rew.primeiro_desafio_etapa4" });
    const r = s.dispatch({
      type: "cookPizza",
      recipeId: "rec.quatro_queijos",
      ingredientIds: [...suggest(s, "rec.quatro_queijos"), "ing.azeite_dourado"],
    });
    expect(r.ok ? r.pizza!.quality : r.error).toBeGreaterThanOrEqual(4);
  });

  it("Ravena: cesta cheia só de Margheritas também vence (não trava quem errou o perfil)", () => {
    const s = new GameSession(C, newGame(C, { name: "Nico", seed: 7 }));
    s.dispatch({ type: "claimReward", rewardId: "rew.primeiro_desafio_etapa1" });
    s.dispatch({ type: "claimReward", rewardId: "rew.primeiro_desafio_etapa2" });
    cook(s, "rec.margherita", 4);
    const basket = s.state.inventory.pizzas.map((p) => p.id);
    expect(basket).toHaveLength(4);
    expect(fight(s, "enemy.rival_ravena", basket)).toBe("victory");
  });
});
