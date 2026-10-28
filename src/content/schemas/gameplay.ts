import { z } from "zod";
import {
  AssetIdSchema,
  DirectionSchema,
  EnemyIdSchema,
  FlagIdSchema,
  idOf,
  IngredientIdSchema,
  QuestIdSchema,
  RecipeIdSchema,
  RewardIdSchema,
  SkillIdSchema,
  TextKeySchema,
  MapIdSchema,
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
  /**
   * Rede de segurança: ao descansar sem pizzas e sem ingredientes para preparar a receita
   * básica, o jogador recebe o que falta deste kit (nunca fica sem como continuar).
   */
  restKit: z.array(ItemCountSchema).optional(),
  /**
   * Restaurante: clientes chegam pela porta, sentam, pedem uma pizza (receita que o jogador
   * conhece), comem e pagam. `countFlags`: contadores das etapas de "atender clientes".
   */
  restaurant: z
    .strictObject({
      mapId: MapIdSchema,
      door: z.string().min(1),
      seats: z
        .array(
          z.strictObject({
            x: z.number().int().min(0),
            y: z.number().int().min(0),
            direction: DirectionSchema,
          }),
        )
        .min(1),
      maxCustomers: count,
      firstArrivalMs: z.number().int().min(0),
      arrivalEveryMs: z.number().int().min(0),
      eatMs: z.number().int().min(0),
      payCoins: z.number().int().min(0),
      payXp: z.number().int().min(0),
      sprites: z.array(z.string().min(1)).min(1),
      countFlags: z.array(FlagIdSchema),
      /**
       * Funcionária (NPC do mapa com este id): atende sozinha, mesmo com o jogador em outro
       * mapa, a não ser que `offFlag` (folga) esteja ligada. Fica com `cut` moedas de cada
       * cliente; o resto é do jogador.
       */
      employee: z
        .strictObject({
          id: z.string().min(1),
          offFlag: FlagIdSchema,
          home: z.strictObject({ x: z.number().int(), y: z.number().int() }),
          kitchen: z.strictObject({ x: z.number().int(), y: z.number().int() }),
          cut: z.number().int().min(0),
          cookMs: z.number().int().min(0),
          actionMs: z.number().int().min(0),
          awayStepMs: z.number().int().min(0),
        })
        .optional(),
    })
    .optional(),
  /**
   * Avenida: carros andando nas faixas (só cenário) e o motoboy que leva os pedidos online.
   * Faixas em pixels de jogo (y do centro); `park` é onde a moto fica estacionada.
   */
  avenue: z
    .strictObject({
      mapId: MapIdSchema,
      /** Onde a pista começa e termina (x em pixels de jogo): carros e moto só aparecem ali. */
      road: z.strictObject({ fromX: z.number(), toX: z.number() }),
      lanes: z
        .array(
          z.strictObject({
            y: z.number(),
            direction: z.union([z.literal(1), z.literal(-1)]),
            speed: z.number().positive(),
          }),
        )
        .min(1),
      carsPerLane: z.number().int().min(0),
      motoboy: z.string().min(1),
      park: z.strictObject({ x: z.number().int(), y: z.number().int() }),
      firstOrderMs: z.number().int().min(0),
      orderEveryMs: z.number().int().min(1),
      maxOrders: count,
      rideMs: z.number().int().min(0),
      pay: z.number().int().min(0),
      xp: z.number().int().min(0),
      addresses: z.array(z.string().min(1)).min(1),
      /** Garçom que faz as pizzas dos pedidos online e leva ao motoboy (fica com `cut`). */
      helper: z
        .strictObject({ cookMs: z.number().int().min(0), cut: z.number().int().min(0) })
        .optional(),
    })
    .optional(),
  /**
   * Outros salões com clientes (ex.: a cozinha verde): mesmas regras e pagamento do
   * `restaurant`, com mapa, porta e lugares próprios. Sem funcionária: quem atende é o jogador.
   */
  extraRestaurants: z
    .array(
      z.strictObject({
        mapId: MapIdSchema,
        door: z.string().min(1),
        seats: z
          .array(
            z.strictObject({
              x: z.number().int().min(0),
              y: z.number().int().min(0),
              direction: DirectionSchema,
            }),
          )
          .min(1),
        maxCustomers: count,
        /** Funcionário deste salão (mesmo formato de restaurant.employee). */
        employee: z
          .strictObject({
            id: z.string().min(1),
            offFlag: FlagIdSchema,
            home: z.strictObject({ x: z.number().int(), y: z.number().int() }),
            kitchen: z.strictObject({ x: z.number().int(), y: z.number().int() }),
            cut: z.number().int().min(0),
            cookMs: z.number().int().min(0),
            actionMs: z.number().int().min(0),
            awayStepMs: z.number().int().min(0),
          })
          .optional(),
      }),
    )
    .optional(),
  /** Loja do menu (Tab → Loja): moedas iniciais, moedas por vitória e preço de cada ingrediente. */
  shop: z
    .strictObject({
      startingCoins: z.number().int().min(0),
      /** Moedas por vitória = XP do inimigo × este fator (arredondado para baixo, mínimo 1). */
      coinsPerEnemyXp: z.number().min(0),
      prices: z.record(z.string(), z.number().int().min(1)),
    })
    .optional(),
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
    coins: z.number().int().min(0).optional(),
    ingredients: z.array(ItemCountSchema).optional(),
    recipes: z.array(RecipeIdSchema).optional(),
    setFlags: z.array(FlagIdSchema).optional(),
  })
  .refine(
    (r) =>
      Boolean(
        r.xp ||
        r.skillPoints ||
        r.coins ||
        r.ingredients?.length ||
        r.recipes?.length ||
        r.setFlags?.length,
      ),
    "recompensa vazia",
  );
export type Reward = z.infer<typeof RewardSchema>;

// 3.15 Missão
export const QuestSchema = z.strictObject({
  id: QuestIdSchema,
  kind: z.enum(["main", "side"]),
  availableWhen: ConditionSchema.optional(),
  /** Entre as missões secundárias, a de número maior é guiada primeiro pela seta. */
  guidePriority: z.number().int().optional(),
  steps: z
    .array(
      z.strictObject({
        objectiveKey: TextKeySchema,
        completeWhen: ConditionSchema,
        rewardId: RewardIdSchema.optional(),
        /** Onde ir (seta no chão): o mapa e os objetos-alvo; a seta leva ao mais próximo. */
        guide: z
          .strictObject({
            mapId: MapIdSchema,
            targets: z.array(z.string().min(1)).min(1),
            /** A etapa pede pizzas (batalha, cliente, entrega): sem nenhuma, a seta vai ao forno. */
            needsPizza: z.boolean().optional(),
            /** Quem se enfrenta na etapa (o balcão sugere a pizza forte contra ele). */
            enemyId: EnemyIdSchema.optional(),
          })
          .optional(),
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
