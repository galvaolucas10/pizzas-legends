import { Menu, type UiInput } from "../components/Menu";
import { h } from "../dom";

export type ControlMode = "computador" | "celular";

const HELP: Record<ControlMode, string[]> = {
  computador: [
    "Andar: setas ou W A S D",
    "Falar / escolher: Enter, E ou Espaço",
    "Voltar: Esc ou Backspace",
    "Menu: Tab ou M",
    "Mouse: clique no chão para andar; clique em pessoas, balcão e opções",
  ],
  celular: [
    "Andar: setas na tela (canto esquerdo) ou toque no chão",
    "A: falar / escolher",
    "B: voltar",
    "☰ Menu: abre o menu · 📱 Pedidos: entregas",
    "Toque direto nas opções dos menus e nas falas",
  ],
};

export interface ControlsScreenOptions {
  doc: Document;
  root: HTMLElement;
  input: UiInput;
  current: ControlMode;
  /** Guarda a escolha e ajusta os controles na tela. */
  choose(mode: ControlMode): void;
}

/** Escolha do jeito de jogar (computador ou celular) e os controles de cada um. */
export class ControlsScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly menu: Menu;
  private readonly side: HTMLElement;
  private readonly note: HTMLElement;

  constructor(private readonly o: ControlsScreenOptions) {
    const doc = o.doc;
    this.root = h(doc, "div", "overlay");
    const box = h(doc, "div", "panel oven");
    const columns = h(doc, "div", "oven__columns");
    this.menu = new Menu(doc, "oven__menu");
    this.side = h(doc, "div", "oven__side");
    columns.append(this.menu.element, this.side);
    this.note = h(doc, "p", "panel__note");
    box.append(
      h(doc, "h2", "panel__title", "🎮 Controles"),
      columns,
      this.note,
      h(doc, "p", "panel__hint", "Escolha onde você vai jogar."),
    );
    this.root.append(box);
    o.root.append(this.root);
    const modes: ControlMode[] = ["computador", "celular"];
    this.menu.onFocus = (_item, index) => {
      const mode = modes[index];
      if (mode) this.paint(mode);
    };
    this.menu.onCancel = () => (this.done = true);
    this.menu.setItems(this.items(modes, o.current), modes.indexOf(o.current));
  }

  private items(modes: ControlMode[], current: ControlMode) {
    return [
      ...modes.map((mode) => ({
        label: mode === "computador" ? "💻 Computador" : "📱 Celular",
        mark: mode === current ? "✔" : undefined,
        onSelect: () => {
          this.o.choose(mode);
          this.note.textContent = `Pronto: controles de ${mode} ativados.`;
          this.note.classList.add("panel__good");
          this.menu.setItems(this.items(modes, mode), modes.indexOf(mode));
        },
      })),
      { label: "Fechar", onSelect: () => (this.done = true) },
    ];
  }

  private paint(mode: ControlMode): void {
    const doc = this.o.doc;
    const list = h(doc, "ul", "panel__list");
    for (const line of HELP[mode]) list.append(h(doc, "li", "row", line));
    this.side.replaceChildren(
      h(
        doc,
        "strong",
        "",
        mode === "computador" ? "Controles do computador" : "Controles do celular",
      ),
      list,
    );
  }

  update(): void {
    if (this.done) return;
    this.menu.handle(this.o.input);
  }

  destroy(): void {
    this.root.remove();
  }
}
