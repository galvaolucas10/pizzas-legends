import { Menu, type UiInput } from "../components/Menu";
import { h } from "../dom";

export interface SaveInfo {
  name: string;
  level: number;
  playTimeMs: number;
  /** Texto do objetivo atual (já traduzido), se houver. */
  objective: string | null;
}

export interface TitleScreenOptions {
  doc: Document;
  root: HTMLElement;
  input: UiInput;
  /** Save mais recente, se existir. */
  save: SaveInfo | null;
  maxNameLength: number;
  /** Personagens para escolher no novo jogo: nome e retrato. */
  looks: { name: string; portrait: HTMLCanvasElement }[];
  onNewGame(name: string, look: number): void;
  onContinue(): void;
}

/** Tela de título (F1-18, GDD 11.2): Novo jogo (com nome) e Continuar. */
export class TitleScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly body: HTMLElement;
  private naming: HTMLInputElement | null = null;
  /** Escolha de personagem aberta: nome digitado e o visual em foco. */
  private picking: { name: string; index: number; cards: HTMLElement[] } | null = null;

  constructor(private readonly o: TitleScreenOptions) {
    const doc = o.doc;
    this.root = h(doc, "div", "title");
    const logo = h(doc, "h1", "title__logo");
    logo.append(
      h(doc, "span", "title__pizza", "Pizza"),
      h(doc, "span", "title__legends", "Legends"),
    );
    this.body = h(doc, "div", "title__body panel");
    this.menu = new Menu(doc, "title__menu");
    this.root.append(
      logo,
      this.body,
      h(doc, "p", "title__hint", "Setas para escolher · Enter para confirmar"),
    );
    o.root.append(this.root);
    this.showMenu();
  }

  private showMenu(): void {
    const doc = this.o.doc;
    const save = this.o.save;
    this.naming = null;
    this.picking = null;
    const children: HTMLElement[] = [this.menu.element];
    if (save) {
      const minutes = Math.floor(save.playTimeMs / 60000);
      children.push(
        h(
          doc,
          "p",
          "panel__hint",
          `Continuar: ${save.name} · Nv ${save.level} · ${minutes} min` +
            (save.objective ? `\n${save.objective}` : ""),
        ),
      );
    }
    this.body.replaceChildren(...children);
    this.menu.setItems([
      ...(save ? [{ label: "Continuar", onSelect: () => this.continueGame() }] : []),
      { label: "Novo jogo", onSelect: () => this.askName() },
    ]);
  }

  private continueGame(): void {
    this.done = true;
    this.o.onContinue();
  }

  private askName(name = "Nico"): void {
    this.picking = null;
    const doc = this.o.doc;
    const field = h(doc, "input", "title__input");
    field.type = "text";
    field.maxLength = this.o.maxNameLength;
    field.value = name;
    field.setAttribute("aria-label", "Nome do aprendiz");
    const start = () => {
      if (this.done) return;
      this.pickLook(field.value.trim() || "Nico");
    };
    const startButton = h(doc, "button", "title__button", "Próximo");
    startButton.type = "button";
    startButton.addEventListener("click", start);
    const backButton = h(doc, "button", "title__button title__button--back", "Voltar");
    backButton.type = "button";
    backButton.addEventListener("click", () => this.showMenu());
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        start();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.showMenu();
      }
    });
    this.naming = field;
    this.body.replaceChildren(
      h(doc, "p", "panel__text", "Qual é o nome do aprendiz?"),
      field,
      h(doc, "div", "title__buttons"),
      h(doc, "p", "panel__hint", "Enter confirma · Esc volta"),
    );
    this.body.querySelector(".title__buttons")?.append(startButton, backButton);
    field.focus();
    field.select();
  }

  /** Segunda etapa do novo jogo: escolher um dos personagens. */
  private pickLook(name: string, index = 0): void {
    const doc = this.o.doc;
    this.naming = null;
    const row = h(doc, "div", "title__looks");
    const label = h(doc, "p", "panel__text title__look-name");
    const cards = this.o.looks.map((look, i) => {
      const card = h(doc, "button", "title__look");
      card.type = "button";
      card.setAttribute("aria-label", look.name);
      card.append(look.portrait);
      card.addEventListener("click", () => {
        if (this.picking?.index === i) this.confirmLook();
        else this.focusLook(i);
      });
      return card;
    });
    row.append(...cards);
    const startButton = h(doc, "button", "title__button", "Começar");
    startButton.type = "button";
    startButton.addEventListener("click", () => this.confirmLook());
    const backButton = h(doc, "button", "title__button title__button--back", "Voltar");
    backButton.type = "button";
    backButton.addEventListener("click", () => this.askName(name));
    const buttons = h(doc, "div", "title__buttons");
    buttons.append(startButton, backButton);
    this.body.replaceChildren(
      h(doc, "p", "panel__text", `Escolha o personagem de ${name}:`),
      row,
      label,
      buttons,
      h(doc, "p", "panel__hint", "← → escolher · Enter começar · Esc volta"),
    );
    this.picking = { name, index, cards };
    this.focusLook(index);
  }

  private focusLook(index: number): void {
    const p = this.picking;
    if (!p) return;
    p.index = index;
    p.cards.forEach((card, i) => card.classList.toggle("is-focused", i === index));
    const label = this.body.querySelector(".title__look-name");
    if (label) label.textContent = this.o.looks[index]?.name ?? "";
  }

  private confirmLook(): void {
    const p = this.picking;
    if (this.done || !p) return;
    this.done = true;
    this.o.onNewGame(p.name, p.index);
  }

  update(): void {
    if (this.done || this.naming) return; // digitando: o campo cuida do teclado
    const p = this.picking;
    if (p) {
      const input = this.o.input;
      const n = this.o.looks.length;
      if (input.wasPressed("left") || input.wasPressed("up")) {
        input.consume("left");
        input.consume("up");
        this.focusLook((p.index + n - 1) % n);
      } else if (input.wasPressed("right") || input.wasPressed("down")) {
        input.consume("right");
        input.consume("down");
        this.focusLook((p.index + 1) % n);
      } else if (input.wasPressed("confirm")) {
        input.consume("confirm");
        this.confirmLook();
      } else if (input.wasPressed("cancel")) {
        input.consume("cancel");
        this.askName(p.name);
      }
      return;
    }
    this.menu.handle(this.o.input);
  }

  destroy(): void {
    this.root.remove();
  }
}
