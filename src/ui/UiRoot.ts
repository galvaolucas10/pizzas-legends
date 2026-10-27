import { DialogueBox } from "./components/DialogueBox";

/**
 * Camada de interface sobre o canvas (ARCHITECTURE 14). Acompanha o tamanho e a escala do canvas;
 * a variável CSS --px (tamanho de 1 pixel de jogo) mantém as medidas no estilo pixel art.
 */
export class UiRoot {
  readonly element: HTMLElement;
  readonly dialogue: DialogueBox;

  constructor(container: HTMLElement) {
    const doc = container.ownerDocument;
    this.element = doc.createElement("div");
    this.element.className = "ui-root";
    this.dialogue = new DialogueBox(doc);
    this.element.append(this.dialogue.element);
    container.append(this.element);
  }

  destroy(): void {
    this.element.remove();
  }
}
