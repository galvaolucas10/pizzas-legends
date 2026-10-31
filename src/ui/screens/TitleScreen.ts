import { Menu, type UiInput } from "../components/Menu";
import { h } from "../dom";

export interface SaveInfo {
  name: string;
  level: number;
  playTimeMs: number;
  /** Texto do objetivo atual (já traduzido), se houver. */
  objective: string | null;
}

export type AvatarPart = "skin" | "hair" | "face";

export interface TitleScreenOptions {
  doc: Document;
  root: HTMLElement;
  input: UiInput;
  /** Save mais recente, se existir. */
  save: SaveInfo | null;
  maxNameLength: number;
  /** Montar o avatar no novo jogo: nomes de cada opção e o retrato do resultado. */
  avatar: {
    parts: { key: AvatarPart; label: string; options: string[] }[];
    portrait(avatar: Record<AvatarPart, number>): HTMLCanvasElement;
  };
  onNewGame(name: string, avatar: Record<AvatarPart, number>): void;
  onContinue(): void;
}

/** Tela de título (F1-18, GDD 11.2): Novo jogo (com nome) e Continuar. */
export class TitleScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly body: HTMLElement;
  private naming: HTMLInputElement | null = null;
  /** Montagem do avatar aberta: nome digitado, escolhas e a linha em foco. */
  private picking: {
    name: string;
    row: number;
    avatar: Record<AvatarPart, number>;
    rows: HTMLElement[];
    values: HTMLElement[];
    preview: HTMLElement;
  } | null = null;

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

  /** Segunda etapa do novo jogo: montar o avatar (pele, cabelo e rostinho). */
  private pickLook(
    name: string,
    avatar: Record<AvatarPart, number> = { skin: 0, hair: 0, face: 0 },
  ): void {
    const doc = this.o.doc;
    this.naming = null;
    const preview = h(doc, "div", "title__look is-focused");
    const editor = h(doc, "div", "avatar");
    const rows: HTMLElement[] = [];
    const values: HTMLElement[] = [];
    this.o.avatar.parts.forEach((part, i) => {
      const row = h(doc, "div", "avatar__row");
      const prev = h(doc, "button", "avatar__arrow", "◀");
      const next = h(doc, "button", "avatar__arrow", "▶");
      prev.type = next.type = "button";
      prev.setAttribute("aria-label", `${part.label}: anterior`);
      next.setAttribute("aria-label", `${part.label}: próximo`);
      prev.addEventListener("click", () => this.change(i, -1));
      next.addEventListener("click", () => this.change(i, 1));
      const value = h(doc, "span", "avatar__value");
      row.append(h(doc, "span", "avatar__label", part.label), prev, value, next);
      row.addEventListener("pointerenter", () => this.focusRow(i));
      rows.push(row);
      values.push(value);
    });
    editor.append(...rows);
    const layout = h(doc, "div", "avatar__layout");
    layout.append(preview, editor);
    const startButton = h(doc, "button", "title__button", "Começar");
    startButton.type = "button";
    startButton.addEventListener("click", () => this.confirmLook());
    const backButton = h(doc, "button", "title__button title__button--back", "Voltar");
    backButton.type = "button";
    backButton.addEventListener("click", () => this.askName(name));
    const buttons = h(doc, "div", "title__buttons");
    buttons.append(startButton, backButton);
    this.body.replaceChildren(
      h(doc, "p", "panel__text", `Monte o visual de ${name}:`),
      layout,
      buttons,
      h(doc, "p", "panel__hint", "↑↓ escolher · ← → trocar · Enter começar · Esc volta"),
    );
    this.picking = { name, row: 0, avatar: { ...avatar }, rows, values, preview };
    this.paintAvatar();
  }

  private focusRow(row: number): void {
    if (!this.picking) return;
    this.picking.row = row;
    this.paintAvatar();
  }

  /** Troca a opção de uma parte (pele, cabelo ou rosto) para a anterior/próxima. */
  private change(row: number, step: number): void {
    const p = this.picking;
    const part = this.o.avatar.parts[row];
    if (!p || !part) return;
    const n = part.options.length;
    p.row = row;
    p.avatar[part.key] = (p.avatar[part.key] + step + n) % n;
    this.paintAvatar();
  }

  private paintAvatar(): void {
    const p = this.picking;
    if (!p) return;
    this.o.avatar.parts.forEach((part, i) => {
      p.rows[i]?.classList.toggle("is-focused", i === p.row);
      const value = p.values[i];
      if (value) value.textContent = part.options[p.avatar[part.key]] ?? "";
    });
    p.preview.replaceChildren(this.o.avatar.portrait(p.avatar));
  }

  private confirmLook(): void {
    const p = this.picking;
    if (this.done || !p) return;
    this.done = true;
    this.o.onNewGame(p.name, { ...p.avatar });
  }

  update(): void {
    if (this.done || this.naming) return; // digitando: o campo cuida do teclado
    const p = this.picking;
    if (p) {
      const input = this.o.input;
      const n = this.o.avatar.parts.length;
      if (input.wasPressed("up")) {
        input.consume("up");
        this.focusRow((p.row + n - 1) % n);
      } else if (input.wasPressed("down")) {
        input.consume("down");
        this.focusRow((p.row + 1) % n);
      } else if (input.wasPressed("left")) {
        input.consume("left");
        this.change(p.row, -1);
      } else if (input.wasPressed("right")) {
        input.consume("right");
        this.change(p.row, 1);
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
