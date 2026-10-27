import type { Condition } from "../content/schemas/conditions";

/**
 * Estado consultado pelas condições. Na Fase 0 só existem flags;
 * missões, inventário e nível chegam com o SaveData (Fase 1).
 */
export interface ConditionState {
  flags: Readonly<Record<string, boolean | number>>;
}

/** Avalia uma condição (DATA_MODELS 3.11). Função pura. */
export function evaluateCondition(condition: Condition, state: ConditionState): boolean {
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, state));
  if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, state));
  if ("not" in condition) return !evaluateCondition(condition.not, state);
  if ("flag" in condition) {
    const value = state.flags[condition.flag];
    if ("atLeast" in condition) return Number(value ?? 0) >= condition.atLeast;
    return value === true || (typeof value === "number" && value > 0);
  }
  // Missões, inventário, habilidades e nível ainda não existem no estado: falso por enquanto.
  return false;
}
