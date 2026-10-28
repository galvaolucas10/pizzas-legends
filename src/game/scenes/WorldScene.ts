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
import { findRoute } from "../world/guidePath";
import { Avenue } from "../world/Avenue";
import { Restaurant } from "../world/Restaurant";
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
  /** Abre a loja do mercadinho. */
  openShop?(onClose: () => void): void;
  /** Pede um autosave (evento `autosave`). */
  autosave?(): void;
  /** Menu de pausa (tecla Tab/M na exploração). */
  openMenu?(): void;
  /** Sorteio do restaurante (pedido, cadeira, aparência). Nos testes, um valor fixo. */
  random?: () => number;
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
  /** Tempo até recalcular a seta no chão. */
  private guideTimer = 0;
  /** Salão da pizzaria: clientes que chegam, pedem, comem e pagam. */
  readonly restaurant: Restaurant | null;
  /** Todos os salões com clientes (o da pizzaria e os extras, como a cozinha verde). */
  readonly restaurants: Restaurant[];
  /** Avenida: carros e o motoboy dos pedidos online. */
  readonly avenue: Avenue | null;

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
      openShop: options.openShop,
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

    const session = options.session;
    this.restaurant = session?.content.balance.restaurant
      ? new Restaurant({ world, session, random: options.random })
      : null;
    this.restaurants = this.restaurant ? [this.restaurant] : [];
    if (session && this.restaurant) {
      for (const place of session.content.balance.extraRestaurants ?? []) {
        this.restaurants.push(new Restaurant({ world, session, random: options.random, place }));
      }
    }
    this.avenue = session?.content.balance.avenue
      ? new Avenue({ world, session, random: options.random })
      : null;
    world.guideGroup = (id) =>
      id === "@clientes"
        ? this.restaurants.filter((r) => r.here).flatMap((r) => r.guideTargets())
        : null;
  }

  /** Confirmar olhando para um NPC: roda a primeira fala cuja condição é verdadeira (DATA_MODELS 3.13). */
  interact(x: number, y: number): boolean {
    const target = this.world.entityAt(x, y);
    if (target instanceof Npc && this.avenue?.isMotoboy(target.id)) {
      const events = this.avenue.talk();
      if (!events) return false;
      this.events.runBlocking(events);
      return true;
    }
    const restaurant =
      target instanceof Npc ? this.restaurants.find((r) => r.isCustomer(target.id)) : undefined;
    if (target instanceof Npc && restaurant) {
      if (target.mover.moving) return false;
      const events = restaurant.talk(target.id);
      if (!events) return false;
      this.events.runBlocking(events);
      return true;
    }
    if (target instanceof Npc) {
      if (target.mover.moving || target.hidden) return false;
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
    if (object?.kind === "harvest") {
      const r = this.options.session?.dispatch({
        type: "harvest",
        spot: this.world.harvestSpot(object),
      });
      this.events.runBlocking([
        {
          type: "message",
          textKey: r?.ok
            ? object.rewardId
              ? "obj.coleta.segredo"
              : `obj.coleta.${object.ingredientId}`
            : "obj.coleta.vazia",
        },
      ]);
      return true;
    }
    if (object?.kind === "chest") {
      const r = this.options.session?.dispatch({ type: "openChest", rewardId: object.rewardId });
      this.events.runBlocking([
        { type: "message", textKey: r?.ok ? "obj.bau.aberto" : "obj.bau.vazio" },
      ]);
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

  /**
   * Clique do mouse no tile (x, y) do mapa: anda até lá; se ali houver alguém ou algo
   * (NPC, forno, baú...), anda até o lado e interage.
   */
  clickTile(x: number, y: number): void {
    if (!this.worldInput.active || this.events.isBlocking || this.inBattle) return;
    const grid = this.world.grid;
    if (!grid) return;
    const player = this.world.player;
    const target = this.clickTarget(x, y);
    if (target) {
      this.walkToTarget(target, 3);
      return;
    }
    if (grid.isWall(x, y)) return;
    const route = this.route((tx, ty) => tx === x && ty === y, x, y);
    if (route) player.setRoute(route);
  }

  /** O que foi clicado: uma entidade (pelo id, porque ela anda) ou um objeto fixo. */
  private clickTarget(x: number, y: number): { entityId?: string; x: number; y: number } | null {
    const world = this.world;
    const entity = world.entityAt(x, y);
    if (entity && entity !== world.player) return { entityId: entity.id, x, y };
    if (world.objectAt(x, y)) return { x, y };
    // Mesa grande (ex.: o forno ocupa mais de um tile): clicar na parede ao lado também vale.
    if (world.grid?.isWall(x, y)) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (world.objectAt(x + dx, y + dy)?.kind === "oven") return { x: x + dx, y: y + dy };
    }
    return null;
  }

  private walkToTarget(target: { entityId?: string; x: number; y: number }, retries: number): void {
    const player = this.world.player;
    const at = target.entityId ? this.world.entity(target.entityId)?.mover : target;
    if (!at) return;
    const tx = "tileX" in at ? at.tileX : at.x;
    const ty = "tileY" in at ? at.tileY : at.y;
    const next = (px: number, py: number) => Math.abs(px - tx) + Math.abs(py - ty) === 1;
    const route = this.route(next, tx, ty);
    if (!route) return;
    player.setRoute(route, () => {
      const p = player.mover;
      const now = target.entityId ? this.world.entity(target.entityId)?.mover : null;
      const nx = now ? now.tileX : tx;
      const ny = now ? now.tileY : ty;
      if (Math.abs(p.tileX - nx) + Math.abs(p.tileY - ny) !== 1) {
        if (retries > 0) this.walkToTarget(target, retries - 1); // a pessoa andou: vai atrás
        return;
      }
      p.direction = nx > p.tileX ? "right" : nx < p.tileX ? "left" : ny > p.tileY ? "down" : "up";
      this.interact(nx, ny);
    });
  }

  /** Caminho a pé até um tile-objetivo, sem pisar em portas que não sejam o próprio destino. */
  private route(
    isGoal: (x: number, y: number) => boolean,
    goalX: number,
    goalY: number,
  ): ReturnType<typeof findRoute> {
    const world = this.world;
    const grid = world.grid!;
    const p = world.player.mover;
    return findRoute(
      { x: p.tileX, y: p.tileY },
      isGoal,
      (x, y) =>
        (!grid.isBlocked(x, y) || world.entityAt(x, y) instanceof Npc) &&
        (!world.doorAt(x, y) || (x === goalX && y === goalY)),
    );
  }

  /** Troca o mapa: cancela os roteiros do anterior e inicia os behaviorLoop do novo. */
  async loadMap(mapId: string, placement: Placement): Promise<void> {
    this.events.clear();
    this.world.player.clearRoute();
    // Plantas que crescem de novo a cada visita (renew "visit").
    const regrow = (this.options.session?.content.maps[mapId]?.objects ?? [])
      .filter((o) => o.kind === "harvest" && o.renew === "visit")
      .map((o) => `${mapId}/${o.id}`);
    if (regrow.length) this.options.session?.dispatch({ type: "regrowHarvest", globalIds: regrow });
    await this.world.loadMap(mapId, placement);
    for (const entity of this.world.entities) {
      const loop =
        entity instanceof Npc || entity instanceof EnemyActor ? entity.def.behaviorLoop : undefined;
      if (loop) this.events.startBackground(entity.id, loop);
    }
    for (const restaurant of this.restaurants) restaurant.onMapLoaded();
    this.options.onMapLoaded?.(mapId);
  }

  update(dt: number): void {
    // Roteiros primeiro: um walk começa o passo e o mundo já o avança no mesmo tick.
    this.events.update(dt);
    this.world.update(dt);
    // Clientes andam e comem fora das cenas (uma fala não congela o salão inteiro).
    if (!this.events.isBlocking && !this.inBattle) {
      for (const restaurant of this.restaurants) restaurant.update(dt);
      this.avenue?.update(dt);
    }
    this.guideTimer -= dt;
    if (this.guideTimer <= 0) {
      this.guideTimer = 250;
      this.world.updateGuide(this.options.session?.guide ?? null);
    }
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
