import type { ContentRegistry } from "../../content/registry";
import type { GameSession } from "../../game/GameSession";
import { OvenController, type PreviewView } from "../../game/oven/OvenController";
import { Menu, type MenuItem, type UiInput } from "../components/Menu";
import { h } from "../dom";

export interface OvenScreenOptions {
  doc: Document;
  root: HTMLElement;
  session: GameSession;
  content: ContentRegistry;
  ovenId: string;
  input: UiInput;
  /** Salvamento manual (GDD 5.5). Devolve true se gravou. */
  save?(): Promise<boolean>;
}

type Page = "main" | "recipes" | "recipe" | "convert";

/**
 * Forno (F1-08, GDD 11.2): preparar pizzas com pré-visualização do resultado, descansar
 * (inimigos e coletas voltam) e salvar.
 */
export class OvenScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly titleEl: HTMLElement;
  private readonly side: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly oven: OvenController;
  private page: Page = "main";
  private recipeId: string | null = null;

  constructor(private readonly o: OvenScreenOptions) {
    const doc = o.doc;
    this.oven = new OvenController(o.session, o.content, o.ovenId);
    this.root = h(doc, "div", "overlay");
    const box = h(doc, "div", "panel oven");
    this.titleEl = h(doc, "h2", "panel__title");
    const columns = h(doc, "div", "oven__columns");
    this.menu = new Menu(doc, "oven__menu");
    this.side = h(doc, "div", "oven__side");
    columns.append(this.menu.element, this.side);
    this.noteEl = h(doc, "p", "panel__note");
    this.noteEl.setAttribute("aria-live", "polite");
    const hint = h(doc, "p", "panel__hint", "↑↓ escolher · Enter confirmar · Esc voltar");
    box.append(this.titleEl, columns, this.noteEl, hint);
    this.root.append(box);
    o.root.append(this.root);
    this.menu.onRefuse = (reason) => this.note(reason);
    this.showMain();
  }

  private text(key: string): string {
    return this.o.content.locale[key] ?? key;
  }

  private note(message: string, good = false): void {
    this.noteEl.textContent = message;
    this.noteEl.classList.toggle("panel__good", good);
  }

  private showMain(): void {
    this.page = "main";
    this.titleEl.textContent = this.o.content.locale[`${this.o.ovenId}.name`] ?? "Forno";
    this.side.replaceChildren(
      h(this.o.doc, "p", "panel__text", "O forno estala, quentinho. O que vamos fazer?"),
    );
    const items: MenuItem[] = [
      { label: "Preparar pizza", onSelect: () => this.showRecipes() },
      { label: "Transformar ingredientes", onSelect: () => this.showConversions() },
      {
        label: "Descansar",
        detail: "inimigos voltam",
        onSelect: () => {
          const kit = this.oven.rest();
          this.note(
            kit.length
              ? "Você descansou. O Mestre deixou ingredientes para uma Margherita no forno!"
              : "Você descansou. Os inimigos e as coletas voltaram.",
            true,
          );
        },
      },
    ];
    if (this.o.save) {
      items.push({
        label: "Salvar jogo",
        onSelect: () => {
          this.note("Salvando...");
          void this.o.save!().then((ok) =>
            this.note(ok ? "Jogo salvo!" : "Não deu para salvar.", ok),
          );
        },
      });
    }
    items.push({ label: "Sair", onSelect: () => (this.done = true) });
    this.menu.onCancel = () => (this.done = true);
    this.menu.onFocus = undefined;
    this.menu.setItems(items);
  }

  /** Fermentação e Defumação (F2-02): troca ingredientes comuns por incomuns. */
  private showConversions(focus = 0): void {
    this.page = "convert";
    this.titleEl.textContent = "Transformar ingredientes";
    const doc = this.o.doc;
    const options = this.oven.conversions();
    this.menu.onCancel = () => this.showMain();
    this.menu.onFocus = (_item, index) => {
      const conv = options[index];
      if (!conv) return;
      this.side.replaceChildren(
        h(doc, "strong", "", conv.name),
        h(doc, "p", "panel__text", conv.recipe),
        h(
          doc,
          "p",
          "panel__hint",
          conv.reason ??
            `Dá para fazer ${conv.max} ${conv.max === 1 ? "vez" : "vezes"}. Enter: 1 vez.`,
        ),
      );
    };
    const items: MenuItem[] = options.map((conv, index) => ({
      label: conv.name,
      detail: conv.max > 0 ? `×${conv.max}` : undefined,
      disabled: conv.max === 0,
      ...(conv.reason ? { reason: conv.reason } : {}),
      onSelect: () => {
        const r = this.oven.convert(conv.id, 1);
        this.note(r.message, r.ok);
        this.showConversions(index);
      },
    }));
    if (items.length === 0) {
      this.side.replaceChildren(h(doc, "p", "panel__text", "Nada para transformar."));
    }
    this.menu.setItems(items, focus);
  }

  private showRecipes(keep = false): void {
    this.page = "recipes";
    this.titleEl.textContent = "Receitas";
    const recipes = this.oven.recipes();
    this.menu.onCancel = () => this.showMain();
    this.menu.onFocus = (_item, index) => {
      const recipe = recipes[index];
      if (recipe) this.paintPreview(recipe.id, `${recipe.profile} · ${recipe.requirements}`);
    };
    this.menu.setItems(
      recipes.map((r) => ({
        label: r.name,
        detail: r.profile,
        disabled: !r.canCook,
        reason: this.oven.preview(r.id).error ?? "Faltam ingredientes.",
        onSelect: () => this.showRecipe(r.id),
      })),
      keep,
    );
  }

  private showRecipe(recipeId: string): void {
    this.page = "recipe";
    this.recipeId = recipeId;
    this.titleEl.textContent = this.text(`${recipeId}.name`);
    const refresh = () => {
      const toppings = this.oven.toppingOptions();
      const preview = this.oven.preview(recipeId);
      this.paintPreview(recipeId, null, preview);
      this.menu.setItems(
        [
          {
            label: "Preparar!",
            disabled: !preview.ok,
            reason: preview.error,
            onSelect: () => {
              const result = this.oven.cook(recipeId);
              this.note(result.message, result.ok);
              refresh();
            },
          },
          ...toppings.map((t) => ({
            label: t.name,
            mark: t.selected ? "✔" : "+",
            detail: `×${t.stock} ${t.effect}`,
            onSelect: () => {
              this.oven.toggleTopping(t.id);
              refresh();
            },
          })),
          { label: "Voltar", onSelect: () => this.backToRecipes() },
        ],
        true,
      );
    };
    this.menu.onFocus = undefined;
    this.menu.onCancel = () => this.backToRecipes();
    this.menu.setItems([]);
    refresh();
  }

  private backToRecipes(): void {
    this.oven.toppings.clear();
    this.showRecipes();
  }

  /** Pré-visualização (GDD 11.3: sempre mostrar o efeito antes de confirmar). */
  private paintPreview(recipeId: string, subtitle: string | null, preview?: PreviewView): void {
    const doc = this.o.doc;
    const p = preview ?? this.oven.preview(recipeId);
    const rows: HTMLElement[] = [];
    if (subtitle) rows.push(h(doc, "p", "panel__hint", subtitle));
    if (!p.ok) {
      rows.push(h(doc, "p", "panel__bad", p.error ?? "Não dá para preparar."));
    } else {
      const stats = h(doc, "dl", "stats");
      for (const [label, value] of [
        ["Qualidade", `${p.quality}`],
        ["Potência", `${p.potency}`],
        ["Fatias", `${p.slices}`],
      ] as const) {
        stats.append(h(doc, "dt", "", label), h(doc, "dd", "", value));
      }
      rows.push(stats);
      if (p.effects) rows.push(h(doc, "p", "panel__text", `Cada fatia: ${p.effects}`));
    }
    if (p.ingredients.length)
      rows.push(h(doc, "p", "panel__hint", `Usa: ${p.ingredients.join(", ")}`));
    const pizzas = this.o.session.state.inventory.pizzas.length;
    rows.push(
      h(
        doc,
        "p",
        "panel__hint",
        `Pizzas na mochila: ${pizzas}/${this.o.content.balance.maxPizzas}`,
      ),
    );
    this.side.replaceChildren(...rows);
  }

  update(): void {
    if (this.done) return;
    this.menu.handle(this.o.input);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Página atual (para testes e depuração). */
  get currentPage(): Page {
    return this.page;
  }

  get currentRecipe(): string | null {
    return this.recipeId;
  }
}
