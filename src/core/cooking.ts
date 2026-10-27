import type { ContentRegistry } from "../content/registry";
import type { Ingredient, Recipe } from "../content/schemas/gameplay";
import { addIngredients, hasIngredients } from "./inventory";
import { grantXp } from "./progression";
import {
  activeCharacter,
  withCharacter,
  type CharacterState,
  type PizzaInstance,
  type ResolvedSliceAction,
  type SaveData,
} from "./types";

/** Motivos legíveis pela interface (GDD 11.3: "Falta Mussarela"). */
export type PreparationError =
  | { kind: "recipeUnknown"; recipeId: string }
  | { kind: "missingIngredient"; ingredientId?: string; category?: string }
  | { kind: "notEnoughStock"; ingredientId: string }
  | { kind: "invalidIngredient"; ingredientId: string }
  | { kind: "tooManyToppings"; max: number }
  | { kind: "inventoryFull"; max: number };

export interface PizzaPreview {
  recipeId: string;
  profile: Recipe["profile"];
  quality: number;
  potency: number;
  maxSlices: number;
  action: ResolvedSliceAction;
  lastSliceMultiplier: number;
  ingredientsUsed: string[];
}

/** Receitas que o personagem sabe: as obtidas por recompensa + as liberadas por habilidade. */
export function getAvailableRecipes(char: CharacterState, content: ContentRegistry): string[] {
  const fromSkills = char.skills.flatMap((id) =>
    (content.skills[id]?.effects ?? []).flatMap((e) =>
      e.type === "unlockRecipe" ? [e.recipeId] : [],
    ),
  );
  return [...new Set([...char.knownRecipes, ...fromSkills])].filter((id) => id in content.recipes);
}

/** Soma dos efeitos de habilidade de um tipo. */
function skillTotal(
  char: CharacterState,
  content: ContentRegistry,
  type: string,
  fallback = 0,
): number {
  let total = fallback;
  for (const id of char.skills) {
    for (const effect of content.skills[id]?.effects ?? []) {
      if (effect.type === type && "value" in effect)
        total =
          type === "lastSliceMultiplier" || type === "toppingIntensity"
            ? Math.max(total, effect.value)
            : total + effect.value;
    }
  }
  return total;
}

/**
 * Separa os ingredientes escolhidos entre os requisitos da receita (os "ingredient" primeiro,
 * depois os "category") e as coberturas. Um ingrediente nunca satisfaz dois requisitos.
 */
function matchRequirements(
  recipe: Recipe,
  chosen: Ingredient[],
): { toppings: Ingredient[] } | PreparationError {
  const pool = chosen.filter((i) => i.category !== "cobertura");
  const toppings = chosen.filter((i) => i.category === "cobertura");
  const take = (pred: (i: Ingredient) => boolean): Ingredient | undefined => {
    const index = pool.findIndex(pred);
    return index >= 0 ? pool.splice(index, 1)[0] : undefined;
  };

  for (const req of recipe.requirements) {
    if (req.kind !== "ingredient") continue;
    for (let n = 0; n < req.count; n++) {
      if (!take((i) => i.id === req.ingredientId))
        return { kind: "missingIngredient", ingredientId: req.ingredientId };
    }
  }
  for (const req of recipe.requirements) {
    if (req.kind !== "category") continue;
    const used = new Set<string>();
    for (let n = 0; n < req.count; n++) {
      const got = take((i) => i.category === req.category && (!req.distinct || !used.has(i.id)));
      if (!got) return { kind: "missingIngredient", category: req.category };
      used.add(got.id);
    }
  }
  const extra = pool[0];
  if (extra) return { kind: "invalidIngredient", ingredientId: extra.id };
  return { toppings };
}

/** Mesma conta do preparo, sem gastar nada (GDD 5.4: pré-visualização obrigatória). */
export function previewPizza(
  recipeId: string,
  ingredientIds: readonly string[],
  char: CharacterState,
  content: ContentRegistry,
): PizzaPreview | PreparationError {
  const recipe = content.recipes[recipeId];
  if (!recipe || !getAvailableRecipes(char, content).includes(recipeId))
    return { kind: "recipeUnknown", recipeId };

  const chosen: Ingredient[] = [];
  for (const id of ingredientIds) {
    const ing = content.ingredients[id];
    if (!ing) return { kind: "invalidIngredient", ingredientId: id };
    chosen.push(ing);
  }
  const match = matchRequirements(recipe, chosen);
  if ("kind" in match) return match;

  const maxToppings = recipe.toppingSlots + skillTotal(char, content, "addToppingSlots");
  if (match.toppings.length > maxToppings) return { kind: "tooManyToppings", max: maxToppings };

  const { balance } = content;
  const intensity = skillTotal(char, content, "toppingIntensity", 1);
  const scaled = (value: number) => Math.floor(value * intensity);

  const rarityAvg =
    chosen.reduce((sum, i) => sum + balance.rarityValue[i.rarity], 0) / chosen.length;
  const harmony = chosen.every((i) => i.profile === null || i.profile === recipe.profile)
    ? skillTotal(char, content, "harmonyBonus")
    : 0;
  const toppingQuality = match.toppings
    .flatMap((t) => t.toppingModifiers)
    .reduce((sum, m) => sum + (m.type === "qualityBonus" ? scaled(m.value) : 0), 0);
  const quality =
    recipe.baseQuality +
    Math.floor(rarityAvg) +
    skillTotal(char, content, "addQuality") +
    harmony +
    toppingQuality;
  const potency = balance.potency.base + balance.potency.perQuality * quality;
  const maxSlices = Math.min(
    Math.max(recipe.baseSlices + skillTotal(char, content, "addSlices"), balance.slices.min),
    balance.slices.max,
  );

  const t = recipe.sliceAction;
  const action: ResolvedSliceAction = {
    damage: Math.floor((t.damage ?? 0) * potency),
    heal: Math.floor((t.heal ?? 0) * potency),
    shield: Math.floor((t.shield ?? 0) * potency),
    cleanseNegative: t.cleanseNegative ?? 0,
    applyStatus: (t.applyStatus ?? []).map((a) => ({
      status: a.status,
      target: a.target,
      duration: a.duration ?? content.statuses[a.status]?.defaultDuration ?? 1,
    })),
  };
  for (const mod of match.toppings.flatMap((t) => t.toppingModifiers)) {
    if (mod.type === "healPerSlice") action.heal += scaled(mod.value);
    else if (mod.type === "damagePerSlice") action.damage += scaled(mod.value);
    else if (mod.type === "statusDuration" || mod.type === "statusDamage") {
      for (const app of action.applyStatus) {
        if (app.status !== mod.status) continue;
        if (mod.type === "statusDuration") app.duration += scaled(mod.value);
        else app.bonusDamage = (app.bonusDamage ?? 0) + scaled(mod.value);
      }
    }
  }

  return {
    recipeId,
    profile: recipe.profile,
    quality,
    potency,
    maxSlices,
    action,
    lastSliceMultiplier: skillTotal(char, content, "lastSliceMultiplier", 1),
    ingredientsUsed: [...ingredientIds],
  };
}

