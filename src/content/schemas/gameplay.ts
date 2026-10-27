import { z } from "zod";
import {
  AssetIdSchema,
  EnemyIdSchema,
  FlagIdSchema,
  idOf,
  IngredientIdSchema,
  QuestIdSchema,
  RecipeIdSchema,
  RewardIdSchema,
  SkillIdSchema,
  TextKeySchema,
} from "./common";
import { ConditionSchema } from "./conditions";

/** Conteúdo de jogo do DATA_MODELS 3.1–3.10, 3.15 e 3.16 (F1-01). */

export const ProfileSchema = z.enum(["picante", "cremoso", "defumado", "fresco"]);
export const RaritySchema = z.enum(["comum", "incomum", "raro", "lendario"]);
export const IngredientCategorySchema = z.enum(["massa", "molho", "queijo", "cobertura"]);
export type Profile = z.infer<typeof ProfileSchema>;
export type Rarity = z.infer<typeof RaritySchema>;

export const StatusIdSchema = idOf("status");
export const ActionIdSchema = idOf("act");
export const BranchIdSchema = idOf("branch");
export const ConversionIdSchema = idOf("conv");
export const CharacterIdSchema = idOf("char");

const count = z.number().int().min(1);
const positive = z.number().positive();
const ItemCountSchema = z.strictObject({ ingredientId: IngredientIdSchema, count });

// 3.2 Balanceamento
export const BalanceSchema = z.strictObject({
  rarityValue: z.strictObject({
    comum: z.number().int(),
    incomum: z.number().int(),
    raro: z.number().int(),
    lendario: z.number().int(),
  }),
  profileBeats: z.strictObject({
    picante: ProfileSchema,
    cremoso: ProfileSchema,
    defumado: ProfileSchema,
    fresco: ProfileSchema,
  }),
  advantageMultiplier: positive,
  sameProfileMultiplier: positive,
  potency: z.strictObject({ base: z.number().int(), perQuality: z.number().int() }),
  slices: z.strictObject({ min: count, max: count }),
  xpTable: z.array(z.number().int().min(0)).min(1),
  maxHp: z.strictObject({ base: count, perLevel: z.number().int().min(0) }),
  basketSize: count,
  maxPizzas: count,
  maxIngredientStack: count,
  defendMultiplier: positive,
  improviseDamage: z.number().int().min(0),
  fleeStunMs: z.number().int().min(0),
  firstCookXp: z.number().int().min(0),
  maxLevel: count,
});
export type Balance = z.infer<typeof BalanceSchema>;

// 3.7 Efeitos de status
export const StatusDefSchema = z.strictObject({
  id: StatusIdSchema,
  polarity: z.enum(["positive", "negative"]),
  defaultDuration: z.number().int().min(1).nullable(),
  stacking: z.enum(["refresh", "sum"]),
  maxValue: positive.optional(),
  tick: z.strictObject({ damage: z.number().int().min(0).optional() }).optional(),
  damageDealtMultiplier: positive.optional(),
  nextActionMultiplier: positive.optional(),
});
export type StatusDef = z.infer<typeof StatusDefSchema>;

export const StatusApplicationSchema = z.strictObject({
  status: StatusIdSchema,
  target: z.enum(["self", "opponent"]),
  duration: z.number().int().min(1).optional(),
});

// 3.3 Ingrediente
export const ToppingModifierSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("healPerSlice"), value: z.number().int() }),
  z.strictObject({ type: z.literal("damagePerSlice"), value: z.number().int() }),
  z.strictObject({ type: z.literal("qualityBonus"), value: z.number().int() }),
  z.strictObject({
    type: z.literal("statusDuration"),
    status: StatusIdSchema,
    value: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("statusDamage"),
    status: StatusIdSchema,
    value: z.number().int(),
  }),
]);

export const IngredientSchema = z
  .strictObject({
    id: IngredientIdSchema,
    category: IngredientCategorySchema,
    rarity: RaritySchema,
    profile: ProfileSchema.nullable(),
    toppingModifiers: z.array(ToppingModifierSchema),
    icon: AssetIdSchema,
  })
  .refine((i) => i.category === "cobertura" || i.toppingModifiers.length === 0, {
    message: "só coberturas têm toppingModifiers",
    path: ["toppingModifiers"],
  });
export type Ingredient = z.infer<typeof IngredientSchema>;

// 3.4 Receita
export const SliceActionTemplateSchema = z
  .strictObject({
    damage: positive.optional(),
    heal: positive.optional(),
    shield: positive.optional(),
    applyStatus: z.array(StatusApplicationSchema).optional(),
    cleanseNegative: count.optional(),
  })
  .refine((a) => Object.keys(a).length > 0, "a fatia precisa fazer alguma coisa");

export const RecipeSchema = z.strictObject({
  id: RecipeIdSchema,
  profile: ProfileSchema,
  baseQuality: z.number().int().min(0),
  baseSlices: count,
  toppingSlots: z.number().int().min(0),
  requirements: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({
          kind: z.literal("category"),
          category: IngredientCategorySchema.exclude(["cobertura"]),
          count,
          distinct: z.boolean().optional(),
        }),
        z.strictObject({ kind: z.literal("ingredient"), ingredientId: IngredientIdSchema, count }),
      ]),
    )
    .min(1),
  sliceAction: SliceActionTemplateSchema,
  unlock: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("start") }),
    z.strictObject({ kind: z.literal("reward"), rewardId: RewardIdSchema }),
    z.strictObject({ kind: z.literal("skill"), skillId: SkillIdSchema }),
  ]),
});
export type Recipe = z.infer<typeof RecipeSchema>;

