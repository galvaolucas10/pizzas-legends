import type { ContentRegistry } from "../../content/registry";
import type { GameSession } from "../../game/GameSession";
import {
  OvenController,
  type HowToRow,
  type PreviewView,
  type RecipeCard,
} from "../../game/oven/OvenController";
import { Menu, type MenuItem, type UiInput } from "../components/Menu";
import { h } from "../dom";

/** Pedido de cliente esperando pizza (receita e quantos). */
export interface PendingOrder {
  recipeId: string;
  count: number;
}

export interface OvenScreenOptions {
  doc: Document;
  root: HTMLElement;
  session: GameSession;
  content: ContentRegistry;
  ovenId: string;
  input: UiInput;
  /** Salvamento manual (GDD 5.5). Devolve true se gravou. */
  save?(): Promise<boolean>;
  /** Abre a loja por cima do forno (para comprar ingredientes); `onClose` ao sair. */
  openShop?(onClose: () => void): void;
  /** Pedidos dos clientes do salão esperando pizza; null quando a funcionária cuida deles. */
  orders?(): PendingOrder[] | null;
}

type Page = "quick" | "cooking" | "main" | "recipes" | "recipe" | "convert";

/** Quanto tempo a pizza fica "no forno" na tela simples. */
const COOK_MS = 1200;

