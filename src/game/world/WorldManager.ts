import type { ContentRegistry } from "../../content/registry";
import type { Direction } from "../../content/schemas/common";
import type { Condition } from "../../content/schemas/conditions";
import { isSolid, type MapDef, type MapObject } from "../../content/schemas/map";
import { evaluateCondition, type FlagsOnly } from "../../core/conditions";
import { isChestOpen, isHarvested, type HarvestSpot } from "../../core/gathering";
import type { SaveData } from "../../core/types";
import type { AssetLoader } from "../../engine/assets/AssetLoader";
import { cameraView, type Point } from "../../engine/Camera";
import type { ActionReader } from "../../engine/input/InputManager";
import { buildTileLayerCache, TILE } from "../../engine/render/TileLayerCache";
import { VIEW_H, VIEW_W } from "../../engine/render/viewport";
import { EnemyActor } from "../entities/EnemyActor";
import type { Entity, SpriteDef } from "../entities/Entity";
import { neighbor } from "../entities/GridMover";
import { Npc, type NpcObject } from "../entities/Npc";
import { Player } from "../entities/Player";
import { GridOccupancy } from "./GridOccupancy";
import { drawChest, drawHarvest } from "./gatherArt";
import { drawGuideArrows, guidePath, type GuideTarget } from "./guidePath";
import { drawBrickOven } from "./ovenArt";

export const SHADOW_ID = "img.shadow";
export const PLAYER_SPRITE_ID = "img.hero";

export type Placement = { entrance: string } | { x: number; y: number; direction: Direction };

type DoorObject = Extract<MapObject, { kind: "door" }>;
type OvenObject = Extract<MapObject, { kind: "oven" }>;
type HarvestObject = Extract<MapObject, { kind: "harvest" }>;
type ChestObject = Extract<MapObject, { kind: "chest" }>;

export interface WorldOptions {
  content: ContentRegistry;
  assets: AssetLoader;
  input: ActionReader;
  /** Estado para `visibleIf` e falas condicionais (o save, ou só flags nos testes). */
  state: () => SaveData | FlagsOnly;
}

/**
 * Mapa ativo (ARCHITECTURE 10.1): carrega o MapDef e os assets, monta a ocupação da grade,
 * cria as entidades visíveis e posiciona o jogador. Também desenha o mundo.
 */
export class WorldManager {
  readonly player: Player;
  map: MapDef | null = null;
  grid: GridOccupancy | null = null;
  entities: Entity[] = [];
  private lowerCache: HTMLCanvasElement | null = null;
  private upperCache: HTMLCanvasElement | null = null;
  private doors = new Map<string, DoorObject>();
  /** Objetos sem entidade própria (placa, forno, baú...), por tile. */
  private interactables = new Map<string, MapObject>();
  private ovens: OvenObject[] = [];
  /** Coletas e baús do mapa (desenhados em código). */
  private pickups: (HarvestObject | ChestObject)[] = [];
  /** Relógio do mundo (anima o fogo dos fornos). */
  private time = 0;
  /** Desenhos extras no chão do mapa (carros, moto), por cima do chão e embaixo das pessoas. */
  decorations: ((ctx: CanvasRenderingContext2D, camera: Point, timeMs: number) => void)[] = [];
  /** Posições de um alvo de grupo da seta (ex.: "@clientes"), fornecidas pela cena. */
  guideGroup: ((id: string) => Point[] | null) | null = null;
  /** Caminho da seta no chão (null = sem seta). */
  guide: Point[] | null = null;

  readonly content: ContentRegistry;

  constructor(private readonly options: WorldOptions) {
    this.content = options.content;
    this.player = new Player(options.input, {
      x: 0,
      y: 0,
      direction: "down",
      sprite: this.spriteDef(PLAYER_SPRITE_ID),
    });
  }

