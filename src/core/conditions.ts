import type { ContentRegistry } from "../content/registry";
import type { Condition } from "../content/schemas/conditions";
import { getAvailableRecipes } from "./cooking";
import { activeCharacter, type QuestStatus, type SaveData } from "./types";

/** Estado mínimo das condições: só flags (usado antes de existir um save, ex.: testes do mundo). */
export interface FlagsOnly {
  flags: Readonly<Record<string, boolean | number>>;
}

/** Status de uma missão, derivando "available"/"unavailable" quando ela ainda não começou. */
export function questStatus(
  save: SaveData,
  questId: string,
  content: ContentRegistry,
): QuestStatus {
  const state = save.quests[questId];
  if (state) return state.status;
  const quest = content.quests[questId];
  if (!quest) return "unavailable";
  return !quest.availableWhen || evaluateCondition(quest.availableWhen, save, content)
    ? "available"
    : "unavailable";
}

/** Avalia uma condição (DATA_MODELS 3.11). Função pura. */
export function evaluateCondition(
  condition: Condition,
  save: SaveData | FlagsOnly,
  content?: ContentRegistry,
): boolean {
  const check = (c: Condition) => evaluateCondition(c, save, content);
  if ("all" in condition) return condition.all.every(check);
  if ("any" in condition) return condition.any.some(check);
  if ("not" in condition) return !check(condition.not);
  if ("flag" in condition) {
    const value = save.flags[condition.flag];
    if ("atLeast" in condition) return Number(value ?? 0) >= condition.atLeast;
    return value === true || (typeof value === "number" && value > 0);
  }

  // As demais variantes precisam do save completo e do conteúdo.
  if (!("characters" in save) || !content) return false;
  if ("quest" in condition) {
    if ("status" in condition)
      return questStatus(save, condition.quest, content) === condition.status;
    const state = save.quests[condition.quest];
    const done = state?.status === "completed" || state?.status === "rewarded";
    const step = done ? (content.quests[condition.quest]?.steps.length ?? 0) : (state?.step ?? -1);
    return step >= condition.stepAtLeast;
  }
  if ("hasIngredient" in condition) {
    return (save.inventory.ingredients[condition.hasIngredient] ?? 0) >= condition.count;
  }
  if ("hasPizza" in condition) {
    const { minQuality, recipeId } = condition.hasPizza;
    return save.inventory.pizzas.some(
      (p) =>
        p.slicesLeft > 0 &&
        (!recipeId || p.recipeId === recipeId) &&
        p.quality >= (minQuality ?? 0),
    );
  }
  if ("hasSkill" in condition) return activeCharacter(save).skills.includes(condition.hasSkill);
  if ("knowsRecipe" in condition) {
    return getAvailableRecipes(activeCharacter(save), content).includes(condition.knowsRecipe);
  }
  if ("minLevel" in condition) return activeCharacter(save).level >= condition.minLevel;
  return false;
}
