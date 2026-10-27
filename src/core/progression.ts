import type { ContentRegistry } from "../content/registry";
import { activeCharacter, withCharacter, type SaveData } from "./types";

/** PV máximo pelo nível (GDD 3.2): base + perLevel × (nível − 1). */
export function maxHpFor(level: number, content: ContentRegistry): number {
  return content.balance.maxHp.base + content.balance.maxHp.perLevel * (level - 1);
}

/** Concede XP, sobe de nível pela xpTable (+1 ponto de habilidade por nível), respeitando maxLevel. */
export function grantXp(
  save: SaveData,
  amount: number,
  content: ContentRegistry,
): { save: SaveData; levelsGained: number } {
  if (amount <= 0) return { save, levelsGained: 0 };
  const { xpTable, maxLevel } = content.balance;
  let levelsGained = 0;
  const next = withCharacter(save, (char) => {
    let { level, skillPoints } = char;
    const xp = char.xp + amount;
    while (level < maxLevel && xp >= (xpTable[level] ?? Infinity)) {
      level += 1;
      skillPoints += 1;
      levelsGained += 1;
    }
    return { ...char, xp, level, skillPoints };
  });
  return { save: next, levelsGained };
}

/** XP que falta para o próximo nível (null no nível máximo). */
export function xpToNextLevel(save: SaveData, content: ContentRegistry): number | null {
  const char = activeCharacter(save);
  if (char.level >= content.balance.maxLevel) return null;
  return (content.balance.xpTable[char.level] ?? char.xp) - char.xp;
}