  /** IDs de assets necessários para o mapa (tilesets, sprites e sombra). */
  assetsFor(map: MapDef): string[] {
    const ids = [PLAYER_SPRITE_ID, SHADOW_ID, ...map.tilesets.map((t) => t.assetId)];
    for (const object of map.objects) {
      if (object.kind === "npc") {
        const npc = this.options.content.npcs[object.npcId];
        if (npc) ids.push(npc.sprite);
      } else if (object.kind === "enemy") {
        const enemy = this.options.content.enemies[object.enemyId];
        if (enemy) ids.push(enemy.sprite);
      }
    }
    // Clientes do restaurante aparecem durante o jogo: as imagens vêm junto com o salão.
    const restaurant = this.options.content.balance.restaurant;
    const salons = [
      restaurant?.mapId,
      ...(this.options.content.balance.extraRestaurants ?? []).map((r) => r.mapId),
    ];
    if (restaurant && salons.includes(map.id)) ids.push(...restaurant.sprites);
    return ids;
  }

  /** Carrega o mapa e posiciona o jogador. Nada é desenhado antes dos assets carregarem. */
  async loadMap(mapId: string, placement: Placement): Promise<void> {
    const map = this.options.content.maps[mapId];
    if (!map) throw new Error(`Mapa inexistente: ${mapId}`);
    await this.options.assets.loadBundle(this.assetsFor(map));

    this.unloadMap();
    this.map = map;
    const grid = new GridOccupancy(map.collision, map.width, map.height);
    this.grid = grid;

    const tilesets = map.tilesets.map((t) => ({
      image: this.options.assets.image(t.assetId),
      firstGid: t.firstGid,
      columns: t.columns,
    }));
    this.lowerCache = buildTileLayerCache(map.lower, map.width, map.height, tilesets);
    this.upperCache = buildTileLayerCache(map.upper, map.width, map.height, tilesets);

    const state = this.options.state();
    const visible = (o: MapObject) =>
      !o.visibleIf || evaluateCondition(o.visibleIf, state, this.content);
    const defeated = "world" in state ? state.world.defeatedEnemies : [];
    for (const object of map.objects.filter(visible)) {
      if (object.kind === "npc") {
        const npcDef = this.options.content.npcs[object.npcId];
        if (!npcDef) continue;
        const npc = new Npc(object, this.spriteDef(npcDef.sprite));
        npc.mover.place(grid, object.x, object.y);
        this.entities.push(npc);
      } else if (object.kind === "enemy") {
        // Derrotado: fica fora do mapa até o jogador descansar num forno (GDD 9.3).
        const enemyDef = this.options.content.enemies[object.enemyId];
        const globalId = `${map.id}/${object.id}`;
        if (!enemyDef || defeated.includes(globalId) || state.flags[`defeated:${globalId}`])
          continue;
        const enemy = new EnemyActor(object, map.id, this.spriteDef(enemyDef.sprite));
        enemy.mover.place(grid, object.x, object.y);
        this.entities.push(enemy);
      } else if (object.kind === "door") {
        this.doors.set(`${object.x},${object.y}`, object);
      } else {
        // Objetos sem entidade própria (placa, forno, baú): o desenho vem do mapa;
        // aqui eles bloqueiam o tile (se sólidos) e respondem à interação.
        this.interactables.set(`${object.x},${object.y}`, object);
        if (isSolid(object)) grid.reserve(`${map.id}/${object.id}`, object.x, object.y);
        if (object.kind === "oven") this.ovens.push(object);
        if (object.kind === "harvest" || object.kind === "chest") this.pickups.push(object);
      }
    }

    const at = this.resolve(map, placement);
    this.player.mover.place(grid, at.x, at.y, at.direction);
    this.entities.unshift(this.player);
  }

  /** Remove as entidades e os caches do mapa atual. */
  unloadMap(): void {
    this.entities = [];
    this.doors.clear();
    this.interactables.clear();
    this.ovens = [];
    this.pickups = [];
    this.lowerCache = null;
    this.upperCache = null;
    this.grid = null;
    this.map = null;
  }

  /** Ponto de coleta do mapa atual no formato do core (ID global `<mapa>/<objeto>`). */
  harvestSpot(object: HarvestObject): HarvestSpot {
    return {
      globalId: `${this.map?.id ?? ""}/${object.id}`,
      ingredientId: object.ingredientId,
      count: object.count,
      renew: object.renew,
      ...(object.rewardId ? { rewardId: object.rewardId } : {}),
      ...(object.countFlag ? { countFlag: object.countFlag } : {}),
    };
  }

