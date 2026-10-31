import type { UiInput } from "../components/Menu";
import { h } from "../dom";
import type { ControlMode } from "./ControlsScreen";

interface Page {
  icon: string;
  title: string;
  lines: string[];
}

function pages(mode: ControlMode, name: string): Page[] {
  const phone = mode === "celular";
  return [
    {
      icon: "🍕",
      title: `Bem-vindo, ${name}!`,
      lines: [
        "Você é aprendiz na pizzaria do Mestre.",
        "Faça pizzas, atenda os clientes e vença os desafios.",
        "Meta: virar Mestre Pizzaiolo e depois a Lenda do Restaurante!",
      ],
    },
    {
      icon: "🚶",
      title: "Como andar",
      lines: phone
        ? [
            "Use as setas no canto esquerdo da tela.",
            "Ou toque no chão: o aprendiz anda até lá sozinho.",
            "Passe pelas portas para trocar de lugar.",
          ]
        : [
            "Use as setas do teclado ou W A S D.",
            "Ou clique no chão: o aprendiz anda até lá sozinho.",
            "Passe pelas portas para trocar de lugar.",
          ],
    },
    {
      icon: "👆",
      title: "Onde apertar",
      lines: phone
        ? [
            "A: falar com as pessoas e escolher.",
            "B: voltar.",
            "☰ Menu: pizzas, ingredientes, missões e este manual.",
            "📱 Pedidos: entregas de moto.",
          ]
        : [
            "Enter, E ou Espaço: falar com as pessoas e escolher.",
            "Esc ou Backspace: voltar.",
            "Tab ou M: abre o menu (pizzas, missões e este manual).",
            "Mouse: clique em pessoas, balcões e opções.",
          ],
    },
    {
      icon: "🧑‍🍳",
      title: "Fazendo pizza",
      lines: [
        "1. Compre ingredientes com a Lia, no Mercadinho.",
        "2. Vá ao forno ou ao balcão e escolha a pizza.",
        "3. A foto mostra como a pizza vai ficar.",
        "4. Entregue aos clientes no salão e ganhe moedas.",
      ],
    },
    {
      icon: "🧭",
      title: "Para não se perder",
      lines: [
        "Siga as setas no chão: elas levam ao próximo passo.",
        "O objetivo aparece no alto da tela.",
        "Ao entrar num lugar, o nome dele aparece na tela.",
        "A cada nível você ganha um avental novo! 🎽",
      ],
    },
  ];
}

export interface ManualScreenOptions {
  doc: Document;
  root: HTMLElement;
  input: UiInput;
  mode: ControlMode;
  name: string;
}

/** Manual do começo do jogo (e no menu): como jogar, onde apertar e como andar. */
export class ManualScreen {
  done = false;
  private readonly root: HTMLElement;
  private readonly pageEl: HTMLElement;
  private readonly dots: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly pages: Page[];
  private index = 0;

  constructor(private readonly o: ManualScreenOptions) {
    const doc = o.doc;
    this.pages = pages(o.mode, o.name);
    this.root = h(doc, "div", "overlay");
    const box = h(doc, "div", "panel manual");
    this.pageEl = h(doc, "div", "manual__page");
    this.dots = h(doc, "p", "manual__dots");
    this.prevButton = h(doc, "button", "title__button title__button--back", "◀ Voltar");
    this.nextButton = h(doc, "button", "title__button", "Próximo ▶");
    this.prevButton.type = this.nextButton.type = "button";
    this.prevButton.addEventListener("click", () => this.go(-1));
    this.nextButton.addEventListener("click", () => this.go(1));
    const buttons = h(doc, "div", "title__buttons");
    buttons.append(this.prevButton, this.nextButton);
    box.append(
      h(doc, "h2", "panel__title", "📖 Como jogar"),
      this.pageEl,
      this.dots,
      buttons,
      h(doc, "p", "panel__hint", "← → trocar página · Enter próximo · Esc fechar"),
    );
    this.root.append(box);
    o.root.append(this.root);
    this.paint();
  }

  private go(step: number): void {
    const next = this.index + step;
    if (next >= this.pages.length) {
      this.done = true;
      return;
    }
    this.index = Math.max(0, next);
    this.paint();
  }

  private paint(): void {
    const doc = this.o.doc;
    const page = this.pages[this.index]!;
    const list = h(doc, "ul", "panel__list");
    for (const line of page.lines) list.append(h(doc, "li", "row", line));
    this.pageEl.replaceChildren(
      h(doc, "div", "manual__icon", page.icon),
      h(doc, "strong", "manual__title", page.title),
      list,
    );
    this.dots.textContent = this.pages.map((_, i) => (i === this.index ? "●" : "○")).join(" ");
    this.prevButton.disabled = this.index === 0;
    this.nextButton.textContent =
      this.index === this.pages.length - 1 ? "Bora jogar! ✔" : "Próximo ▶";
  }

  update(): void {
    if (this.done) return;
    const input = this.o.input;
    if (input.wasPressed("right") || input.wasPressed("confirm")) {
      input.consume("right");
      input.consume("confirm");
      this.go(1);
    } else if (input.wasPressed("left")) {
      input.consume("left");
      this.go(-1);
    } else if (input.wasPressed("cancel") || input.wasPressed("menu")) {
      input.consume("cancel");
      input.consume("menu");
      this.done = true;
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
