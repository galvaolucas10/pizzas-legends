import type { ContentRegistry } from "../content/registry";
import { evaluateCondition, questStatus } from "./conditions";
import { isEmployeeWorking } from "./restaurant";
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

export interface QuestFocus {
  questId: string;
  objectiveKey: string;
  guide: { mapId: string; targets: string[]; needsPizza?: boolean; enemyId?: string } | null;
}

/**
 * Para onde a seta e o HUD levam agora: a missão principal; mas a etapa "atender clientes"
 * fica com a funcionária quando ela está trabalhando, e então o foco vai para a próxima
 * missão secundária ativa ou disponível (ex.: os níveis), pela `guidePriority`.
 */
export function currentFocus(save: SaveData, content: ContentRegistry): QuestFocus | null {
  const delegated = isEmployeeWorking(save, content);
  const candidates = Object.values(content.quests)
    .map((quest, order) => ({ quest, order, status: questStatus(save, quest.id, content) }))
    .filter((c) => c.status === "active" || c.status === "available")
    .sort(
      (a, b) =>
        (a.quest.kind === "main" ? 0 : 1) - (b.quest.kind === "main" ? 0 : 1) ||
        (b.quest.guidePriority ?? 0) - (a.quest.guidePriority ?? 0) ||
        a.order - b.order,
    );
  let fallback: QuestFocus | null = null;
  for (const { quest, status } of candidates) {
    const step = quest.steps[status === "active" ? save.quests[quest.id]!.step : 0];
    if (!step) continue;
    const focus = { questId: quest.id, objectiveKey: step.objectiveKey, guide: step.guide ?? null };
    // Missão secundária ainda não começada só entra no foco se tiver para onde guiar.
    if (status === "available" && !focus.guide) continue;
    if (delegated && step.guide?.targets.includes("@clientes")) {
      fallback ??= focus;
      continue;
    }
    return focus;
  }
  return fallback;
}

/** A etapa atual da missão principal é atender clientes e a funcionária está cuidando dela. */
export function customersDelegated(save: SaveData, content: ContentRegistry): boolean {
  if (!isEmployeeWorking(save, content)) return false;
  return Object.values(content.quests).some((quest) => {
    const state = save.quests[quest.id];
    if (quest.kind !== "main" || state?.status !== "active") return false;
    return Boolean(quest.steps[state.step]?.guide?.targets.includes("@clientes"));
  });
}

/**
 * Progresso contável da etapa atual de uma missão (ex.: ratos 1/2), quando a condição é
 * "flag com atLeast". Null se a etapa não tem contagem.
 */
export function stepProgress(
  save: SaveData,
  questId: string,
  content: ContentRegistry,
): { done: number; total: number } | null {
  const quest = content.quests[questId];
  const state = save.quests[questId];
  if (!quest || state?.status !== "active") return null;
  const cond = quest.steps[state.step]?.completeWhen;
  if (!cond || !("flag" in cond) || !("atLeast" in cond) || typeof cond.atLeast !== "number") {
    return null;
  }
  const done = Math.min(Number(save.flags[cond.flag] ?? 0), cond.atLeast);
  return { done, total: cond.atLeast };
}

/** Progresso do objetivo mostrado no HUD (mesma missão de `currentObjective`). */
export function objectiveProgress(
  save: SaveData,
  content: ContentRegistry,
): { done: number; total: number } | null {
  const key = currentObjective(save, content);
  if (!key) return null;
  const quest = Object.values(content.quests).find(
    (q) => q.steps[save.quests[q.id]?.step ?? -1]?.objectiveKey === key,
  );
  return quest ? stepProgress(save, quest.id, content) : null;
}
