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

/** Ingredientes de cada receita, para comprar na loja quando faltar. */
const SHOPPING: Record<string, string[]> = {
  "rec.margherita": ["ing.farinha", "ing.molho_tomate", "ing.mussarela"],
  "rec.quatro_queijos": ["ing.farinha", "ing.mussarela", "ing.queijo_cabra"],
  "rec.brasa": ["ing.farinha", "ing.molho_apimentado", "ing.mussarela"],
};

/** Atende um cliente como o restaurante: entrega a pizza pedida (prepara ou compra se faltar) e recebe. */
function serve(s: GameSession, recipeId: string): void {
  const has = () => s.state.inventory.pizzas.find((p) => p.recipeId === recipeId);
  if (!has()) cook(s, recipeId, 1);
  if (!has()) {
    for (const ingredientId of SHOPPING[recipeId]!)
      s.dispatch({ type: "buyIngredient", ingredientId, count: 1 });
    cook(s, recipeId, 1);
  }
  const pizza = has();
  expect(pizza, `sem ${recipeId}`).toBeDefined();
  s.dispatch({ type: "takePizza", pizzaId: pizza!.id });
  s.dispatch({ type: "customerPaid" });
}

/** Deixa uma pizza da receita pronta na mochila (prepara; compra o que faltar). */
function serveReady(s: GameSession, recipeId: string): void {
  const has = () => s.state.inventory.pizzas.some((p) => p.recipeId === recipeId);
  if (!has()) cook(s, recipeId, 1);
  if (!has()) {
    for (const ingredientId of SHOPPING[recipeId]!)
      s.dispatch({ type: "buyIngredient", ingredientId, count: 1 });
    cook(s, recipeId, 1);
  }
  expect(has(), `sem ${recipeId}`).toBe(true);
}

function suggest(s: GameSession, recipeId: string): string[] {
  return suggestIngredients(s.state as SaveData, recipeId, C);
}

describe("jogada completa da demo", () => {
  it("dá para terminar a missão principal jogando normalmente", () => {
    const s = new GameSession(C, newGame(C, { name: "Nico", seed: 42 }));
    cook(s, "rec.margherita", 1);
    expect(s.state.quests[Q]!.step).toBe(1);
    serve(s, "rec.margherita");
    serve(s, "rec.margherita");
    expect(s.state.quests[Q]!.step).toBe(2);
    // Nível 3: Quatro Queijos e Brasa (compra o que faltar).
    serveReady(s, "rec.quatro_queijos");
    serveReady(s, "rec.brasa");
    expect(s.state.quests[Q]!.step).toBe(3);
    serve(s, "rec.quatro_queijos");
    serve(s, "rec.margherita");
    expect(s.state.quests[Q]!.step).toBe(4);
    expect(s.state.flags["flag.ponte_aberta"]).toBe(true);
    s.dispatch({ type: "setFlag", flag: "flag.mestre_explicou_arvore", value: true });
    expect(s.state.quests[Q]!.step).toBe(5);
    serve(s, "rec.brasa");
    serve(s, "rec.margherita");
    expect(s.state.quests[Q]!.step).toBe(6);
    // Nível 7: a Ravena prova uma pizza (como na fala dela).
    serveReady(s, "rec.margherita");
    const pizza = s.state.inventory.pizzas[0]!;
    s.dispatch({ type: "takePizza", pizzaId: pizza.id });
    s.dispatch({ type: "setFlag", flag: "flag.ravena_derrotada", value: true });
    expect(s.state.quests[Q]!.step).toBe(7);
    s.dispatch({ type: "setFlag", flag: "flag.voltou_vila", value: true });
    expect(s.questStatus(Q)).toMatch(/completed|rewarded/);
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
