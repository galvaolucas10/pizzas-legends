import type { ContentRegistry } from "../../content/registry";
import {
  cookPizza,
  getAvailableRecipes,
  previewPizza,
  suggestIngredients,
  type PreparationError,
} from "../../core/cooking";
import { maxConversions } from "../../core/gathering";
import type { SaveData } from "../../core/types";
import { PROFILE_NAMES } from "../battle/BattleController";
import type { GameSession } from "../GameSession";

export interface RecipeOption {
  id: string;
  name: string;
  profile: string;
  /** Texto dos requisitos (ex.: "Massa + Molho de Tomate + Mussarela"). */
  requirements: string;
  canCook: boolean;
}

export interface ToppingOption {
  id: string;
  name: string;
  stock: number;
  effect: string;
  selected: boolean;
}

export interface PreviewView {
  ok: boolean;
  error?: string;
  quality?: number;
  potency?: number;
  slices?: number;
  effects?: string;
  ingredients: string[];
}

export interface ConversionOption {
  id: string;
  name: string;
  /** Ex.: "2 Farinha → 1 Massa Fermentada". */
  recipe: string;
  /** Quantas vezes dá para fazer agora. */
  max: number;
  /** Motivo de não poder (falta a habilidade ou ingrediente). */
  reason?: string;
}

/** Uma linha do "como fazer": o que a receita pede e o que há na mochila. */
export interface HowToRow {
  label: string;
  have: string;
  ok: boolean;
}

/** Receita no balcão: conhecida ou não, como fazer e quantas dá para fazer agora. */
export interface RecipeCard {
  id: string;
  name: string;
  profile: string;
  known: boolean;
  /** Como liberar (receita ainda não conhecida). */
  unlockHint?: string;
  howTo: HowToRow[];
  canMake: number;
}

/** O que falta comprar na loja para 1 pizza. */
export interface PurchasePlan {
  items: { ingredientId: string; count: number }[];
  cost: number;
  /** Algum item que falta não está à venda. */
  unavailable: boolean;
}

/** Lógica da tela do forno (F1-08): receitas, coberturas, pré-visualização e preparo. */
export class OvenController {
  toppings = new Set<string>();

  constructor(
    private readonly session: GameSession,
    private readonly content: ContentRegistry,
    readonly ovenId: string,
  ) {}

  private get save(): SaveData {
    return this.session.state as SaveData;
  }

  recipes(): RecipeOption[] {
    const char = this.save.characters[0]!;
    return getAvailableRecipes(char, this.content).map((id) => {
      const recipe = this.content.recipes[id]!;
      const ingredients = suggestIngredients(this.save, id, this.content);
      const preview = previewPizza(id, ingredients, char, this.content);
      return {
        id,
        name: this.text(`${id}.name`),
        profile: PROFILE_NAMES[recipe.profile] ?? recipe.profile,
        requirements: recipe.requirements
          .map((r) =>
            r.kind === "ingredient"
              ? this.text(`${r.ingredientId}.name`)
              : `${r.count > 1 ? `${r.count} ` : ""}${CATEGORY_NAMES[r.category]}${r.distinct ? " diferentes" : ""}`,
          )
          .join(" + "),
        canCook: !("kind" in preview),
      };
    });
  }

  toppingOptions(): ToppingOption[] {
    return Object.values(this.content.ingredients)
      .filter((i) => i.category === "cobertura" && (this.save.inventory.ingredients[i.id] ?? 0) > 0)
      .map((i) => ({
        id: i.id,
        name: this.text(`${i.id}.name`),
        stock: this.save.inventory.ingredients[i.id] ?? 0,
        effect: i.toppingModifiers
          .map((m) =>
            m.type === "healPerSlice"
              ? `+${m.value} cura`
              : m.type === "damagePerSlice"
                ? `+${m.value} dano`
                : m.type === "qualityBonus"
                  ? `+${m.value} qualidade`
                  : m.type === "statusDuration"
                    ? `${this.text(`${m.status}.name`)} +${m.value} turno`
                    : `${this.text(`${m.status}.name`)} +${m.value} dano`,
          )
          .join(", "),
        selected: this.toppings.has(i.id),
      }));
  }