  /** Já colhido / já aberto? (sem save completo, como nos testes de mapa: nunca). */
  isTaken(object: HarvestObject | ChestObject): boolean {
    const state = this.options.state();
    if (!("world" in state)) return false;
    return object.kind === "chest"
      ? isChestOpen(state, object.rewardId)
      : isHarvested(state, this.harvestSpot(object));
  }

  /** Avalia uma condição de conteúdo com o estado atual (flags). */
  isTrue(condition: Condition | undefined): boolean {
    return !condition || evaluateCondition(condition, this.options.state(), this.content);
  }

  doorAt(x: number, y: number): DoorObject | undefined {
    return this.doors.get(`${x},${y}`);
  }

  objectAt(x: number, y: number): MapObject | undefined {
    return this.interactables.get(`${x},${y}`);
  }

  entityAt(x: number, y: number): Entity | undefined {
    const id = this.grid?.occupant(x, y);
    return id ? this.entities.find((e) => e.id === id) : undefined;
  }

  entity(id: string): Entity | undefined {
    return this.entities.find((e) => e.id === id);
  }

  /** Inimigos ativos no mapa. */
  get enemies(): EnemyActor[] {
    return this.entities.filter((e): e is EnemyActor => e instanceof EnemyActor);
  }

  /** Tira uma entidade do mapa (inimigo derrotado), liberando os tiles dela. */
  removeEntity(entity: Entity): void {
    this.entities = this.entities.filter((e) => e !== entity);
    const grid = this.grid;
    if (!grid) return;
    for (const [x, y, id] of grid.entries()) if (id === entity.id) grid.release(id, x, y);
  }