/**
 * Forno (F1-08, GDD 11.2): preparar pizzas com pré-visualização do resultado, descansar
 * (inimigos e coletas voltam) e salvar. Ajuda a produzir: "como fazer" de cada receita,
 * preparar várias de uma vez, comprar o que falta e dicas (pedidos e próximo desafio).
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
  /** Pizza sendo feita na tela simples (o tempo que falta). */
  private cooking: { recipeId: string; leftMs: number; index: number } | null = null;

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
    this.showQuick();
  }

  /**
   * Tela simples (a que abre primeiro): só as pizzas que dá para fazer. Escolheu, "fazendo...",
   * pronta. Se faltar ingrediente, compra sozinho na loja. O resto fica em "Mais opções".
   */
  private showQuick(focus = 0): void {
    this.page = "quick";
    this.cooking = null;
    this.titleEl.textContent = this.o.content.locale[`${this.o.ovenId}.name`] ?? "Forno";
    const orders = this.ordersByRecipe();
    const cards = this.oven.recipeCards().filter((c) => c.known);
    const items: MenuItem[] = cards.map((card, index) => {
      const plan = card.canMake > 0 ? null : this.oven.purchasePlan(card.id);
      const cost = plan?.cost ?? 0;
      const blocked = plan?.unavailable || this.o.session.coins < cost;
      return {
        label: card.name,
        mark: orders.has(card.id) ? "★" : undefined,
        detail: card.canMake > 0 ? `tem para ${card.canMake}` : `compra ${cost} moedas`,
        disabled: Boolean(blocked),
        reason: plan?.unavailable
          ? "Algum ingrediente não está à venda."
          : `Faltam ingredientes e moedas (precisa de ${cost}, você tem ${this.o.session.coins}). Atenda clientes ou use 🛒 Comprar ingredientes.`,
        onSelect: () => this.startCooking(card.id, index),
      };
    });
    if (this.o.openShop) {
      const openShop = this.o.openShop;
      items.push({
        label: "🛒 Comprar ingredientes",
        detail: "loja",
        onSelect: () => openShop(() => this.showQuick(this.menu.focusIndex)),
      });
    }
    items.push(
      { label: "Mais opções", detail: "descansar, salvar...", onSelect: () => this.showMain() },
      { label: "Sair", onSelect: () => (this.done = true) },
    );
    this.side.replaceChildren(
      h(this.o.doc, "p", "panel__text", "Escolha uma pizza que eu preparo para você!"),
      ...this.helpRows().slice(0, -1),
      h(
        this.o.doc,
        "p",
        "panel__hint",
        `Pizzas na mochila: ${this.o.session.state.inventory.pizzas.length}/${this.o.content.balance.maxPizzas} · Moedas: ${this.o.session.coins}`,
      ),
    );
    this.menu.onCancel = () => (this.done = true);
    this.menu.onFocus = undefined;
    this.menu.setItems(items, focus);
  }

  private startCooking(recipeId: string, index: number): void {
    this.page = "cooking";
    this.cooking = { recipeId, leftMs: COOK_MS, index };
    this.note("");
    this.menu.setItems([]);
    this.paintCooking();
  }

  private paintCooking(): void {
    const c = this.cooking;
    if (!c) return;
    const doc = this.o.doc;
    const steps = 10;
    const done = Math.round(((COOK_MS - c.leftMs) / COOK_MS) * steps);
    const bar = "▓".repeat(done) + "░".repeat(steps - done);
    this.side.replaceChildren(
      h(doc, "p", "panel__text", `🔥 Fazendo a ${this.text(`${c.recipeId}.name`)}...`),
      h(doc, "p", "panel__text", bar),
    );
  }

  private finishCooking(): void {
    const c = this.cooking;
    if (!c) return;
    const result = this.oven.buyMissingAndCook(c.recipeId);
    this.note(result.ok ? `${result.message} Está na sua mochila.` : result.message, result.ok);
    this.showQuick(c.index);
  }

  private text(key: string): string {
    return this.o.content.locale[key] ?? key;
  }

  private note(message: string, good = false): void {
    this.noteEl.textContent = message;
    this.noteEl.classList.toggle("panel__good", good);
  }

  /** Pedidos dos clientes por receita (vazio se não houver). */
  private ordersByRecipe(): Map<string, number> {
    return new Map((this.o.orders?.() ?? []).map((x) => [x.recipeId, x.count]));
  }

  /** Ajuda do balcão: pedidos esperando, dica do próximo desafio e como começar. */
  private helpRows(): HTMLElement[] {
    const doc = this.o.doc;
    const rows: HTMLElement[] = [];
    const orders = this.o.orders?.();
    if (orders === null) {
      rows.push(h(doc, "p", "panel__text", "Salão: a Nina está cuidando dos pedidos."));
    } else if (orders && orders.length) {
      const list = orders.map((x) => `${this.text(`${x.recipeId}.name`)} ×${x.count}`).join(", ");
      rows.push(h(doc, "p", "panel__text", `★ Pedidos esperando: ${list}`));
    }
    const tip = this.oven.tip();
    if (tip) rows.push(h(doc, "p", "panel__text", `★ ${tip}`));
    rows.push(
      h(
        doc,
        "p",
        "panel__hint",
        "Escolha Preparar pizza: cada receita mostra o que precisa e quantas dá para fazer.",
      ),
    );
    return rows;
  }

  private showMain(): void {
    this.page = "main";
    this.titleEl.textContent = this.o.content.locale[`${this.o.ovenId}.name`] ?? "Forno";
    this.side.replaceChildren(
      h(this.o.doc, "p", "panel__text", "O forno estala, quentinho. O que vamos fazer?"),
      ...this.helpRows(),
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
    items.push({ label: "Voltar às pizzas", onSelect: () => this.showQuick() });
    this.menu.onCancel = () => this.showQuick();
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

  /** Todas as receitas: as conhecidas abrem (mesmo faltando algo); as outras dizem como liberar. */
  private showRecipes(keep: boolean | number = false): void {
    this.page = "recipes";
    this.titleEl.textContent = "Receitas";
    const cards = this.oven.recipeCards();
    const orders = this.ordersByRecipe();
    this.menu.onCancel = () => this.showMain();
    this.menu.onFocus = (_item, index) => {
      const card = cards[index];
      if (card) this.paintCard(card, orders.get(card.id) ?? 0);
    };
    this.menu.setItems(
      cards.map((card, index) => ({
        label: card.name,
        mark: orders.has(card.id) ? "★" : undefined,
        detail: !card.known ? "bloqueada" : card.canMake > 0 ? `dá ${card.canMake}` : "falta",
        disabled: !card.known,
        reason: card.unlockHint,
        onSelect: () => this.showRecipe(card.id, index),
      })),
      keep,
    );
  }

  /** Cartão da receita na lista: como fazer, quantas dá e pedidos. */
  private paintCard(card: RecipeCard, ordered: number): void {
    const doc = this.o.doc;
    const rows: HTMLElement[] = [h(doc, "p", "panel__hint", `${card.profile}`)];
    if (ordered) rows.push(h(doc, "p", "panel__good", `★ ${ordered} cliente(s) pediram esta!`));
    rows.push(...this.howToRows(card.howTo));
    const preview = card.known ? this.oven.preview(card.id) : null;
    if (preview?.ok) {
      // GDD 11.3: o resultado aparece antes de confirmar.
      const stats = h(doc, "dl", "stats");
      for (const [label, value] of [
        ["Qualidade", `${preview.quality}`],
        ["Fatias", `${preview.slices}`],
      ] as const) {
        stats.append(h(doc, "dt", "", label), h(doc, "dd", "", value));
      }
      rows.push(stats);
      if (preview.effects) rows.push(h(doc, "p", "panel__hint", `Cada fatia: ${preview.effects}`));
    }
    if (!card.known) {
      rows.push(h(doc, "p", "panel__bad", `🔒 ${card.unlockHint ?? "Ainda bloqueada."}`));
    } else {
      rows.push(
        h(
          doc,
          "p",
          card.canMake > 0 ? "panel__good" : "panel__bad",
          card.canMake > 0
            ? `Dá para fazer ${card.canMake} agora. Enter para abrir.`
            : "Falta ingrediente: abra a receita para comprar o que falta.",
        ),
      );
    }
    this.side.replaceChildren(...rows);
  }

  /** "Como fazer": cada item da receita com ✔ (tem) ou ✗ (falta). */
  private howToRows(rows: HowToRow[]): HTMLElement[] {
    const doc = this.o.doc;
    const list = h(doc, "ul", "panel__list");
    for (const row of rows) {
      const li = h(doc, "li", "row");
      li.append(
        h(doc, "span", row.ok ? "panel__good" : "panel__bad", `${row.ok ? "✔" : "✗"} ${row.label}`),
        h(doc, "span", "row__detail", row.have),
      );
      list.append(li);
    }
    return [h(doc, "strong", "", "Como fazer:"), list];
  }

  private showRecipe(recipeId: string, listIndex = 0): void {
    this.page = "recipe";
    this.recipeId = recipeId;
    this.titleEl.textContent = this.text(`${recipeId}.name`);
    let first = true;
    const refresh = () => {
      const toppings = this.oven.toppingOptions();
      const preview = this.oven.preview(recipeId);
      const max = this.oven.maxCookable(recipeId);
      const plan = preview.ok ? null : this.oven.purchasePlan(recipeId);
      this.paintPreview(recipeId, preview);
      const items: MenuItem[] = [
        {
          label: "Preparar 1",
          disabled: !preview.ok,
          reason: preview.error,
          onSelect: () => {
            const result = this.oven.cook(recipeId);
            this.note(result.message, result.ok);
            refresh();
          },
        },
      ];
      if (max > 1) {
        items.push({
          label: `Preparar o máximo (${max})`,
          onSelect: () => {
            const result = this.oven.cookMany(recipeId, max);
            this.note(result.message, result.made > 0);
            refresh();
          },
        });
      }
      if (plan && !plan.unavailable) {
        items.push({
          label: "Comprar o que falta e preparar",
          detail: `${plan.cost} moedas`,
          disabled: this.o.session.coins < plan.cost,
          reason: `Moedas insuficientes: custa ${plan.cost}, você tem ${this.o.session.coins}.`,
          onSelect: () => {
            const result = this.oven.buyMissingAndCook(recipeId);
            this.note(result.message, result.ok);
            refresh();
          },
        });
      }
      items.push(
        ...toppings.map((t) => ({
          label: t.name,
          mark: t.selected ? "✔" : "+",
          detail: `×${t.stock} ${t.effect}`,
          onSelect: () => {
            this.oven.toggleTopping(t.id);
            refresh();
          },
        })),
        { label: "Voltar", onSelect: () => this.backToRecipes(listIndex) },
      );
      // Ao abrir, o cursor começa na primeira opção que dá para usar (ex.: "Comprar o que falta").
      const start = first
        ? Math.max(
            0,
            items.findIndex((i) => !i.disabled),
          )
        : true;
      first = false;
      this.menu.setItems(items, start);
    };
    this.menu.onFocus = undefined;
    this.menu.onCancel = () => this.backToRecipes(listIndex);
    this.menu.setItems([]);
    refresh();
  }

  private backToRecipes(index = 0): void {
    this.oven.toppings.clear();
    this.showRecipes(index);
  }

  /** Pré-visualização (GDD 11.3: sempre mostrar o efeito antes de confirmar) + como fazer. */
  private paintPreview(recipeId: string, preview?: PreviewView): void {
    const doc = this.o.doc;
    const p = preview ?? this.oven.preview(recipeId);
    const rows: HTMLElement[] = [...this.howToRows(this.oven.howTo(recipeId))];
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
        `Pizzas na mochila: ${pizzas}/${this.o.content.balance.maxPizzas} · Moedas: ${this.o.session.coins}`,
      ),
    );
    this.side.replaceChildren(...rows);
  }

  update(dt = 16): void {
    if (this.done) return;
    if (this.cooking) {
      // Enquanto a pizza está no forno, a tela só espera.
      this.cooking.leftMs -= dt;
      if (this.cooking.leftMs <= 0) this.finishCooking();
      else this.paintCooking();
      return;
    }
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