  toggleTopping(id: string): void {
    if (this.toppings.has(id)) this.toppings.delete(id);
    else this.toppings.add(id);
  }

  ingredientsFor(recipeId: string): string[] {
    return [...suggestIngredients(this.save, recipeId, this.content), ...this.toppings];
  }

  preview(recipeId: string): PreviewView {
    const ingredients = this.ingredientsFor(recipeId);
    const names = ingredients.map((id) => this.text(`${id}.name`));
    const result = previewPizza(recipeId, ingredients, this.save.characters[0]!, this.content);
    if ("kind" in result) return { ok: false, error: this.errorText(result), ingredients: names };
    const stockError = ingredients.find(
      (id) =>
        (this.save.inventory.ingredients[id] ?? 0) < ingredients.filter((x) => x === id).length,
    );
    if (stockError)
      return {
        ok: false,
        error: `Falta ${this.text(`${stockError}.name`)}${BUY_HINT}`,
        ingredients: names,
      };
    const a = result.action;
    const effects = [
      a.damage && `${a.damage} de dano`,
      a.heal && `cura ${a.heal}`,
      a.shield && `escudo ${a.shield}`,
      ...a.applyStatus.map((s) => `${this.text(`${s.status}.name`)} (${s.duration} turnos)`),
      a.cleanseNegative && "remove 1 efeito negativo",
    ]
      .filter(Boolean)
      .join(", ");
    return {
      ok: true,
      quality: result.quality,
      potency: result.potency,
      slices: result.maxSlices,
      effects,
      ingredients: names,
    };
  }

  /** Prepara; devolve a mensagem de sucesso ou de erro. */
  cook(recipeId: string): { ok: boolean; message: string } {
    const result = this.session.dispatch({
      type: "cookPizza",
      recipeId,
      ingredientIds: this.ingredientsFor(recipeId),
    });
    if (!result.ok) {
      const e = result.error;
      return {
        ok: false,
        message: "kind" in e ? this.errorText(e as PreparationError) : "Não deu certo.",
      };
    }
    this.toppings.clear();
    return {
      ok: true,
      message: `${this.text(`${recipeId}.name`)} pronta! Qualidade ${result.pizza?.quality}.`,
    };
  }

  // ---------- Ajuda para produzir ----------

  /** Todas as receitas do jogo, conhecidas ou não, com o "como fazer". */
  recipeCards(): RecipeCard[] {
    const char = this.save.characters[0]!;
    const known = new Set(getAvailableRecipes(char, this.content));
    return Object.values(this.content.recipes).map((recipe) => {
      const isKnown = known.has(recipe.id);
      const unlock = recipe.unlock;
      const unlockHint = isKnown
        ? undefined
        : unlock.kind === "skill"
          ? `Aprenda a habilidade ${this.text(`${unlock.skillId}.name`)} (Tab → Habilidades).`
          : "Libera mais adiante na história.";
      return {
        id: recipe.id,
        name: this.text(`${recipe.id}.name`),
        profile: PROFILE_NAMES[recipe.profile] ?? recipe.profile,
        known: isKnown,
        ...(unlockHint ? { unlockHint } : {}),
        howTo: this.howTo(recipe.id),
        canMake: isKnown ? this.maxCookable(recipe.id) : 0,
      };
    });
  }

  /** O que a receita pede, item por item, e o que há na mochila (✔/✗). */
  howTo(recipeId: string): HowToRow[] {
    const recipe = this.content.recipes[recipeId];
    if (!recipe) return [];
    const stock = this.save.inventory.ingredients;
    return recipe.requirements.map((req) => {
      if (req.kind === "ingredient") {
        const have = stock[req.ingredientId] ?? 0;
        return {
          label: `${req.count > 1 ? `${req.count} ` : ""}${this.text(`${req.ingredientId}.name`)}`,
          have: `você tem ${have}`,
          ok: have >= req.count,
        };
      }
      const options = Object.values(this.content.ingredients).filter(
        (i) => i.category === req.category && (stock[i.id] ?? 0) > 0,
      );
      const total = options.reduce((sum, i) => sum + (stock[i.id] ?? 0), 0);
      const ok = req.distinct ? options.length >= req.count : total >= req.count;
      const category = CATEGORY_NAMES[req.category] ?? req.category;
      return {
        label: `${req.count > 1 ? `${req.count} ` : ""}${category}${req.distinct ? " diferentes" : ""}`,
        have: options.length
          ? options.map((i) => `${this.text(`${i.id}.name`)} ×${stock[i.id]}`).join(", ")
          : "você não tem",
        ok,
      };
    });
  }

