import type { GameEvent } from "../../content/schemas/events";
import type { InputManager } from "../../engine/input/InputManager";
import { EventRunner, type EventContext, type HandlerTable } from "./EventRunner";

/**
 * Coordena os executores (ARCHITECTURE 11.2):
 * - background: um `behaviorLoop` por entidade, repetido sem fim, pausado durante cenas;
 * - blocking: uma cena/diálogo por vez, com o contexto de entrada "dialogue" empilhado.
 */
export class EventSystem {
  private readonly background = new Map<string, EventRunner>();
  private blocking: EventRunner | null = null;
  private readonly queue: { events: readonly GameEvent[]; onDone?: () => void }[] = [];
  private onBlockingDone: (() => void) | undefined;

  constructor(
    private readonly handlers: HandlerTable,
    private readonly context: (mode: EventContext["mode"]) => EventContext,
    private readonly input: InputManager,
  ) {}

  get isBlocking(): boolean {
    return this.blocking !== null;
  }

  /** Runners em segundo plano, por entidade (para a depuração). */
  get backgroundRunners(): ReadonlyMap<string, EventRunner> {
    return this.background;
  }

  get blockingRunner(): EventRunner | null {
    return this.blocking;
  }

  /** Inicia (ou substitui) o behaviorLoop de uma entidade. */
  startBackground(entityId: string, events: readonly GameEvent[]): void {
    this.background.get(entityId)?.cancel();
    if (events.length === 0) return;
    this.background.set(
      entityId,
      new EventRunner(events, this.handlers, this.context("background"), { loop: true }),
    );
  }

  /** Roda uma cena bloqueante; se já houver uma, entra na fila. */
  runBlocking(events: readonly GameEvent[], onDone?: () => void): void {
    if (this.blocking) {
      this.queue.push({ events, onDone });
      return;
    }
    this.blocking = new EventRunner(events, this.handlers, this.context("blocking"));
    this.onBlockingDone = onDone;
    this.input.pushContext("dialogue");
  }

  update(dt: number): void {
    if (this.blocking) {
      if (this.blocking.update(dt) === "done") this.finishBlocking();
      return; // os behaviorLoop ficam pausados durante a cena
    }
    for (const runner of this.background.values()) runner.update(dt);
  }

  /** Cancela tudo (troca de mapa). */
  clear(): void {
    for (const runner of this.background.values()) runner.cancel();
    this.background.clear();
    this.queue.length = 0;
    if (this.blocking) {
      this.blocking.cancel();
      this.blocking = null;
      this.input.popContext("dialogue");
    }
  }

  private finishBlocking(): void {
    this.blocking = null;
    this.input.popContext("dialogue");
    const done = this.onBlockingDone;
    this.onBlockingDone = undefined;
    done?.();
    const next = this.queue.shift();
    if (next) this.runBlocking(next.events, next.onDone);
  }
}
