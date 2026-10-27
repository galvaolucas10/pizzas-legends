import type { ContentRegistry } from "../../content/registry";
import { PROFILE_NAMES } from "../../game/battle/BattleController";
import type { GameSession } from "../../game/GameSession";
import { Menu, type UiInput } from "../components/Menu";
import { h } from "../dom";

export interface PauseMenuOptions {
  doc: Document;
  root: HTMLElement;
  session: GameSession;
  content: ContentRegistry;
  input: UiInput;
  /** URL de um ícone do manifesto (ou null). */
  iconUrl(assetId: string): string | null;
}

const QUEST_STATUS: Record<string, string> = {
  active: "Em andamento",
  completed: "Concluída",
  rewarded: "Concluída",
  available: "Disponível",
  unavailable: "Bloqueada",
};

/** Menu de pausa (F1-09, GDD 11.2): mochila (pizzas e ingredientes), missões e status. */
export class PauseMenu {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly titleEl: HTMLElement;
  private readonly side: HTMLElement;

  constructor(private readonly o: PauseMenuOptions) {
    const doc = o.doc;
    this.root = h(doc, "div", "overlay");
    const box = h(doc, "div", "panel pause");
    this.titleEl = h(doc, "h2", "panel__title");
    const columns = h(doc, "div", "oven__columns");
    this.menu = new Menu(doc, "oven__menu");
    this.side = h(doc, "div", "oven__side");
    columns.append(this.menu.element, this.side);
    box.append(
      this.titleEl,
      columns,
      h(doc, "p", "panel__hint", "↑↓ escolher · Enter abrir · Esc/Tab fechar"),
    );
    this.root.append(box);
    o.root.append(this.root);
    this.showMain();
  }

  private text(key: string): string {
    return this.o.content.locale[key] ?? key;
  }

  private showMain(): void {
    this.titleEl.textContent = "Menu";
    const pages = [
      { label: "Pizzas", paint: () => this.paintPizzas() },
      { label: "Ingredientes", paint: () => this.paintIngredients() },
      { label: "Missões (guia)", paint: () => this.paintQuests() },
      { label: "Status", paint: () => this.paintStatus() },
    ];
    this.menu.onFocus = (_item, index) => pages[index]?.paint();
    this.menu.onCancel = () => (this.done = true);
    this.menu.setItems([
      ...pages.map((p) => ({ label: p.label })),
      { label: "Fechar", onSelect: () => (this.done = true) },
    ]);
  }

  private paintPizzas(): void {
    const doc = this.o.doc;
    const pizzas = this.o.session.state.inventory.pizzas;
    if (pizzas.length === 0) {
      this.side.replaceChildren(
        h(doc, "p", "panel__text", "Nenhuma pizza na mochila."),
        h(doc, "p", "panel__hint", "Prepare pizzas em um forno."),
      );
      return;
    }
    const list = h(doc, "ul", "panel__list");
    for (const p of pizzas) {
      const li = h(doc, "li", "row");
      li.append(
        h(doc, "span", "", `${this.text(`${p.recipeId}.name`)} Q${p.quality}`),
        h(
          doc,
          "span",
          "row__detail",
          `${PROFILE_NAMES[p.profile]} · ${p.slicesLeft}/${p.maxSlices} fatias`,
        ),
      );
      list.append(li);
    }
    this.side.replaceChildren(
      list,
      h(doc, "p", "panel__hint", `${pizzas.length}/${this.o.content.balance.maxPizzas} pizzas`),
    );
  }

  private paintIngredients(): void {
    const doc = this.o.doc;
    const stock = Object.entries(this.o.session.state.inventory.ingredients).filter(
      ([, n]) => n > 0,
    );
    if (stock.length === 0) {
      this.side.replaceChildren(h(doc, "p", "panel__text", "Mochila vazia."));
      return;
    }
    const list = h(doc, "ul", "panel__list");
    for (const [id, count] of stock) {
      const li = h(doc, "li", "row");
      const name = h(doc, "span", "row__name");
      const url = this.o.iconUrl(`icon.${id.replace(/^ing\./, "ing_")}`);
      if (url) {
        const img = h(doc, "img", "icon");
        img.src = url;
        img.alt = "";
        name.append(img);
      }
      name.append(doc.createTextNode(this.text(`${id}.name`)));
      li.append(name, h(doc, "span", "row__detail", `×${count}`));
      list.append(li);
    }
    this.side.replaceChildren(list);
  }

  private paintQuests(): void {
    const doc = this.o.doc;
    const { session, content } = this.o;
    const list = h(doc, "ul", "panel__list");
    for (const quest of Object.values(content.quests)) {
      const status = session.questStatus(quest.id);
      if (status === "unavailable") continue;
      const li = h(doc, "li", "quest");
      li.append(
        h(doc, "strong", "", this.text(`${quest.id}.name`)),
        h(doc, "span", "row__detail", ` · ${QUEST_STATUS[status] ?? status}`),
      );
      const step = session.state.quests[quest.id]?.step ?? 0;
      const objective = status === "active" ? quest.steps[step]?.objectiveKey : undefined;
      if (objective) {
        li.append(h(doc, "p", "panel__text", this.text(objective)));
        const guide = this.o.content.locale[`${objective}.guia`];
        if (guide) li.append(h(doc, "p", "panel__hint", guide));
      }
      list.append(li);
    }
    this.side.replaceChildren(
      list.childElementCount ? list : h(doc, "p", "panel__text", "Nenhuma missão ainda."),
    );
  }

  private paintStatus(): void {
    const doc = this.o.doc;
    const { session } = this.o;
    const char = session.state.characters[0]!;
    const next = session.xpToNextLevel;
    const stats = h(doc, "dl", "stats");
    for (const [label, value] of [
      ["Nome", char.name],
      ["Nível", `${char.level}`],
      ["PV", `${session.maxHp}`],
      ["XP", `${char.xp}${next !== null ? ` (faltam ${next})` : ""}`],
      ["Receitas", `${char.knownRecipes.length}`],
      ["Pontos de habilidade", `${char.skillPoints}`],
    ] as const) {
      stats.append(h(doc, "dt", "", label), h(doc, "dd", "", value));
    }
    const minutes = Math.floor(session.state.stats.playTimeMs / 60000);
    this.side.replaceChildren(stats, h(doc, "p", "panel__hint", `Tempo de jogo: ${minutes} min`));
  }

  update(): void {
    if (this.done) return;
    const input = this.o.input;
    if (input.wasPressed("menu")) {
      input.consume("menu");
      this.done = true;
      return;
    }
    this.menu.handle(input);
  }

  destroy(): void {
    this.root.remove();
  }
}