  /** Quantas pizzas dessa receita dá para fazer agora com o estoque (sem coberturas). */
  maxCookable(recipeId: string): number {
    let save = this.save;
    let n = 0;
    while (n < this.content.balance.maxPizzas) {
      const ids = suggestIngredients(save, recipeId, this.content);
      const r = cookPizza(save, recipeId, ids, this.content);
      if ("kind" in r) break;
      save = r.save;
      n++;
    }
    return n;
  }

  /** Prepara até `times` pizzas seguidas; devolve quantas saíram e a mensagem. */
  cookMany(recipeId: string, times: number): { made: number; message: string } {
    let made = 0;
    let last = "";
    for (let i = 0; i < times; i++) {
      const r = this.cook(recipeId);
      if (!r.ok) {
        last = r.message;
        break;
      }
      made++;
    }
    const name = this.text(`${recipeId}.name`);
    if (made === 0) return { made, message: last || "Não deu para preparar." };
    const plural = made > 1;
    return { made, message: `${made} ${name}${plural ? "s" : ""} pronta${plural ? "s" : ""}!` };
  }

  /** O que comprar na loja para fazer 1 pizza (null se não falta nada). */
  purchasePlan(recipeId: string): PurchasePlan | null {
    const recipe = this.content.recipes[recipeId];
    if (!recipe) return null;
    const prices = this.content.balance.shop?.prices ?? {};
    const stock = { ...this.save.inventory.ingredients };
    const buy = new Map<string, number>();
    let unavailable = false;
    const need = (ingredientId: string, count: number) => {
      const have = stock[ingredientId] ?? 0;
      const take = Math.min(have, count);
      stock[ingredientId] = have - take;
      if (count > take) {
        if (!prices[ingredientId]) unavailable = true;
        buy.set(ingredientId, (buy.get(ingredientId) ?? 0) + count - take);
      }
    };
    for (const req of recipe.requirements) {
      if (req.kind === "ingredient") need(req.ingredientId, req.count);
    }
    for (const req of recipe.requirements) {
      if (req.kind !== "category") continue;
      const used = new Set<string>();
      for (let n = 0; n < req.count; n++) {
        const options = Object.values(this.content.ingredients).filter(
          (i) => i.category === req.category && !(req.distinct && used.has(i.id)),
        );
        const inStock = options.find((i) => (stock[i.id] ?? 0) > 0);
        const cheapest = options
          .filter((i) => prices[i.id])
          .sort((a, b) => (prices[a.id] ?? 0) - (prices[b.id] ?? 0))[0];
        const pick = inStock ?? cheapest;
        if (!pick) {
          unavailable = true;
          continue;
        }
        used.add(pick.id);
        need(pick.id, 1);
      }
    }
    if (buy.size === 0) return null;
    const items = [...buy].map(([ingredientId, count]) => ({ ingredientId, count }));
    const cost = items.reduce((sum, i) => sum + (prices[i.ingredientId] ?? 0) * i.count, 0);
    return { items, cost, unavailable };
  }

  /** Compra o que falta para 1 pizza e prepara. */
  buyMissingAndCook(recipeId: string): { ok: boolean; message: string } {
    const plan = this.purchasePlan(recipeId);
    if (!plan) return this.cook(recipeId);
    if (plan.unavailable) return { ok: false, message: "Algum ingrediente não está à venda." };
    const coins = this.session.coins;
    if (coins < plan.cost) {
      return { ok: false, message: `Moedas insuficientes: custa ${plan.cost}, você tem ${coins}.` };
    }
    for (const item of plan.items) this.session.dispatch({ type: "buyIngredient", ...item });
    const r = this.cook(recipeId);
    if (!r.ok) return r;
    return { ok: true, message: `Comprou o que faltava (${plan.cost} moedas). ${r.message}` };
  }

