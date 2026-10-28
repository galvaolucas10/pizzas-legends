/** Ações que as telas leem (compatível com o ActionReader do motor, sem importá-lo). */
export type UiAction = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "menu";

export interface UiInput {
  readonly active: boolean;
  wasPressed(action: UiAction): boolean;
  consume(action: UiAction): void;
}

export interface MenuItem {
  label: string;
  /** Texto à direita (quantidade, dano previsto...). */
  detail?: string;
  /** Marca visual extra (ex.: "✔" num item escolhido). */
  mark?: string;
  disabled?: boolean;
  /** Explicação mostrada quando o item está desabilitado e é escolhido (GDD 11.3). */
  reason?: string;
  onSelect?(): void;
}

/**
 * Lista navegável em DOM: ↑/↓ movem, confirmar escolhe, cancelar volta.
 * Não lê o teclado por conta própria: a cena chama `handle(input)` a cada tick.
 */
export class Menu {
  readonly element: HTMLElement;
  private items: MenuItem[] = [];
  private index = 0;
  /** Chamado quando o foco muda (ex.: atualizar a prévia). */
  onFocus?: (item: MenuItem, index: number) => void;
  /** Cancelar; sem ele, cancelar não faz nada. */
  onCancel?: () => void;
  /** Item desabilitado escolhido: mostra o motivo. */
  onRefuse?: (reason: string) => void;

  constructor(
    private readonly doc: Document,
    className = "",
  ) {
    this.element = doc.createElement("ul");
    this.element.className = `menu ${className}`.trim();
    this.element.setAttribute("role", "menu");
  }

  get focused(): MenuItem | undefined {
    return this.items[this.index];
  }

  get focusIndex(): number {
    return this.index;
  }

  /**
   * Troca os itens. `keep: true` mantém o foco na mesma posição; um número põe o foco
   * nesse item (limitado ao tamanho da lista).
   */
  setItems(items: MenuItem[], keep: boolean | number = false): void {
    this.items = items;
    const target = typeof keep === "number" ? keep : keep ? this.index : 0;
    this.index = Math.max(0, Math.min(target, items.length - 1));
    this.paint();
    this.notifyFocus();
  }

  /** Processa a entrada deste tick. Devolve true se algo aconteceu. */
  handle(input: UiInput): boolean {
    if (input.wasPressed("up")) return this.move(-1);
    if (input.wasPressed("down")) return this.move(1);
    if (input.wasPressed("confirm")) {
      input.consume("confirm");
      const item = this.focused;
      if (!item) return false;
      if (item.disabled) {
        if (item.reason) this.onRefuse?.(item.reason);
        return true;
      }
      item.onSelect?.();
      return true;
    }
    if (input.wasPressed("cancel") && this.onCancel) {
      input.consume("cancel");
      this.onCancel();
      return true;
    }
    return false;
  }

  private move(delta: number): boolean {
    if (this.items.length === 0) return false;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.paint();
    this.notifyFocus();
    return true;
  }

  private notifyFocus(): void {
    const item = this.focused;
    if (item) this.onFocus?.(item, this.index);
  }

  private paint(): void {
    const rows = this.items.map((item, i) => {
      const li = this.doc.createElement("li");
      li.className = [
        "menu__item",
        i === this.index ? "is-focused" : "",
        item.disabled ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ");
      li.setAttribute("role", "menuitem");
      if (i === this.index) li.setAttribute("aria-current", "true");
      const label = this.doc.createElement("span");
      label.className = "menu__label";
      label.textContent = `${i === this.index ? "▶ " : "  "}${item.mark ? `${item.mark} ` : ""}${item.label}`;
      li.append(label);
      if (item.detail) {
        const detail = this.doc.createElement("span");
        detail.className = "menu__detail";
        detail.textContent = item.detail;
        li.append(detail);
      }
      return li;
    });
    this.element.replaceChildren(...rows);
  }
}
