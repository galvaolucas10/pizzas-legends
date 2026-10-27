import type { ActionReader, InputManager } from "../../engine/input/InputManager";
import type { Scene } from "../../engine/SceneStack";
import { EnemyActor } from "../entities/EnemyActor";
import type { Entity } from "../entities/Entity";
import { Npc } from "../entities/Npc";
import type {
  BattleOutcome,
  BattleRequest,
  DialoguePort,
  EventContext,
  HandlerTable,
} from "../events/EventRunner";
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
  /** Empilha a cena de batalha (F1-13). */
  startBattle?(request: BattleRequest, onEnd: (outcome: BattleOutcome) => void): void;
  /** Abre a tela do forno (F1-08). Sem ela, o forno só mostra uma fala. */
  openOven?(ovenId: string, onClose: () => void): void;
  /** Pede um autosave (evento `autosave`). */
  autosave?(): void;
  /** Menu de pausa (tecla Tab/M na exploração). */
  openMenu?(): void;
  /** Chamado depois de cada troca de mapa (autosave, música...). */
  onMapLoaded?(mapId: string): void;
}

/** Todos os handlers de eventos suportados. */
export const DEFAULT_HANDLERS: HandlerTable = {
  ...movementHandlers,
  ...worldHandlers,
  ...dialogueHandlers,
  ...progressHandlers,
};

/** Exploração do mapa ativo (ARCHITECTURE 7): mundo + EventSystem + encontros. */
export class WorldScene implements Scene {
  readonly blocksUpdateBelow = true;
  readonly world: WorldManager;
  readonly events: EventSystem;
  private readonly transition: WorldSceneOptions["transition"];
  private readonly options: WorldSceneOptions;
  private readonly worldInput: ActionReader;
  private pending: Promise<void> | null = null;
  /** Uma batalha (ou derrota) em andamento: nada de novos encontros até ela fechar. */
  private inBattle = false;

  constructor(options: WorldSceneOptions) {
    this.options = options;
    this.world = options.world;
    this.transition = options.transition;
    this.worldInput = options.input.reader("world");
    const warn = options.warn ?? ((message: string) => console.warn(`[eventos] ${message}`));
    const world = this.world;
    const dialogueInput = options.input.reader("dialogue");
    const startBattle = options.startBattle;
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
      openOven: options.openOven,
      autosave: options.autosave,
      startBattle: startBattle
        ? (request, onEnd) => {
            const source = request.source ? world.entity(request.source) : undefined;
            const enemy = source instanceof EnemyActor ? source : undefined;
            this.inBattle = true;
            startBattle({ ...request, enemyGlobalId: enemy?.globalId }, (outcome) => {
              this.inBattle = false;
              this.afterBattle(outcome, enemy);
              onEnd(outcome);
            });
          }
        : undefined,
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
    if (target instanceof EnemyActor) {
      if (target.stunned || target.mover.moving) return false;
      this.encounter(target);
      return true;
    }
    const object = this.world.objectAt(x, y);
    if (object?.kind === "sign") {
      this.events.runBlocking([{ type: "message", textKey: object.textKey }]);
      return true;
    }
    if (object?.kind === "oven") {
      this.events.runBlocking(
        this.options.openOven
          ? [{ type: "openOven", ovenId: object.ovenId }]
          : [{ type: "message", textKey: "obj.forno.quente" }],
      );
      return true;
    }
    return false;
  }

  /** Encostou num inimigo: ele se vira e a batalha começa (GDD 9.3). */
  encounter(enemy: EnemyActor): void {
    const player = this.world.player;
    enemy.mover.direction = facing(enemy, player);
    this.events.runBlocking([
      {
        type: "startBattle",
        enemyId: enemy.def.enemyId,
        source: enemy.id,
        ...(enemy.def.onDefeat ? { onWin: enemy.def.onDefeat } : {}),
      },
    ]);
  }

  /** Efeitos da batalha no mapa: some (vitória), atordoa (fuga) ou volta ao forno (derrota). */
  private afterBattle(outcome: BattleOutcome, enemy: EnemyActor | undefined): void {
    if (outcome === "victory" && enemy) {
      this.events.startBackground(enemy.id, []); // para a patrulha
      this.world.removeEntity(enemy);
      if (enemy.def.respawn === "never")
        this.options.session?.dispatch({
          type: "setFlag",
          flag: `defeated:${enemy.globalId}`,
          value: true,
        });
    } else if (outcome === "fled") {
      enemy?.stun(this.world.content.balance.fleeStunMs);
    } else if (outcome === "defeat") {
      this.respawnAtOven();
    }
  }

  /** Derrota (GDD 7.6): volta ao último forno visitado, com PV cheio. */
  respawnAtOven(): void {
    const ovenId = this.options.session?.state.world.lastOvenId;
    const spot = ovenId ? this.world.ovenSpot(ovenId) : null;
    if (!spot) return;
    const work = () => {
      this.pending = this.loadMap(spot.mapId, spot).then(() => {
        this.events.runBlocking([{ type: "message", textKey: "battle.derrota.acordou" }]);
      });
      return this.pending;
    };
    if (this.transition) this.transition(work);
    else void work();
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
      const loop =
        entity instanceof Npc || entity instanceof EnemyActor ? entity.def.behaviorLoop : undefined;
      if (loop) this.events.startBackground(entity.id, loop);
    }
    this.options.onMapLoaded?.(mapId);
  }

  update(dt: number): void {
    // Roteiros primeiro: um walk começa o passo e o mundo já o avança no mesmo tick.
    this.events.update(dt);
    this.world.update(dt);
    if (!this.canAct()) return;
    if (this.worldInput.wasPressed("menu") && this.options.openMenu) {
      this.worldInput.consume("menu");
      this.options.openMenu();
      return;
    }
    const enemy = this.touchingEnemy();
    if (enemy) this.encounter(enemy);
  }

  /** Livre na exploração: sem cena, menu, batalha nem transição. */
  private canAct(): boolean {
    return (
      this.worldInput.active &&
      !this.events.isBlocking &&
      !this.inBattle &&
      !this.world.player.mover.moving
    );
  }

  /** Inimigo parado e não atordoado em um tile vizinho ao jogador. */
  private touchingEnemy(): EnemyActor | undefined {
    const p = this.world.player.mover;
    return this.world.enemies.find(
      (e) =>
        !e.stunned &&
        !e.mover.moving &&
        Math.abs(e.mover.tileX - p.tileX) + Math.abs(e.mover.tileY - p.tileY) === 1,
    );
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    this.world.render(ctx, alpha);
  }
}

function facing(from: Entity, to: Entity): Entity["mover"]["direction"] {
  const dx = to.mover.tileX - from.mover.tileX;
  const dy = to.mover.tileY - from.mover.tileY;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
