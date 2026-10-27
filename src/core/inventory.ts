import type { ContentRegistry } from "../content/registry";
import type { SaveData } from "./types";

/** Soma (ou subtrai) ingredientes, com pilha máxima e sem entradas zeradas. */
export function addIngredients(
  save: SaveData,
  items: readonly { ingredientId: string; count: number }[],
  content: ContentRegistry,
): SaveData {
  const ingredients = { ...save.inventory.ingredients };
  for (const { ingredientId, count } of items) {
    const value = Math.min(
      (ingredients[ingredientId] ?? 0) + count,
      content.balance.maxIngredientStack,
    );
    if (value > 0) ingredients[ingredientId] = value;
    else delete ingredients[ingredientId];
  }
  return { ...save, inventory: { ...save.inventory, ingredients } };
}

export function ingredientCount(save: SaveData, ingredientId: string): number {
  return save.inventory.ingredients[ingredientId] ?? 0;
}

/** Tem todos os itens no estoque? */
export function hasIngredients(
  save: SaveData,
  items: readonly { ingredientId: string; count: number }[],
): boolean {
  const need = new Map<string, number>();
  for (const { ingredientId, count } of items)
    need.set(ingredientId, (need.get(ingredientId) ?? 0) + count);
  return [...need].every(([id, count]) => ingredientCount(save, id) >= count);
}
