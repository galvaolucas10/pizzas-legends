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
  onNewGame(name: string): void;
  onContinue(): void;
}

/** Tela de título (F1-18, GDD 11.2): Novo jogo (com nome) e Continuar. */
export class TitleScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly body: HTMLElement;
  private naming: HTMLInputElement | null = null;

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

  private askName(): void {
    const doc = this.o.doc;
    const field = h(doc, "input", "title__input");
    field.type = "text";
    field.maxLength = this.o.maxNameLength;
    field.value = "Nico";
    field.setAttribute("aria-label", "Nome do aprendiz");
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.done = true;
        this.o.onNewGame(field.value.trim() || "Nico");
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.showMenu();
      }
    });
    this.naming = field;
    this.body.replaceChildren(
      h(doc, "p", "panel__text", "Qual é o nome do aprendiz?"),
      field,
      h(doc, "p", "panel__hint", "Enter confirma · Esc volta"),
    );
    field.focus();
    field.select();
  }

  update(): void {
    if (this.done || this.naming) return; // digitando: o campo cuida do teclado
    this.menu.handle(this.o.input);
  }

  destroy(): void {
    this.root.remove();
  }
}
