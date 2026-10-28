import type { ContentRegistry } from "../content/registry";
import { activeCharacter, withCharacter, type SaveData } from "./types";

/** PV máximo pelo nível (GDD 3.2): base + perLevel × (nível − 1). O jogo começa no nível 1. */
export function maxHpFor(level: number, content: ContentRegistry): number {
  return content.balance.maxHp.base + content.balance.maxHp.perLevel * (level - 1);
}

/**
 * Concede XP e sobe de nível: `xpTable[n - 1]` é o XP total para chegar ao nível n (o jogo
 * começa no 1, com 0 XP). +1 ponto de habilidade por nível, respeitando maxLevel.
 */
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

/** Por que uma habilidade não pode ser aprendida agora (DATA_MODELS 6). */
export type SkillError =
  | { kind: "unknownSkill"; skillId: string }
  | { kind: "alreadyLearned"; skillId: string }
  | { kind: "missingRequirement"; skillId: string }
  | { kind: "levelTooLow"; minLevel: number }
  | { kind: "notEnoughPoints"; need: number; have: number };

/** Primeiro motivo que impede aprender a habilidade, ou null se ela está liberada. */
export function skillBlocker(
  save: SaveData,
  skillId: string,
  content: ContentRegistry,
): SkillError | null {
  const skill = content.skills[skillId];
  if (!skill) return { kind: "unknownSkill", skillId };
  const char = activeCharacter(save);
  if (char.skills.includes(skillId)) return { kind: "alreadyLearned", skillId };
  const missing = skill.requires.find((id) => !char.skills.includes(id));
  if (missing) return { kind: "missingRequirement", skillId: missing };
  if (skill.minLevel && char.level < skill.minLevel) {
    return { kind: "levelTooLow", minLevel: skill.minLevel };
  }
  if (char.skillPoints < skill.cost) {
    return { kind: "notEnoughPoints", need: skill.cost, have: char.skillPoints };
  }
  return null;
}

/** Gasta pontos e aprende a habilidade: pré-requisitos, nível mínimo, custo e sem repetir. */
export function learnSkill(
  save: SaveData,
  skillId: string,
  content: ContentRegistry,
): SaveData | SkillError {
  const blocker = skillBlocker(save, skillId, content);
  if (blocker) return blocker;
  const cost = content.skills[skillId]!.cost;
  return withCharacter(save, (c) => ({
    ...c,
    skillPoints: c.skillPoints - cost,
    skills: [...c.skills, skillId],
  }));
}
