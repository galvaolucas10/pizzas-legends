import type { GameEvent, GameEventType } from "../../content/schemas/events";
import type { Entity } from "../entities/Entity";
import type { GridOccupancy } from "../world/GridOccupancy";

export type RunMode = "blocking" | "background";
export type Status = "running" | "done";

/** O que os handlers podem usar (cresce com diálogo, troca de mapa etc.). */
export interface EventContext {
  readonly mode: RunMode;
  entity(ref: string): Entity | undefined;
  readonly player: Entity;
  readonly grid: GridOccupancy | null;
  /** Mostra uma fala e diz quando o jogador a fechou (F0-13). */
  dialogue?: DialoguePort;
  /** Troca de mapa (F0-12). */
  changeMap?(mapId: string, entrance: string): void;
  /** Avisos de roteiro (ex.: tempo-limite de um walk bloqueado). */
  warn(message: string): void;
}

export interface DialoguePort {
  /** Abre (ou troca) a fala atual. */
  show(text: string, speaker?: string): void;
  /** Fecha a caixa de diálogo. */
  hide(): void;
  /** Avança um tick: confirmar completa o texto ou fecha a fala. Devolve "done" quando fechada. */
  update(dt: number): Status;
}

/** Um evento em execução. Avança só com `dt` do GameLoop: sem Promises nem timers. */
export interface ActiveEvent {
  update(dt: number): Status;
  cancel?(): void;
}

export type EventHandler<E extends GameEvent = GameEvent> = (
  event: E,
  ctx: EventContext,
) => ActiveEvent;
export type HandlerTable = { [T in GameEventType]?: EventHandler<Extract<GameEvent, { type: T }>> };

/** Limite de eventos instantâneos num único tick (protege contra laços sem espera). */
const MAX_EVENTS_PER_TICK = 64;

/**
 * Executa uma lista de GameEvent por ticks (ARCHITECTURE 11.1).
 * Eventos instantâneos (face, setFlag) encadeiam no mesmo tick; os demais seguem nos próximos.
 */
export class EventRunner {
  private index = 0;
  private active: ActiveEvent | null = null;
  private finished = false;

  constructor(
    private readonly events: readonly GameEvent[],
    private readonly handlers: HandlerTable,
    private readonly ctx: EventContext,
    private readonly options: { loop?: boolean } = {},
  ) {}

  get done(): boolean {
    return this.finished;
  }

  /** Evento atual (para a depuração). */
  get current(): GameEvent | undefined {
    return this.events[this.index];
  }

  update(dt: number): Status {
    if (this.finished) return "done";
    for (let step = 0; step < MAX_EVENTS_PER_TICK; step++) {
      if (!this.active) {
        if (this.index >= this.events.length) {
          if (!this.options.loop || this.events.length === 0) {
            this.finished = true;
            return "done";
          }
          this.index = 0;
          return "running"; // um laço recomeça no próximo tick
        }
        this.active = this.begin(this.events[this.index]!);
      }
      if (this.active.update(dt) === "running") return "running";
      this.active = null;
      this.index += 1;
      dt = 0; // eventos seguintes no mesmo tick não "gastam" o tempo de novo
    }
    this.ctx.warn("muitos eventos instantâneos num único tick; continuando no próximo");
    return "running";
  }

  cancel(): void {
    this.active?.cancel?.();
    this.active = null;
    this.finished = true;
  }

  private begin(event: GameEvent): ActiveEvent {
    const handler = this.handlers[event.type] as EventHandler | undefined;
    if (!handler) {
      // A validação de conteúdo impede isto; em dev, avisa e pula o evento.
      this.ctx.warn(`evento sem handler: "${event.type}"`);
      return { update: () => "done" };
    }
    return handler(event, this.ctx);
  }
}
