import type { InputManager } from "../../engine/input/InputManager";
import type { Scene } from "../../engine/SceneStack";
import { Npc } from "../entities/Npc";
import type { DialoguePort, EventContext, HandlerTable } from "../events/EventRunner";
import { EventSystem } from "../events/EventSystem";
import {
  dialogueHandlers,
  movementHandlers,
  progressHandlers,
  worldHandlers,
} from "../events/handlers";
import type { GameSession } from "../GameSession";
import type { Placement, WorldManager } from "../world/WorldManager";

export interface WorldSceneOptions {
  world: WorldManager;
  input: InputManager;
  handlers?: HandlerTable;
  /** Partes extras do contexto dos eventos (diálogo, troca de mapa). */
  extendContext?: (ctx: EventContext) => EventContext;
  /** Caixa de diálogo da UI (sem ela, falas são puladas com aviso). */
  dialogue?: DialoguePort;
  /** Transição com fade (SceneStack.transition). Sem ela, a troca de mapa é imediata. */
  transition?: (work: () => Promise<void>) => boolean;
  warn?: (message: string) => void;
  /** Partida atual (sem ela, eventos de progresso são pulados com aviso). */
  session?: GameSession;
}

/** Todos os handlers de eventos suportados. */
export const DEFAULT_HANDLERS: HandlerTable = {
  ...movementHandlers,
  ...worldHandlers,
  ...dialogueHandlers,
  ...progressHandlers,
};

/** Exploração do mapa ativo (ARCHITECTURE 7): mundo + EventSystem. */
export class WorldScene implements Scene {
  readonly blocksUpdateBelow = true;
  readonly world: WorldManager;
  readonly events: EventSystem;
  private readonly transition: WorldSceneOptions["transition"];
  private pending: Promise<void> | null = null;

  constructor(options: WorldSceneOptions) {
    this.world = options.world;
    this.transition = options.transition;
    const warn = options.warn ?? ((message: string) => console.warn(`[eventos] ${message}`));
    const world = this.world;
    const dialogueInput = options.input.reader("dialogue");
    const base = (mode: EventContext["mode"]): EventContext => ({
      mode,
      entity: (ref) => (ref === "player" ? world.player : world.entity(ref)),
      get player() {
        return world.player;
      },
      get grid() {
        return world.grid;
      },
      changeMap: (mapId, entrance) => this.goTo(mapId, entrance),
      dialogue: options.dialogue,
      input: dialogueInput,
      text: (key) => world.content.locale[key] ?? key,
      session: options.session,
      isTrue: (condition) => world.isTrue(condition),
      warn,
    });
    this.events = new EventSystem(
      options.handlers ?? DEFAULT_HANDLERS,
      (mode) => options.extendContext?.(base(mode)) ?? base(mode),
      options.input,
      () => options.dialogue?.hide(),
    );

    // Portas disparam ao terminar um passo sobre o tile (ARCHITECTURE 10.3).
    world.player.hooks.onStepEnd = (x, y) => {
      const door = world.doorAt(x, y);
      if (door) this.goTo(door.toMap, door.toEntrance);
    };
    world.player.hooks.onInteract = (x, y) => this.interact(x, y);
  }

  /** Confirmar olhando para um NPC: roda a primeira fala cuja condição é verdadeira (DATA_MODELS 3.13). */
  interact(x: number, y: number): boolean {
    const target = this.world.entityAt(x, y);
    if (target instanceof Npc) {
      if (target.mover.moving) return false;
      const talking = target.def.talking.find((t) => this.world.isTrue(t.condition));
      if (!talking) return false;
      this.events.runBlocking(talking.events);
      return true;
    }
    const object = this.world.objectAt(x, y);
    if (object?.kind === "sign") {
      this.events.runBlocking([{ type: "message", textKey: object.textKey }]);
      return true;
    }
    if (object?.kind === "oven") {
      // O preparo de pizzas chega na F1-08 (handler openOven); por enquanto, só uma fala.
      this.events.runBlocking([{ type: "message", textKey: "obj.forno.quente" }]);
      return true;
    }
    return false;
  }

  /** Mapa sendo carregado pela última troca (para os testes aguardarem). */
  get loading(): Promise<void> | null {
    return this.pending;
  }

  /** Vai para outro mapa pela entrada indicada, com fade quando houver transição. */
  goTo(mapId: string, entrance: string): void {
    const held = this.world.player.mover.direction;
    const work = () => {
      this.pending = this.loadMap(mapId, { entrance }).then(() => {
        this.world.player.lockDirection(held);
      });
      return this.pending;
    };
    if (this.transition) this.transition(work);
    else void work();
  }

  /** Troca o mapa: cancela os roteiros do anterior e inicia os behaviorLoop do novo. */
  async loadMap(mapId: string, placement: Placement): Promise<void> {
    this.events.clear();
    await this.world.loadMap(mapId, placement);
    for (const entity of this.world.entities) {
      if (entity instanceof Npc && entity.def.behaviorLoop) {
        this.events.startBackground(entity.id, entity.def.behaviorLoop);
      }
    }
  }

  update(dt: number): void {
    // Roteiros primeiro: um walk começa o passo e o mundo já o avança no mesmo tick.
    this.events.update(dt);
    this.world.update(dt);
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    this.world.render(ctx, alpha);
  }
}