  /** Dica: a pizza forte contra quem você vai enfrentar no próximo desafio. */
  tip(): string | null {
    const enemyId = this.session.focus?.guide?.enemyId;
    const enemy = enemyId ? this.content.enemies[enemyId] : undefined;
    if (!enemy) return null;
    const beats = this.content.balance.profileBeats as Record<string, string>;
    const strong = Object.keys(beats).find((p) => beats[p] === enemy.profile);
    const known = getAvailableRecipes(this.save.characters[0]!, this.content);
    const names = known
      .filter((id) => this.content.recipes[id]?.profile === strong)
      .map((id) => this.text(`${id}.name`));
    const who = this.text(`${enemy.id}.name`);
    const profile = PROFILE_NAMES[enemy.profile] ?? enemy.profile;
    return names.length
      ? `Próximo desafio: ${who} (${profile}). Faça ${names.join(" ou ")}: faz mais dano.`
      : `Próximo desafio: ${who} (${profile}). Qualquer pizza serve: leve várias!`;
  }

  /** Conversões do jogo (F2-02): as liberadas por habilidade e as que ainda faltam aprender. */
  conversions(): ConversionOption[] {
    const name = (id: string) => this.content.locale[`${id}.name`] ?? id;
    const skills = this.save.characters[0]!.skills;
    return Object.values(this.content.conversions).map((conv) => {
      const max = maxConversions(this.save, conv.id, this.content);
      const recipe = `${conv.inputs.map((i) => `${i.count} ${name(i.ingredientId)}`).join(" + ")} → ${conv.output.count} ${name(conv.output.ingredientId)}`;
      const reason = !skills.includes(conv.requiresSkill)
        ? `Aprenda a habilidade ${name(conv.requiresSkill)} (menu → Habilidades).`
        : max === 0
          ? `Faltam ingredientes: ${recipe}.`
          : undefined;
      return { id: conv.id, name: name(conv.id), recipe, max, ...(reason ? { reason } : {}) };
    });
  }

  /** Converte `times` vezes; devolve a mensagem para a tela. */
  convert(conversionId: string, times: number): { ok: boolean; message: string } {
    const conv = this.content.conversions[conversionId];
    const r = this.session.dispatch({ type: "convertIngredients", conversionId, times });
    if (!r.ok || !conv) return { ok: false, message: "Não deu para transformar." };
    const out = this.content.locale[`${conv.output.ingredientId}.name`] ?? conv.output.ingredientId;
    return { ok: true, message: `+${conv.output.count * times} ${out}!` };
  }

  /** Descansa; devolve os ingredientes recebidos do kit de segurança (vazio na maioria das vezes). */
  rest(): { ingredientId: string; count: number }[] {
    const before = this.session.state.inventory.ingredients;
    this.session.dispatch({ type: "rest", ovenId: this.ovenId });
    const after = this.session.state.inventory.ingredients;
    return Object.entries(after)
      .map(([ingredientId, n]) => ({ ingredientId, count: n - (before[ingredientId] ?? 0) }))
      .filter((i) => i.count > 0);
  }

  private errorText(e: PreparationError): string {
    switch (e.kind) {
      case "recipeUnknown":
        return "Você ainda não conhece essa receita.";
      case "missingIngredient":
        return `Falta ${e.ingredientId ? this.text(`${e.ingredientId}.name`) : (CATEGORY_NAMES[e.category ?? ""] ?? "ingrediente")}${BUY_HINT}`;
      case "notEnoughStock":
        return `Falta ${this.text(`${e.ingredientId}.name`)}${BUY_HINT}`;
      case "invalidIngredient":
        return `${this.text(`${e.ingredientId}.name`)} não vai nessa receita.`;
      case "tooManyToppings":
        return `Máximo de ${e.max} cobertura(s).`;
      case "inventoryFull":
        return `Mochila cheia: no máximo ${e.max} pizzas.`;
    }
  }

  private text(key: string): string {
    return this.content.locale[key] ?? key;
  }
}

/** Dica de onde conseguir o que falta. */
const BUY_HINT = ". Compre na Loja (Tab → Loja) ou vença inimigos.";

export const CATEGORY_NAMES: Record<string, string> = {
  massa: "Massa",
  molho: "Molho",
  queijo: "Queijo",
  cobertura: "Cobertura",
};
