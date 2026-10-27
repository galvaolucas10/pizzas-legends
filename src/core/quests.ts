import type { ContentRegistry } from "../content/registry";
import { evaluateCondition } from "./conditions";
import { claimReward } from "./rewards";
import type { SaveData } from "./types";

export type QuestEvent =
  | { type: "questStarted"; questId: string }
  | { type: "questStepCompleted"; questId: string; step: number; rewardId?: string }
  | { type: "questCompleted"; questId: string }
  | { type: "levelUp"; levels: number };

/**
 * Reavalia as missões ativas (DATA_MODELS 3.15): enquanto a etapa atual estiver cumprida,
 * entrega a recompensa (uma vez) e avança. Uma etapa nunca é "pulada": a ordem é respeitada.
 */
export function updateQuests(
  save: SaveData,
  content: ContentRegistry,
): { save: SaveData; events: QuestEvent[] } {
  const events: QuestEvent[] = [];
  let next = save;
  for (const quest of Object.values(content.quests)) {
    // Um limite generoso evita laço infinito com conteúdo malformado.
    for (let guard = 0; guard <= quest.steps.length; guard++) {
      const state = next.quests[quest.id];
      if (!state || state.status !== "active") break;
      const step = quest.steps[state.step];
      if (!step || !evaluateCondition(step.completeWhen, next, content)) break;

      if (step.rewardId) {
        const reward = claimReward(next, step.rewardId, content);
        next = reward.save;
        if (reward.levelsGained) events.push({ type: "levelUp", levels: reward.levelsGained });
      }
      events.push({
        type: "questStepCompleted",
        questId: quest.id,
        step: state.step,
        rewardId: step.rewardId,
      });
      const finished = state.step + 1 >= quest.steps.length;
      next = {
        ...next,
        quests: {
          ...next.quests,
          [quest.id]: finished
            ? { status: "completed", step: quest.steps.length }
            : { status: "active", step: state.step + 1 },
        },
      };
      if (finished) events.push({ type: "questCompleted", questId: quest.id });
    }
  }
  return { save: next, events };
}

/**
 * Evento `advanceQuest` (cenas roteirizadas): começa a missão (toStep 0) ou a leva até a etapa
 * indicada, mas nunca para trás nem pulando a ordem; as etapas seguintes ainda dependem das condições.
 */
export function advanceQuest(
  save: SaveData,
  questId: string,
  toStep: number,
): { save: SaveData; events: QuestEvent[] } {
  const state = save.quests[questId];
  if (!state) {
    if (toStep !== 0) return { save, events: [] };
    return {
      save: { ...save, quests: { ...save.quests, [questId]: { status: "active", step: 0 } } },
      events: [{ type: "questStarted", questId }],
    };
  }
  if (state.status !== "active" || toStep <= state.step) return { save, events: [] };
  return {
    save: {
      ...save,
      quests: { ...save.quests, [questId]: { status: "active", step: state.step + 1 } },
    },
    events: [{ type: "questStepCompleted", questId, step: state.step }],
  };
}

/** Chave de texto do objetivo atual da missão principal (ou a primeira ativa). */
export function currentObjective(save: SaveData, content: ContentRegistry): string | null {
  const active = Object.values(content.quests)
    .filter((q) => save.quests[q.id]?.status === "active")
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "main" ? -1 : 1));
  for (const quest of active) {
    const step = quest.steps[save.quests[quest.id]!.step];
    if (step) return step.objectiveKey;
  }
  return null;
}
