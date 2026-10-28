import type { ContentRegistry } from "../content/registry";
import { addIngredients } from "./inventory";
import { claimReward } from "./rewards";
import { activeCharacter, type SaveData } from "./types";

// ---------- Conversões no forno (F2-02, GDD 6.1) ----------

export type ConversionError =
  | { kind: "unknownConversion"; conversionId: string }
  | { kind: "missingSkill"; skillId: string }
  | { kind: "notEnoughIngredients"; ingredientId: string; need: number; have: number }
  | { kind: "invalidTimes" };

/** Quantas vezes a conversão cabe no estoque atual (0 se faltar habilidade ou ingrediente). */
export function maxConversions(save: SaveData, conversionId: string, content: ContentRegistry) {
  const conv = content.conversions[conversionId];
  if (!conv || !activeCharacter(save).skills.includes(conv.requiresSkill)) return 0;
  return Math.min(
    ...conv.inputs.map((i) =>
      Math.floor((save.inventory.ingredients[i.ingredientId] ?? 0) / i.count),
    ),
  );
}

/** Troca ingredientes por outro no forno, `times` vezes. Exige a habilidade e o estoque. */
export function convertIngredients(
  save: SaveData,
  conversionId: string,
  times: number,
  content: ContentRegistry,
): SaveData | ConversionError {
  const conv = content.conversions[conversionId];
  if (!conv) return { kind: "unknownConversion", conversionId };
  if (!Number.isInteger(times) || times < 1) return { kind: "invalidTimes" };
  if (!activeCharacter(save).skills.includes(conv.requiresSkill)) {
    return { kind: "missingSkill", skillId: conv.requiresSkill };
  }
  for (const input of conv.inputs) {
    const have = save.inventory.ingredients[input.ingredientId] ?? 0;
    if (have < input.count * times) {
      return {
        kind: "notEnoughIngredients",
        ingredientId: input.ingredientId,
        need: input.count * times,
        have,
      };
    }
  }
  return addIngredients(
    save,
    [
      ...conv.inputs.map((i) => ({ ingredientId: i.ingredientId, count: -i.count * times })),
      { ingredientId: conv.output.ingredientId, count: conv.output.count * times },
    ],
    content,
  );
}

// ---------- Coletas e baús (F2-06, DATA_MODELS 3.12) ----------

export interface HarvestSpot {
  /** ID global: `<mapa>/<objeto>`. */
  globalId: string;
  ingredientId: string;
  count: number;
  /** "rest": volta ao descansar; "visit": volta a cada visita ao mapa; "never": coleta única. */
  renew: "rest" | "visit" | "never";
  /** Contador de colheitas (+1 a cada colheita). */
  countFlag?: string;
  /** Coleta especial: o pacote de recompensa é o que o jogador recebe (com XP). */
  rewardId?: string;
}

const uniqueFlag = (globalId: string) => `harvested:${globalId}`;

export function isHarvested(save: SaveData, spot: Pick<HarvestSpot, "globalId" | "renew">) {
  return spot.renew === "never"
    ? Boolean(save.flags[uniqueFlag(spot.globalId)])
    : save.world.harvested.includes(spot.globalId);
}

/** Colhe um ponto de coleta. Já colhido: nada muda (`null`). */
export function harvest(
  save: SaveData,
  spot: HarvestSpot,
  content: ContentRegistry,
): SaveData | null {
  if (isHarvested(save, spot)) return null;
  let next: SaveData;
  if (spot.renew === "never") {
    next = { ...save, flags: { ...save.flags, [uniqueFlag(spot.globalId)]: true } };
  } else {
    next = {
      ...save,
      world: { ...save.world, harvested: [...save.world.harvested, spot.globalId] },
    };
  }
  if (spot.countFlag) {
    const n = Number(next.flags[spot.countFlag] ?? 0) + 1;
    next = { ...next, flags: { ...next.flags, [spot.countFlag]: n } };
  }
  if (spot.rewardId) return claimReward(next, spot.rewardId, content).save;
  return addIngredients(next, [{ ingredientId: spot.ingredientId, count: spot.count }], content);
}

/** Baú já aberto? (a recompensa grava a flag com o próprio ID). */
export function isChestOpen(save: SaveData, rewardId: string): boolean {
  return Boolean(save.flags[rewardId]);
}