export interface CookResult {
  save: SaveData;
  pizza: PizzaInstance;
  firstTime: boolean;
  levelsGained: number;
}

/** Prepara a pizza (DATA_MODELS 6.1): valida, consome ingredientes, cria "pz_<n>" e dá XP de primeiro preparo. */
export function cookPizza(
  save: SaveData,
  recipeId: string,
  ingredientIds: readonly string[],
  content: ContentRegistry,
): CookResult | PreparationError {
  const char = activeCharacter(save);
  const preview = previewPizza(recipeId, ingredientIds, char, content);
  if ("kind" in preview) return preview;

  const items = ingredientIds.map((ingredientId) => ({ ingredientId, count: 1 }));
  if (!hasIngredients(save, items)) {
    const missing = ingredientIds.find(
      (id) => (save.inventory.ingredients[id] ?? 0) < ingredientIds.filter((x) => x === id).length,
    );
    return { kind: "notEnoughStock", ingredientId: missing ?? ingredientIds[0] ?? "" };
  }
  if (save.inventory.pizzas.length >= content.balance.maxPizzas) {
    return { kind: "inventoryFull", max: content.balance.maxPizzas };
  }

  const { ingredientsUsed, ...rest } = preview;
  const pizza: PizzaInstance = {
    ...rest,
    id: `pz_${save.counters.nextPizzaSeq}`,
    slicesLeft: preview.maxSlices,
    ingredientsUsed,
  };
  let next = addIngredients(
    save,
    items.map((i) => ({ ...i, count: -1 })),
    content,
  );
  next = {
    ...next,
    inventory: { ...next.inventory, pizzas: [...next.inventory.pizzas, pizza] },
    counters: { ...next.counters, nextPizzaSeq: next.counters.nextPizzaSeq + 1 },
    stats: {
      ...next.stats,
      pizzasCooked: {
        ...next.stats.pizzasCooked,
        [recipeId]: (next.stats.pizzasCooked[recipeId] ?? 0) + 1,
      },
      firstPizzaAtMs: next.stats.firstPizzaAtMs ?? next.stats.playTimeMs,
    },
  };

  const firstTime = !char.cookedRecipes.includes(recipeId);
  let levelsGained = 0;
  if (firstTime) {
    next = withCharacter(next, (c) => ({ ...c, cookedRecipes: [...c.cookedRecipes, recipeId] }));
    const xp = grantXp(next, content.balance.firstCookXp, content);
    next = xp.save;
    levelsGained = xp.levelsGained;
  }
  return { save: next, pizza, firstTime, levelsGained };
}

/** Sugestão de ingredientes para a receita a partir do estoque (o forno pré-seleciona). */
export function suggestIngredients(
  save: SaveData,
  recipeId: string,
  content: ContentRegistry,
): string[] {
  const recipe = content.recipes[recipeId];
  if (!recipe) return [];
  const stock = { ...save.inventory.ingredients };
  const picked: string[] = [];
  const takeBest = (pred: (i: Ingredient) => boolean, exclude: Set<string>) => {
    const options = Object.values(content.ingredients)
      .filter((i) => pred(i) && (stock[i.id] ?? 0) > 0 && !exclude.has(i.id))
      .sort(
        (a, b) => content.balance.rarityValue[b.rarity] - content.balance.rarityValue[a.rarity],
      );
    const best = options[0];
    if (best) {
      stock[best.id] = (stock[best.id] ?? 0) - 1;
      picked.push(best.id);
    }
    return best;
  };
  for (const req of recipe.requirements) {
    if (req.kind === "ingredient")
      for (let n = 0; n < req.count; n++) takeBest((i) => i.id === req.ingredientId, new Set());
  }
  for (const req of recipe.requirements) {
    if (req.kind !== "category") continue;
    const used = new Set<string>();
    for (let n = 0; n < req.count; n++) {
      const got = takeBest((i) => i.category === req.category, req.distinct ? used : new Set());
      if (got) used.add(got.id);
    }
  }
  return picked;
}
