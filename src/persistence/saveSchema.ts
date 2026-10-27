import { z } from "zod";

/** Esquema do save (DATA_MODELS 4). Valida estrutura e faixas na carga (DATA_MODELS 7.2). */

const count = z.number().int().min(0);
const profileRecord = z.object({ picante: count, cremoso: count, defumado: count, fresco: count });

const StatusAppliedSchema = z.object({
  status: z.string(),
  target: z.enum(["self", "opponent"]),
  duration: count,
  bonusDamage: z.number().int().optional(),
});

export const PizzaInstanceSchema = z
  .object({
    id: z.string().regex(/^pz_\d+$/),
    recipeId: z.string(),
    profile: z.enum(["picante", "cremoso", "defumado", "fresco"]),
    quality: count,
    potency: count,
    maxSlices: z.number().int().min(1),
    slicesLeft: count,
    action: z.object({
      damage: count,
      heal: count,
      shield: count,
      applyStatus: z.array(StatusAppliedSchema),
      cleanseNegative: count,
    }),
    lastSliceMultiplier: z.number().positive(),
    ingredientsUsed: z.array(z.string()),
  })
  .refine((p) => p.slicesLeft <= p.maxSlices, "slicesLeft maior que maxSlices");

export const SaveDataSchema = z.object({
  activeCharacterId: z.string(),
  characters: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(12),
        level: z.number().int().min(1),
        xp: count,
        skillPoints: count,
        skills: z.array(z.string()),
        knownRecipes: z.array(z.string()),
        cookedRecipes: z.array(z.string()),
      }),
    )
    .min(1),
  inventory: z.object({
    ingredients: z.record(z.string(), z.number().int().min(1)),
    pizzas: z.array(PizzaInstanceSchema),
    lastBasket: z.array(z.string()),
  }),
  quests: z.record(
    z.string(),
    z.object({
      status: z.enum(["unavailable", "available", "active", "completed", "rewarded"]),
      step: count,
    }),
  ),
  flags: z.record(z.string(), z.union([z.boolean(), z.number()])),
  world: z.object({
    mapId: z.string(),
    position: z.object({ x: count, y: count, direction: z.enum(["up", "down", "left", "right"]) }),
    lastOvenId: z.string(),
    defeatedEnemies: z.array(z.string()),
    harvested: z.array(z.string()),
  }),
  rng: z.object({ seed: z.number().int(), state: z.number().int() }),
  counters: z.object({ nextPizzaSeq: z.number().int().min(1) }),
  stats: z.object({
    playTimeMs: count,
    battlesWon: count,
    battlesLost: count,
    fled: count,
    bossAttempts: z.record(z.string(), count),
    pizzasCooked: z.record(z.string(), count),
    slicesUsedByProfile: profileRecord,
    defendUsed: count,
    improviseUsed: count,
    firstVictoryAtMs: count.nullable(),
    firstPizzaAtMs: count.nullable(),
  }),
});

export const SaveFileSchema = z.object({
  format: z.literal("pizzalegends-save"),
  schemaVersion: z.number().int().min(1),
  gameVersion: z.string(),
  slotId: z.enum(["auto", "slot1", "slot2", "slot3"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().min(1),
  summary: z.object({
    characterName: z.string(),
    level: z.number().int(),
    mapId: z.string(),
    objectiveKey: z.string().nullable(),
    playTimeMs: count,
  }),
  checksum: z.string(),
  data: z.unknown(),
});
