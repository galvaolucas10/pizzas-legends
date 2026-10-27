import type { DialoguePort } from "../../game/events/EventRunner";

/** Velocidade "normal" de revelação do texto (GDD 10.5): letras por segundo. */
export const CHARS_PER_SECOND = 40;

/**
 * Caixa de diálogo em DOM (ARCHITECTURE 14): nome de quem fala e texto revelado letra a letra,
 * no relógio do jogo. Só exibe; quem decide avançar é o handler de `message`.
 */
export class DialogueBox implements DialoguePort {
  readonly element: HTMLElement;
  private readonly speakerEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly liveEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private fullText = "";
  private shown = 0;
  private elapsedMs = 0;

  constructor(
    doc: Document = document,
    private readonly charsPerSecond = CHARS_PER_SECOND,
  ) {
    this.element = el(doc, "div", "dialogue");
    this.element.hidden = true;
    this.speakerEl = el(doc, "div", "dialogue__speaker");
    this.textEl = el(doc, "p", "dialogue__text");
    this.textEl.setAttribute("aria-hidden", "true"); // o texto animado não é lido letra a letra
    this.liveEl = el(doc, "p", "visually-hidden");
    this.liveEl.setAttribute("aria-live", "polite"); // leitores de tela recebem a fala inteira
    this.hintEl = el(doc, "div", "dialogue__hint");
    this.hintEl.textContent = "▼";
    this.element.append(this.speakerEl, this.textEl, this.liveEl, this.hintEl);
  }

  get typing(): boolean {
    return this.shown < this.fullText.length;
  }

  get visibleText(): string {
    return this.fullText.slice(0, this.shown);
  }

  show(text: string, speaker?: string): void {
    this.fullText = text;
    this.shown = 0;
    this.elapsedMs = 0;
    this.speakerEl.textContent = speaker ?? "";
    this.speakerEl.hidden = !speaker;
    this.liveEl.textContent = speaker ? `${speaker}: ${text}` : text;
    this.element.hidden = false;
    this.paint();
  }

  update(dt: number): void {
    if (!this.typing) return;
    this.elapsedMs += dt;
    const target = Math.min(
      this.fullText.length,
      Math.floor((this.elapsedMs / 1000) * this.charsPerSecond),
    );
    if (target !== this.shown) {
      this.shown = target;
      this.paint();
    }
  }

  complete(): void {
    this.shown = this.fullText.length;
    this.paint();
  }

  hide(): void {
    this.element.hidden = true;
    this.fullText = "";
    this.shown = 0;
  }

  private paint(): void {
    this.textEl.textContent = this.visibleText;
    this.hintEl.hidden = this.typing;
  }
}

function el(doc: Document, tag: string, className: string): HTMLElement {
  const element = doc.createElement(tag);
  element.className = className;
  return element;
}
