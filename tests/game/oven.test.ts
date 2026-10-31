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
  it("todas as pizzas já vêm liberadas, e todo ingrediente do Mercadinho entra em alguma", () => {
    const { oven } = setup();
    const cards = oven.recipeCards();
    expect(cards.every((c) => c.known)).toBe(true);
    expect(cards.length).toBeGreaterThanOrEqual(12);
    const used = new Set(
      Object.values(C.recipes).flatMap((r) =>
        r.requirements.flatMap((q) =>
          q.kind === "ingredient"
            ? [q.ingredientId]
            : Object.values(C.ingredients)
                .filter((i) => i.category === q.category)
                .map((i) => i.id),
        ),
      ),
    );
    const sold = Object.keys(C.balance.shop?.prices ?? {}).filter(
      (id) => C.ingredients[id]?.category !== "bebida",
    );
    expect(sold.filter((id) => !used.has(id))).toEqual([]);
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

describe("sabores novos e Carreira", () => {
  it("Calabresa exige linguiça (cobertura obrigatória) e já vem liberada", () => {
    const { session, oven } = setup();
    expect(oven.recipeCards().find((c) => c.id === "rec.calabresa")?.known).toBe(true);
    // Compra o que falta (inclusive a linguiça) e prepara.
    expect(oven.buyMissingAndCook("rec.calabresa").ok).toBe(true);
    expect(session.state.inventory.pizzas.at(-1)?.recipeId).toBe("rec.calabresa");
  });

  it("a Carreira abre quando a primeira missão termina", () => {
    const { session } = setup();
    expect(session.questStatus("quest.carreira")).toBe("unavailable");
    session.load({
      ...session.state,
      quests: {
        ...session.state.quests,
        "quest.primeiro_desafio": { status: "rewarded", step: 8 },
      },
    });
    expect(session.questStatus("quest.carreira")).toBe("available");
  });
});
