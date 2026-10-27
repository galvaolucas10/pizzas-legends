/** Ações do jogo (ARCHITECTURE 9). As telas leem ações, nunca teclas. */
export type Action = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "menu" | "debug";
export type Direction = "up" | "down" | "left" | "right";
export type InputContext = "world" | "dialogue" | "menu" | "battle" | "transition";

const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

function isDirection(action: Action): action is Direction {
  return (DIRECTIONS as readonly string[]).includes(action);
}

/** Visão das ações para um contexto: fica "muda" quando o contexto não está no topo da pilha. */
export interface ActionReader {
  readonly active: boolean;
  isHeld(action: Action): boolean;
  wasPressed(action: Action): boolean;
  /** Marca o pressionamento deste tick como usado: ninguém mais o vê (ex.: o confirmar que fecha um diálogo). */
  consume(action: Action): void;
  /** Direção mais recente mantida (ou tocada neste tick), ou null. */
  readonly direction: Direction | null;
}

/**
 * Traduz pressionamentos (vindos de uma fonte, ex.: teclado) em ações por tick.
 * - `poll()` roda uma vez por tick e congela o estado daquele tick.
 * - Pressionamentos entre dois ticks ficam em buffer: um toque rápido não se perde.
 * - `releaseAll()` (no `blur`) evita o personagem "andando sozinho" após um Alt+Tab.
 */
export class InputManager {
  /** Ações mantidas agora, na ordem do pressionamento mais recente primeiro. */
  private held: Action[] = [];
  /** Ações pressionadas desde o último poll (buffer). */
  private pending = new Set<Action>();
  /** Ações pressionadas no tick atual. */
  private pressed = new Set<Action>();
  /** Ações mantidas no tick atual (inclui toques que começaram e terminaram entre ticks). */
  private heldThisTick: Action[] = [];
  private contexts: InputContext[] = ["world"];

  /** Chamado pela fonte de entrada quando uma ação começa. */
  press(action: Action): void {
    if (this.held.includes(action)) return; // repetição automática do teclado
    this.held.unshift(action);
    this.pending.add(action);
  }

  /** Chamado pela fonte de entrada quando uma ação termina. */
  release(action: Action): void {
    this.held = this.held.filter((a) => a !== action);
  }

  releaseAll(): void {
    this.held = [];
    this.pending.clear();
  }

  /** Congela o estado das ações para este tick. */
  poll(): void {
    this.pressed = this.pending;
    this.pending = new Set();
    const tapped = [...this.pressed].filter((a) => !this.held.includes(a));
    this.heldThisTick = [...this.held, ...tapped];
  }

  get activeContext(): InputContext {
    return this.contexts[this.contexts.length - 1] ?? "world";
  }

  pushContext(context: InputContext): void {
    this.contexts.push(context);
  }

  /** Remove o contexto do topo; se ele não estiver no topo, remove a ocorrência mais recente. */
  popContext(context: InputContext): void {
    const index = this.contexts.lastIndexOf(context);
    if (index > 0) this.contexts.splice(index, 1);
  }

  isHeld(action: Action): boolean {
    return this.heldThisTick.includes(action);
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  consume(action: Action): void {
    this.pressed.delete(action);
  }

  get direction(): Direction | null {
    return this.heldThisTick.find(isDirection) ?? null;
  }

  /** Leitor que só responde quando `context` é o contexto ativo. */
  reader(context: InputContext): ActionReader {
    return new ContextReader(this, context);
  }
}

class ContextReader implements ActionReader {
  constructor(
    private readonly input: InputManager,
    private readonly context: InputContext,
  ) {}

  get active(): boolean {
    return this.input.activeContext === this.context;
  }

  isHeld(action: Action): boolean {
    return this.active && this.input.isHeld(action);
  }

  wasPressed(action: Action): boolean {
    return this.active && this.input.wasPressed(action);
  }

  consume(action: Action): void {
    if (this.active) this.input.consume(action);
  }

  get direction(): Direction | null {
    return this.active ? this.input.direction : null;
  }
}
