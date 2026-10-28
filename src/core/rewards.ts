import type { ContentRegistry } from "../content/registry";
import { addIngredients } from "./inventory";
import { addCoins } from "./shop";
import { grantXp } from "./progression";
import { withCharacter, type SaveData } from "./types";

export interface RewardResult {
  save: SaveData;
  /** false se o pacote já tinha sido recebido (nada muda). */
  granted: boolean;
  levelsGained: number;
}

/**
 * Entrega um pacote de recompensa uma única vez (DATA_MODELS 3.10): grava a flag com o
 * próprio ID do pacote; se ela já existe, nada acontece. É a defesa central contra duplicação.
 */
export function claimReward(
  save: SaveData,
  rewardId: string,
  content: ContentRegistry,
): RewardResult {
  const reward = content.rewards[rewardId];
  if (!reward) throw new Error(`recompensa inexistente: ${rewardId}`);
  if (save.flags[rewardId]) return { save, granted: false, levelsGained: 0 };

  let next: SaveData = { ...save, flags: { ...save.flags, [rewardId]: true } };
  for (const flag of reward.setFlags ?? []) next.flags[flag] = true;
  if (reward.ingredients) next = addIngredients(next, reward.ingredients, content);
  if (reward.coins) next = addCoins(next, reward.coins, content);
  if (reward.recipes?.length) {
    next = withCharacter(next, (c) => ({
      ...c,
      knownRecipes: [...new Set([...c.knownRecipes, ...(reward.recipes ?? [])])],
    }));
  }
  if (reward.skillPoints) {
    next = withCharacter(next, (c) => ({
      ...c,
      skillPoints: c.skillPoints + (reward.skillPoints ?? 0),
    }));
  }
  const xp = grantXp(next, reward.xp ?? 0, content);
  return { save: xp.save, granted: true, levelsGained: xp.levelsGained };
}
