import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { buyIngredient, coins, victoryCoins } from "../../src/core/shop";
import type { SaveData } from "../../src/core/types";
import { content } from "../helpers";

describe("loja (Tab → Loja)", () => {
  const c = content();
  const fresh = () => newGame(c, { name: "Nico", seed: 1 });

  it("começa com as moedas iniciais, também em saves antigos sem a flag", () => {
    expect(coins(fresh(), c)).toBe(c.balance.shop!.startingCoins);
  });

  it("compra gasta moedas e põe o ingrediente na mochila", () => {
    const save = fresh();
    const before = save.inventory.ingredients["ing.mussarela"] ?? 0;
    const price = c.balance.shop!.prices["ing.mussarela"]!;
    const after = buyIngredient(save, "ing.mussarela", 1, c) as SaveData;
    expect(after.inventory.ingredients["ing.mussarela"]).toBe(before + 1);
    expect(coins(after, c)).toBe(coins(save, c) - price);
  });

  it("recusa sem moedas suficientes e item que não está à venda", () => {
    const save = fresh();
    expect(buyIngredient(save, "ing.mussarela", 99, c)).toMatchObject({ kind: "stackFull" });
    expect(buyIngredient(save, "ing.mussarela", 10, c)).toMatchObject({
      kind: "notEnoughCoins",
    });
    expect(buyIngredient(save, "ing.pimenta_dragao", 1, c)).toMatchObject({ kind: "notForSale" });
  });

  it("vitórias dão moedas", () => {
    expect(victoryCoins(15, c)).toBeGreaterThan(0);
  });
});