// 3.5 Conversão
export const ConversionSchema = z.strictObject({
  id: ConversionIdSchema,
  inputs: z.array(ItemCountSchema).min(1),
  output: ItemCountSchema,
  requiresSkill: SkillIdSchema,
});
export type Conversion = z.infer<typeof ConversionSchema>;

// 3.6 Habilidades
export const SkillBranchSchema = z.strictObject({
  id: BranchIdSchema,
  order: z.number().int().min(0),
  icon: AssetIdSchema,
});

export type SkillBranch = z.infer<typeof SkillBranchSchema>;

export const SkillEffectSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("addSlices"), value: z.number().int() }),
  z.strictObject({ type: z.literal("addQuality"), value: z.number().int() }),
  z.strictObject({ type: z.literal("addToppingSlots"), value: z.number().int() }),
  z.strictObject({ type: z.literal("lastSliceMultiplier"), value: positive }),
  z.strictObject({ type: z.literal("harmonyBonus"), value: z.number().int() }),
  z.strictObject({ type: z.literal("toppingIntensity"), value: positive }),
  z.strictObject({ type: z.literal("unlockRecipe"), recipeId: RecipeIdSchema }),
  z.strictObject({ type: z.literal("unlockConversion"), conversionId: ConversionIdSchema }),
  z.strictObject({
    type: z.literal("batchFreeCategory"),
    category: IngredientCategorySchema,
    batchSize: z.number().int().min(2),
  }),
]);

export const SkillSchema = z.strictObject({
  id: SkillIdSchema,
  branchId: BranchIdSchema,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  cost: count,
  requires: z.array(SkillIdSchema),
  minLevel: count.optional(),
  effects: z.array(SkillEffectSchema).min(1),
});
export type Skill = z.infer<typeof SkillSchema>;

/** `skills.json`: ramos e habilidades no mesmo arquivo (DATA_MODELS 2). */
export const SkillsFileSchema = z.strictObject({
  branches: z.array(SkillBranchSchema),
  skills: z.array(SkillSchema),
});

// 3.8 Ações de batalha
export const BattleActionDefSchema = z
  .strictObject({
    id: ActionIdSchema,
    profile: ProfileSchema.nullable(),
    damage: z.number().int().min(0).optional(),
    heal: z.number().int().min(0).optional(),
    shield: z.number().int().min(0).optional(),
    applyStatus: z.array(StatusApplicationSchema).optional(),
    stealSlice: z.boolean().optional(),
    skipTurn: z.boolean().optional(),
    usesPerBattle: count.optional(),
    intentIcon: AssetIdSchema,
  })
  .refine(
    (a) =>
      a.damage !== undefined ||
      a.heal !== undefined ||
      a.shield !== undefined ||
      (a.applyStatus?.length ?? 0) > 0 ||
      a.stealSlice ||
      a.skipTurn,
    "a ação precisa fazer alguma coisa",
  );
export type BattleActionDef = z.infer<typeof BattleActionDefSchema>;

// 3.9 Inimigo
export const EnemySchema = z.strictObject({
  id: EnemyIdSchema,
  profile: ProfileSchema,
  maxHp: count,
  traits: z.array(
    z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("agile") }),
      z.strictObject({ type: z.literal("resistant"), flatReduction: count }),
    ]),
  ),
  canFlee: z.boolean(),
  xp: z.number().int().min(0),
  drops: z.array(
    z.strictObject({ ingredientId: IngredientIdSchema, count, chance: z.number().gt(0).max(1) }),
  ),
  phases: z
    .array(
      z.strictObject({
        untilHpAtOrBelow: z.number().int().min(0),
        profile: ProfileSchema.optional(),
        pattern: z.array(ActionIdSchema).min(1),
        onEnterAction: ActionIdSchema.optional(),
      }),
    )
    .min(1),
  basket: z
    .array(z.strictObject({ label: TextKeySchema, actionId: ActionIdSchema, slices: count }))
    .optional(),
  sprite: AssetIdSchema,
});
export type Enemy = z.infer<typeof EnemySchema>;

// 3.10 Recompensa
export const RewardSchema = z
  .strictObject({
    id: RewardIdSchema,
    xp: z.number().int().min(0).optional(),
    skillPoints: z.number().int().min(0).optional(),
    ingredients: z.array(ItemCountSchema).optional(),
    recipes: z.array(RecipeIdSchema).optional(),
    setFlags: z.array(FlagIdSchema).optional(),
  })
  .refine(
    (r) =>
      Boolean(
        r.xp || r.skillPoints || r.ingredients?.length || r.recipes?.length || r.setFlags?.length,
      ),
    "recompensa vazia",
  );
export type Reward = z.infer<typeof RewardSchema>;

// 3.15 Missão
export const QuestSchema = z.strictObject({
  id: QuestIdSchema,
  kind: z.enum(["main", "side"]),
  availableWhen: ConditionSchema.optional(),
  steps: z
    .array(
      z.strictObject({
        objectiveKey: TextKeySchema,
        completeWhen: ConditionSchema,
        rewardId: RewardIdSchema.optional(),
      }),
    )
    .min(1),
});
export type Quest = z.infer<typeof QuestSchema>;

// 3.16 Personagem jogável
export const CharacterDefSchema = z.strictObject({
  id: CharacterIdSchema,
  sprite: AssetIdSchema,
  startingRecipes: z.array(RecipeIdSchema),
  startingIngredients: z.array(ItemCountSchema),
});
export type CharacterDef = z.infer<typeof CharacterDefSchema>;
