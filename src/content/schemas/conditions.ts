import { z } from "zod";
import {
  FlagIdSchema,
  IngredientIdSchema,
  QuestIdSchema,
  RecipeIdSchema,
  SkillIdSchema,
} from "./common";

export const QuestStatusSchema = z.enum(["locked", "active", "completed"]);

/** Linguagem única de condições (DATA_MODELS 3.11). */
export type Condition =
  | { flag: string }
  | { flag: string; atLeast: number }
  | { quest: string; status: z.infer<typeof QuestStatusSchema> }
  | { quest: string; stepAtLeast: number }
  | { hasIngredient: string; count: number }
  | { hasPizza: { minQuality?: number; recipeId?: string } }
  | { hasSkill: string }
  | { knowsRecipe: string }
  | { minLevel: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

// strictObject: um campo a mais não "encaixa" por engano em outra variante.
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ flag: FlagIdSchema }),
    z.strictObject({ flag: FlagIdSchema, atLeast: z.number().int() }),
    z.strictObject({ quest: QuestIdSchema, status: QuestStatusSchema }),
    z.strictObject({ quest: QuestIdSchema, stepAtLeast: z.number().int().min(0) }),
    z.strictObject({ hasIngredient: IngredientIdSchema, count: z.number().int().min(1) }),
    z.strictObject({
      hasPizza: z.strictObject({
        minQuality: z.number().int().optional(),
        recipeId: RecipeIdSchema.optional(),
      }),
    }),
    z.strictObject({ hasSkill: SkillIdSchema }),
    z.strictObject({ knowsRecipe: RecipeIdSchema }),
    z.strictObject({ minLevel: z.number().int().min(1) }),
    z.strictObject({ all: z.array(ConditionSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1) }),
    z.strictObject({ not: ConditionSchema }),
  ]),
);

/** `src/data/conditions.json`: condições nomeadas, citadas pelos mapas do Tiled (ARCHITECTURE 17.1). */
export const NamedConditionsSchema = z.record(z.string(), ConditionSchema);