  /**
   * Onde o jogador reaparece diante de um forno (derrota, GDD 7.6): o primeiro tile livre
   * ao redor dele, olhando para o forno.
   */
  ovenSpot(ovenId: string): { mapId: string; x: number; y: number; direction: Direction } | null {
    const opposite: Record<Direction, Direction> = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    };
    for (const map of Object.values(this.content.maps)) {
      const oven = map.objects.find((o) => o.kind === "oven" && o.ovenId === ovenId);
      if (!oven) continue;
      for (const side of ["down", "left", "right", "up"] as const) {
        const at = neighbor(oven.x, oven.y, side);
        const blocked =
          map.collision[at.y]?.[at.x] !== "." ||
          map.objects.some((o) => o.x === at.x && o.y === at.y && isSolid(o));
        if (!blocked) return { mapId: map.id, ...at, direction: opposite[side] };
      }
    }
    return null;
  }

  /** Recalcula a seta no chão até o alvo da missão (null apaga a seta). */
  updateGuide(target: GuideTarget | null): void {
    const map = this.map;
    if (!map || !target) {
      this.guide = null;
      return;
    }
    const p = this.player.mover;
    this.guide = guidePath(
      map,
      this.options.content.maps,
      { x: p.tileX, y: p.tileY },
      target,
      (id) => {
        if (id.startsWith("@")) return this.guideGroup?.(id) ?? null;
        const object = map.objects.find((o) => o.id === id);
        // Quem já deixou de valer (ex.: cliente atendido) só sai do mapa na próxima visita,
        // mas a seta já para de apontar para ele.
        if (
          object?.visibleIf &&
          !evaluateCondition(object.visibleIf, this.options.state(), this.content)
        )
          return null;
        if (object?.kind !== "npc" && object?.kind !== "enemy") return undefined;
        const entity = this.entities.find((e) => e.id === id);
        return entity ? { x: entity.mover.tileX, y: entity.mover.tileY } : null;
      },
    );
  }

  /** Põe o NPC no lugar dele; numa cadeira (parede), ocupa o tile mesmo assim. */
  /** Põe o NPC sentado no tile; numa cadeira (parede), ocupa o tile mesmo assim. */
  sit(npc: Npc, x: number, y: number, direction: Direction): void {
    const grid = this.grid;
    if (!grid) return;
    grid.release(npc.id, npc.mover.tileX, npc.mover.tileY);
    npc.mover.place(grid, x, y, direction);
    if (grid.isWall(x, y)) grid.claim(npc.id, x, y);
  }

  /** Cria um NPC no mapa atual (ex.: cliente do restaurante). */
  addNpc(def: NpcObject, imageId: string): Npc {
    const npc = new Npc(def, this.spriteDef(imageId));
    if (this.grid) npc.mover.place(this.grid, def.x, def.y, def.direction ?? "down");
    this.entities.push(npc);
    return npc;
  }

  update(dt: number): void {
    this.time += dt;
    const grid = this.grid;
    if (!grid) return;
    // O jogador primeiro: ele reserva o tile antes de um NPC no mesmo tick.
    for (const entity of this.entities) entity.update(dt, grid);
  }

  /**
   * Aproximação do mundo para salas menores que o retângulo do jogo: o meio-termo entre
   * "a sala inteira cabe" e "a sala cobre o retângulo todo" (fica bem maior, cortando só um
   * pouco de cima ou de baixo; a câmera segue o jogador). Mapas grandes ficam em 1×.
   */
  get zoom(): number {
    const map = this.map;
    if (!map) return 1;
    const fitX = VIEW_W / (map.width * TILE);
    const fitY = VIEW_H / (map.height * TILE);
    const whole = Math.max(1, Math.min(fitX, fitY)); // a sala inteira aparece
    const cover = Math.max(1, Math.max(fitX, fitY)); // a sala cobre o retângulo todo
    return (whole + cover) / 2;
  }

  /** Visão atual da câmera, centrada no jogador e limitada às bordas do mapa. */
  camera(alpha: number): Point {
    const map = this.map;
    if (!map) return { x: 0, y: 0 };
    const at = this.player.renderPosition(alpha);
    const zoom = this.zoom;
    return cameraView(
      { x: at.x + TILE / 2, y: at.y + TILE / 2 },
      map.width * TILE,
      map.height * TILE,
      VIEW_W / zoom,
      VIEW_H / zoom,
    );
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (!this.map) return;
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    this.renderWorld(ctx, alpha);
    ctx.restore();
  }

  private renderWorld(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (!this.map) return;
    const camera = this.camera(alpha);
    const assets = this.options.assets;

    if (this.lowerCache) ctx.drawImage(this.lowerCache, -camera.x, -camera.y);
    for (const oven of this.ovens) {
      if (oven.draw)
        drawBrickOven(ctx, oven.x * TILE - camera.x, oven.y * TILE - camera.y, this.time);
    }
    for (const p of this.pickups) {
      const x = p.x * TILE - camera.x;
      const y = p.y * TILE - camera.y;
      if (p.kind === "chest") drawChest(ctx, x, y, this.isTaken(p));
      else drawHarvest(ctx, x, y, p.ingredientId, this.isTaken(p), this.time);
    }

    for (const draw of this.decorations) draw(ctx, camera, this.time);

    if (this.guide?.length) {
      const p = this.player.mover;
      drawGuideArrows(ctx, this.guide, { x: p.tileX, y: p.tileY }, TILE, camera, this.time);
    }

    // Ordem de desenho (ARCHITECTURE 10.5): sombras, entidades por Y (desempate: id), camada de cima.
    const drawn = this.entities
      .map((entity) => {
        const at = entity.renderPosition(alpha);
        return { entity, at: { x: at.x - camera.x, y: at.y - camera.y } };
      })
      .sort((a, b) => a.at.y - b.at.y || (a.entity.id < b.entity.id ? -1 : 1));
    const visible = (e: Entity) => !(e instanceof Npc && e.hidden);
    for (const { entity, at } of drawn) if (visible(entity)) entity.drawShadow(ctx, assets, at);
    // Mala de entrega nas costas: com pizza na mochila, o jogador aparece com a bolsa térmica.
    // Vista de costas (olhando para cima) a mala fica na frente do corpo; nas outras, atrás.
    const state = this.options.state();
    const carrying = "inventory" in state ? state.inventory.pizzas.length : 0;
    for (const { entity, at } of drawn) {
      const withBag = carrying > 0 && entity === this.player;
      const direction = this.player.mover.direction;
      const bagInFront = direction === "up";
      if (withBag && !bagInFront) drawDeliveryBag(ctx, at, direction);
      if (visible(entity)) entity.draw(ctx, assets, at);
      if (withBag && bagInFront) drawDeliveryBag(ctx, at, direction);
    }

    if (this.upperCache) ctx.drawImage(this.upperCache, -camera.x, -camera.y);
    for (const { entity, at } of drawn) {
      if (entity instanceof Npc && entity.bubble) drawBubble(ctx, at, entity.bubble, this.time);
    }
  }

  private resolve(
    map: MapDef,
    placement: Placement,
  ): { x: number; y: number; direction: Direction } {
    if ("entrance" in placement) {
      const entrance = map.entrances[placement.entrance];
      if (!entrance) throw new Error(`Entrada inexistente: ${map.id}#${placement.entrance}`);
      return entrance;
    }
    return placement;
  }

  private spriteDef(imageId: string): SpriteDef {
    const manifest = this.options.content.assets;
    const image = manifest.images[imageId];
    return {
      imageId,
      frame: image?.frame ?? { w: 32, h: 32 },
      origin: image?.origin ?? { x: 0, y: 0 },
      clips: (image?.animations && manifest.animationSets[image.animations]) || {},
      shadowId: SHADOW_ID,
    };
  }
}

