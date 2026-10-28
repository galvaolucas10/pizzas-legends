import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { GameSession } from "../../src/game/GameSession";
import { OvenController } from "../../src/game/oven/OvenController";
import { content } from "../helpers";

const C = content();
const MARGHERITA = ["ing.molho_tomate", "ing.mussarela", "ing.farinha"];

function setup() {
  const session = new GameSession(C, newGame(C, { name: "Nico", seed: 1 }));
  return { session, oven: new OvenController(session, C, "oven.balcao") };
}

describe("balcão: ajuda para produzir", () => {
  it("começa com Margherita, Quatro Queijos e Brasa; a Defumada diz como liberar", () => {
    const { oven } = setup();
    const cards = oven.recipeCards();
    expect(cards.filter((c) => c.known).map((c) => c.id)).toEqual([
      "rec.margherita",
      "rec.quatro_queijos",
      "rec.brasa",
    ]);
    expect(cards.find((c) => c.id === "rec.defumada")?.unlockHint).toMatch(/Habilidades/);
  });

  it("'como fazer' marca o que tem e o que falta", () => {
    const { oven } = setup();
    const rows = oven.howTo("rec.quatro_queijos");
    expect(rows.map((r) => [r.label, r.ok])).toEqual([
      ["Massa", true],
      ["2 Queijo diferentes", false], // só tem Mussarela
    ]);
  });

  it("preparar o máximo usa todo o estoque", () => {
    const { session, oven } = setup();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    // A etapa 1 deu ingredientes para mais 3 Margheritas.
    expect(oven.maxCookable("rec.margherita")).toBe(3);
    expect(oven.cookMany("rec.margherita", 3)).toMatchObject({ made: 3 });
    expect(oven.maxCookable("rec.margherita")).toBe(0);
  });

  it("comprar o que falta e preparar: compra só o necessário para 1 pizza", () => {
    const { session, oven } = setup();
    const plan = oven.purchasePlan("rec.brasa")!;
    expect(plan.items).toEqual([{ ingredientId: "ing.molho_apimentado", count: 1 }]);
    const coins = session.coins;
    expect(oven.buyMissingAndCook("rec.brasa").ok).toBe(true);
    expect(session.coins).toBe(coins - plan.cost);
    expect(session.state.inventory.pizzas.map((p) => p.recipeId)).toEqual(["rec.brasa"]);
  });

  it("sem lutas na missão, o balcão não mostra dica de rival", () => {
    const { session, oven } = setup();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    session.dispatch({ type: "incrementFlag", flag: "flag.clientes_a", by: 2 });
    expect(oven.tip()).toBeNull();
  });
});
