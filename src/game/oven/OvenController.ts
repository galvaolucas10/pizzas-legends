import type { ContentRegistry } from "../../content/registry";
import {
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
      return { ok: false, error: `Falta ${this.text(`${stockError}.name`)}`, ingredients: names };
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
        return `Falta ${e.ingredientId ? this.text(`${e.ingredientId}.name`) : (CATEGORY_NAMES[e.category ?? ""] ?? "ingrediente")}`;
      case "notEnoughStock":
        return `Falta ${this.text(`${e.ingredientId}.name`)}`;
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

export const CATEGORY_NAMES: Record<string, string> = {
  massa: "Massa",
  molho: "Molho",
  queijo: "Queijo",
  cobertura: "Cobertura",
};
