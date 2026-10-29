import type { ContentRegistry } from "../content/registry";
import { createRng } from "./rng";
import type { SaveData } from "./types";

export const START_MAP = "map.cozinha_mestre";
export const START_ENTRANCE = "inicio";
export const START_OVEN = "oven.mestre";
export const MAIN_QUEST = "quest.primeiro_desafio";
export const MAX_NAME_LENGTH = 12;

/** Save inicial de um novo jogo (DATA_MODELS 4.3). A semente vem de fora: o core não sorteia. */
export function newGame(
  content: ContentRegistry,
  options: {
    name: string;
    seed: number;
    characterId?: string;
    look?: number;
  },
): SaveData {
  const charId = options.characterId ?? "char.aprendiz";
  const def = content.characters[charId];
  if (!def) throw new Error(`personagem inexistente: ${charId}`);
  const map = content.maps[START_MAP];
  const start = map?.entrances[START_ENTRANCE];
  if (!start) throw new Error(`entrada inicial inexistente: ${START_MAP}#${START_ENTRANCE}`);
  const name = options.name.trim().slice(0, MAX_NAME_LENGTH) || "Nico";

  const ingredients: Record<string, number> = {};
  for (const item of def.startingIngredients) {
    ingredients[item.ingredientId] = (ingredients[item.ingredientId] ?? 0) + item.count;
  }

  return {
    activeCharacterId: charId,
    characters: [
      {
        id: charId,
        name,
        level: 1,
        xp: 0,
        skillPoints: 0,
        skills: [],
        knownRecipes: [...def.startingRecipes],
        cookedRecipes: [],
        ...(options.look ? { look: options.look } : {}),
      },
    ],
    inventory: { ingredients, pizzas: [], lastBasket: [] },
    quests: content.quests[MAIN_QUEST] ? { [MAIN_QUEST]: { status: "active", step: 0 } } : {},
    flags: {},
    world: {
      mapId: START_MAP,
      position: { x: start.x, y: start.y, direction: start.direction },
      lastOvenId: START_OVEN,
      defeatedEnemies: [],
      harvested: [],
    },
    rng: createRng(options.seed),
    counters: { nextPizzaSeq: 1 },
    stats: {
      playTimeMs: 0,
      battlesWon: 0,
      battlesLost: 0,
      fled: 0,
      bossAttempts: {},
      pizzasCooked: {},
      slicesUsedByProfile: { picante: 0, cremoso: 0, defumado: 0, fresco: 0 },
      defendUsed: 0,
      improviseUsed: 0,
      firstVictoryAtMs: null,
      firstPizzaAtMs: null,
    },
  };
}
