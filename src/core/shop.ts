import type { ContentRegistry } from "../content/registry";
import { addIngredients, ingredientCount } from "./inventory";
import type { SaveData } from "./types";

/**
 * Loja (Tab → Loja): moedas e compra de ingredientes.
 * As moedas ficam numa flag do save, então saves antigos funcionam sem migração:
 * sem a flag, o jogador tem as moedas iniciais de `balance.shop`.
 */
export const COINS_FLAG = "flag.moedas";

export type ShopError =
  | { kind: "notForSale"; ingredientId: string }
  | { kind: "notEnoughCoins"; need: number; have: number }
  | { kind: "stackFull"; max: number };

export function coins(save: SaveData, content: ContentRegistry): number {
  const value = save.flags[COINS_FLAG];
  return typeof value === "number" ? value : (content.balance.shop?.startingCoins ?? 0);
}

export function addCoins(save: SaveData, amount: number, content: ContentRegistry): SaveData {
  if (amount === 0) return save;
  const value = Math.max(0, coins(save, content) + amount);
  return { ...save, flags: { ...save.flags, [COINS_FLAG]: value } };
}

/** Moedas por derrotar um inimigo com esse XP. */
export function victoryCoins(enemyXp: number, content: ContentRegistry): number {
  const factor = content.balance.shop?.coinsPerEnemyXp ?? 0;
  return factor > 0 ? Math.max(1, Math.floor(enemyXp * factor)) : 0;
}

/** Ingredientes à venda, na ordem do arquivo de preços. */
export function shopItems(content: ContentRegistry): { ingredientId: string; price: number }[] {
  return Object.entries(content.balance.shop?.prices ?? {})
    .filter(([id]) => id in content.ingredients)
    .map(([ingredientId, price]) => ({ ingredientId, price }));
}

export function buyIngredient(
  save: SaveData,
  ingredientId: string,
  count: number,
  content: ContentRegistry,
): SaveData | ShopError {
  const price = content.balance.shop?.prices[ingredientId];
  if (!price || !(ingredientId in content.ingredients)) return { kind: "notForSale", ingredientId };
  const max = content.balance.maxIngredientStack;
  if (ingredientCount(save, ingredientId) + count > max) return { kind: "stackFull", max };
  const have = coins(save, content);
  const need = price * count;
  if (have < need) return { kind: "notEnoughCoins", need, have };
  return addIngredients(addCoins(save, -need, content), [{ ingredientId, count }], content);
}
