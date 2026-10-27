import type { ContentRegistry } from "../../content/registry";
import type { Direction } from "../../content/schemas/common";
import type { Condition } from "../../content/schemas/conditions";
import { isSolid, type MapDef, type MapObject } from "../../content/schemas/map";
import { evaluateCondition, type FlagsOnly } from "../../core/conditions";
import type { SaveData } from "../../core/types";
import type { AssetLoader } from "../../engine/assets/AssetLoader";
import { cameraView, type Point } from "../../engine/Camera";
import type { ActionReader } from "../../engine/input/InputManager";
import { buildTileLayerCache, TILE } from "../../engine/render/TileLayerCache";
import type { Entity, SpriteDef } from "../entities/Entity";
import { Npc } from "../entities/Npc";
import { Player } from "../entities/Player";
import { GridOccupancy } from "./GridOccupancy";

export const SHADOW_ID = "img.shadow";
export const PLAYER_SPRITE_ID = "img.hero";

export type Placement = { entrance: string } | { x: number; y: number; direction: Direction };

type DoorObject = Extract<MapObject, { kind: "door" }>;

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
      }
    }
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
    for (const object of map.objects.filter(visible)) {
      if (object.kind === "npc") {
        const npcDef = this.options.content.npcs[object.npcId];
        if (!npcDef) continue;
        const npc = new Npc(object, this.spriteDef(npcDef.sprite));
        npc.mover.place(grid, object.x, object.y);
        this.entities.push(npc);
      } else if (object.kind === "door") {
        this.doors.set(`${object.x},${object.y}`, object);
      } else {
        // Objetos sem entidade própria (placa, forno, baú): o desenho vem do mapa;
        // aqui eles bloqueiam o tile (se sólidos) e respondem à interação.
        this.interactables.set(`${object.x},${object.y}`, object);
        if (isSolid(object)) grid.reserve(`${map.id}/${object.id}`, object.x, object.y);
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
    this.lowerCache = null;
    this.upperCache = null;
    this.grid = null;
    this.map = null;
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

  update(dt: number): void {
    const grid = this.grid;
    if (!grid) return;
    // O jogador primeiro: ele reserva o tile antes de um NPC no mesmo tick.
    for (const entity of this.entities) entity.update(dt, grid);
  }

  /** Visão atual da câmera, centrada no jogador e limitada às bordas do mapa. */
  camera(alpha: number): Point {
    const map = this.map;
    if (!map) return { x: 0, y: 0 };
    const at = this.player.renderPosition(alpha);
    return cameraView(
      { x: at.x + TILE / 2, y: at.y + TILE / 2 },
      map.width * TILE,
      map.height * TILE,
    );
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (!this.map) return;
    const camera = this.camera(alpha);
    const assets = this.options.assets;

    if (this.lowerCache) ctx.drawImage(this.lowerCache, -camera.x, -camera.y);

    // Ordem de desenho (ARCHITECTURE 10.5): sombras, entidades por Y (desempate: id), camada de cima.
    const drawn = this.entities
      .map((entity) => {
        const at = entity.renderPosition(alpha);
        return { entity, at: { x: at.x - camera.x, y: at.y - camera.y } };
      })
      .sort((a, b) => a.at.y - b.at.y || (a.entity.id < b.entity.id ? -1 : 1));
    for (const { entity, at } of drawn) entity.drawShadow(ctx, assets, at);
    for (const { entity, at } of drawn) entity.draw(ctx, assets, at);

    if (this.upperCache) ctx.drawImage(this.upperCache, -camera.x, -camera.y);
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
