import type { Direction } from "../content/schemas/common";
import type { Profile } from "../content/schemas/gameplay";

/** Estado do jogador (DATA_MODELS 4). Só o que muda; o resto vem do conteúdo. */

export type QuestStatus = "unavailable" | "available" | "active" | "completed" | "rewarded";

export interface CharacterState {
  id: string;
  name: string;
  level: number;
  xp: number;
  skillPoints: number;
  skills: string[];
  knownRecipes: string[];
  cookedRecipes: string[];
  /** Personagem pronto dos saves antigos (0–4; hoje vira um avatar). */
  look?: number;
  /** Pele, cabelo e rostinho escolhidos no novo jogo. */
  avatar?: { skin: number; hair: number; face: number };
}

export interface StatusApplied {
  status: string;
  target: "self" | "opponent";
  duration: number;
  bonusDamage?: number;
}

export interface ResolvedSliceAction {
  damage: number;
  heal: number;
  shield: number;
  applyStatus: StatusApplied[];
  cleanseNegative: number;
}

export interface PizzaInstance {
  id: string;
  recipeId: string;
  profile: Profile;
  quality: number;
  potency: number;
  maxSlices: number;
  slicesLeft: number;
  action: ResolvedSliceAction;
  lastSliceMultiplier: number;
  ingredientsUsed: string[];
}

export interface InventoryState {
  ingredients: Record<string, number>;
  pizzas: PizzaInstance[];
  lastBasket: string[];
}

export interface QuestState {
  status: QuestStatus;
  step: number;
}

export interface WorldState {
  mapId: string;
  position: { x: number; y: number; direction: Direction };
  lastOvenId: string;
  defeatedEnemies: string[];
  harvested: string[];
}

export interface PlayStats {
  playTimeMs: number;
  battlesWon: number;
  battlesLost: number;
  fled: number;
  bossAttempts: Record<string, number>;
  pizzasCooked: Record<string, number>;
  slicesUsedByProfile: Record<Profile, number>;
  defendUsed: number;
  improviseUsed: number;
  firstVictoryAtMs: number | null;
  firstPizzaAtMs: number | null;
}

export interface SaveData {
  activeCharacterId: string;
  characters: CharacterState[];
  inventory: InventoryState;
  quests: Record<string, QuestState>;
  flags: Record<string, boolean | number>;
  world: WorldState;
  rng: { seed: number; state: number };
  counters: { nextPizzaSeq: number };
  stats: PlayStats;
}

/** Personagem ativo (na demo, sempre o único). */
export function activeCharacter(save: SaveData): CharacterState {
  const char = save.characters.find((c) => c.id === save.activeCharacterId) ?? save.characters[0];
  if (!char) throw new Error("save sem personagem");
  return char;
}

/** Substitui o personagem ativo, mantendo o save imutável. */
export function withCharacter(
  save: SaveData,
  update: (c: CharacterState) => CharacterState,
): SaveData {
  const id = activeCharacter(save).id;
  return { ...save, characters: save.characters.map((c) => (c.id === id ? update(c) : c)) };
}