/** Balão acima da cabeça de um NPC (pedido, comendo, pagar). */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  at: Point,
  bubble: { text: string; color: string },
  timeMs: number,
): void {
  ctx.save();
  ctx.font = "bold 8px monospace";
  const w = Math.max(10, Math.ceil(ctx.measureText(bubble.text).width) + 6);
  const h = 11;
  const bob = Math.round(Math.sin(timeMs / 250));
  const x = Math.round(at.x + TILE / 2 - w / 2);
  const y = Math.round(at.y - 20 + bob);
  ctx.fillStyle = "#fffaf0";
  ctx.strokeStyle = "#3a2418";
  ctx.lineWidth = 1;
  ctx.fillRect(x + 0.5, y + 0.5, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillRect(x + w / 2 - 1, y + h, 3, 2); // pontinha
  ctx.fillStyle = bubble.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bubble.text, x + w / 2 + 0.5, y + h / 2 + 1);
  ctx.restore();
}

/** Mala térmica de entrega nas costas do jogador (vermelha, com a pizza desenhada). */
function drawDeliveryBag(ctx: CanvasRenderingContext2D, at: Point, direction: Direction): void {
  // Centro da mala em relação ao tile do jogador, conforme para onde ele olha.
  const offset: Record<Direction, [number, number]> = {
    up: [8, 3], // de costas: a mala aparece inteira
    down: [8, 1], // de frente: só a parte de cima aparece atrás da cabeça
    left: [12, 3], // de lado: a mala fica do lado oposto ao rosto
    right: [4, 3],
  };
  const [dx, dy] = offset[direction];
  const x = Math.round(at.x + dx - 5);
  const y = Math.round(at.y + dy - 5);
  ctx.save();
  ctx.fillStyle = "#5c0d0d"; // contorno
  ctx.fillRect(x - 1, y - 1, 12, 11);
  ctx.fillStyle = "#c0392b"; // corpo da mala
  ctx.fillRect(x, y, 10, 9);
  ctx.fillStyle = "#e74c3c"; // tampa
  ctx.fillRect(x, y, 10, 3);
  ctx.fillStyle = "#f5f0e6"; // faixa clara
  ctx.fillRect(x, y + 3, 10, 1);
  ctx.fillStyle = "#f2c14e"; // logo de pizza
  ctx.fillRect(x + 3, y + 5, 4, 3);
  ctx.fillStyle = "#d2452b";
  ctx.fillRect(x + 4, y + 6, 1, 1);
  ctx.fillRect(x + 6, y + 5, 1, 1);
  if (direction === "up") {
    ctx.fillStyle = "#2b2b2b"; // alças
    ctx.fillRect(x + 1, y - 2, 1, 2);
    ctx.fillRect(x + 8, y - 2, 1, 2);
  }
  ctx.restore();
}
