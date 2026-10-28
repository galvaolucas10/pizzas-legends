import type { Condition } from "../../content/schemas/conditions";
import type { GameEvent, GameEventType } from "../../content/schemas/events";
import type { ActionReader } from "../../engine/input/InputManager";
import type { Entity } from "../entities/Entity";
import type { GameSession } from "../GameSession";
import type { GridOccupancy } from "../world/GridOccupancy";

export type RunMode = "blocking" | "background";
export type Status = "running" | "done";

/** O que os handlers podem usar (cresce com diálogo, troca de mapa etc.). */
export interface EventContext {
  readonly mode: RunMode;
  entity(ref: string): Entity | undefined;
  readonly player: Entity;
  readonly grid: GridOccupancy | null;
  /** Caixa de diálogo da UI (F0-13). */
  dialogue?: DialoguePort;
  /** Ações do contexto "dialogue" (confirmar avança a fala). */
  input?: ActionReader;
  /** Texto do arquivo de idioma; a própria chave se faltar. */
  text(key: string): string;
  /** Troca de mapa (F0-12). */
  changeMap?(mapId: string, entrance: string): void;
  /** Avisos de roteiro (ex.: tempo-limite de um walk bloqueado). */
  warn(message: string): void;
  /** Partida atual: os eventos de progresso viram comandos (ARCHITECTURE 8.1). */
  session?: GameSession;
  /** Avalia uma condição de conteúdo com o estado atual. */
  isTrue?(condition: Condition): boolean;
  /** Abre a tela do forno; `onClose` é chamado ao sair dela (F1-08). */
  openOven?(ovenId: string, onClose: () => void): void;
  /** Abre a loja (mercadinho); `onClose` é chamado ao sair dela. */
  openShop?(onClose: () => void): void;
  /** Empilha a batalha; `onEnd` recebe o resultado quando ela fecha (F1-13). */
  startBattle?(request: BattleRequest, onEnd: (outcome: BattleOutcome) => void): void;
  /** Pede um autosave (o SaveSystem decide como gravar). */
  autosave?(): void;
}

export interface BattleRequest {
  enemyId: string;
  /** Objeto do mapa que iniciou a batalha (inimigo no mapa). */
  source?: string;
  /** ID do inimigo no mundo, para `defeatedEnemies` (preenchido pela WorldScene). */
  enemyGlobalId?: string;
}

export type BattleOutcome = "victory" | "defeat" | "fled";

/**
 * Caixa de diálogo vista pelos roteiros. A UI só exibe: quem lê "confirmar" é o handler.
 * Implementada em ui/ (DialogueBox) e injetada pelo app.
 */
export interface DialoguePort {
  /** Abre a caixa (ou troca a fala) e começa a revelar o texto letra a letra. */
  show(text: string, speaker?: string): void;
  /** Avança a revelação do texto pelo relógio do jogo. */
  update(dt: number): void;
  /** Ainda revelando letras? */
  readonly typing: boolean;
  /** Mostra o texto inteiro de uma vez. */
  complete(): void;
  /** Fecha a caixa. */
  hide(): void;
}

/** Um evento em execução. Avança só com `dt` do GameLoop: sem Promises nem timers. */
export interface ActiveEvent {
  update(dt: number): Status;
  cancel?(): void;
}

/** Cria um sub-executor com os mesmos handlers e contexto (usado por `if` e `startBattle`). */
export type SubRunner = (events: readonly GameEvent[]) => ActiveEvent;

export type EventHandler<E extends GameEvent = GameEvent> = (
  event: E,
  ctx: EventContext,
  sub: SubRunner,
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
    return handler(event, this.ctx, (events) => new EventRunner(events, this.handlers, this.ctx));
  }
}
