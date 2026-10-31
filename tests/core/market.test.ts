import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { orderableRecipes, recipePrice } from "../../src/core/shop";
import { content } from "../helpers";

const C = content();

describe("Mercadinho e pedidos", () => {
  it("o Mercadinho vende todo ingrediente que as pizzas pedem", () => {
    const sold = new Set(Object.keys(C.balance.shop?.prices ?? {}));
    for (const recipe of Object.values(C.recipes)) {
      for (const req of recipe.requirements) {
        const options =
          req.kind === "ingredient"
            ? [req.ingredientId]
            : Object.values(C.ingredients)
                .filter((i) => i.category === req.category)
                .map((i) => i.id);
        expect(
          options.some((id) => sold.has(id)),
          `${recipe.id}: ${JSON.stringify(req)}`,
        ).toBe(true);
      }
      expect(recipePrice(recipe.id, C)).toBeLessThan(Infinity);
    }
  });

  it("no começo os clientes só pedem pizzas que dá para pagar; com moedas, pedem todas", () => {
    const start = newGame(C, { name: "Nico", seed: 1 });
    const cheap = orderableRecipes(start, C);
    expect(cheap).toContain("rec.margherita");
    expect(cheap).not.toContain("rec.rustica");
    const rich = { ...start, flags: { ...start.flags, "flag.moedas": 500 } };
    expect(orderableRecipes(rich, C)).toHaveLength(Object.keys(C.recipes).length);
  });
});
