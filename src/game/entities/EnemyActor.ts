import type { MapObject } from "../../content/schemas/map";
import type { AssetLoader } from "../../engine/assets/AssetLoader";
import type { Point } from "../../engine/Camera";
import type { GridOccupancy } from "../world/GridOccupancy";
import { Entity, type SpriteDef } from "./Entity";

export type EnemyObject = Extract<MapObject, { kind: "enemy" }>;

/** Tempo de atordoamento depois de uma fuga (GDD 9.3). */
export const FLEE_STUN_MS = 3000;

/**
 * Inimigo visível no mapa (F1-12): patrulha pelo behaviorLoop e começa a batalha ao encostar
 * no jogador. Depois de uma fuga fica atordoado (pisca e não encosta) por 3 s.
 */
export class EnemyActor extends Entity {
  /** ID único no mundo, usado em `defeatedEnemies` (ex.: "map.despensa/rato1"). */
  readonly globalId: string;
  private stunMs = 0;
  private elapsed = 0;

  constructor(
    readonly def: EnemyObject,
    mapId: string,
    sprite: SpriteDef,
  ) {
    super({
      id: def.id,
      x: def.x,
      y: def.y,
      direction: def.direction ?? "down",
      solid: def.solid ?? true,
      sprite,
    });
    this.globalId = `${mapId}/${def.id}`;
  }

  get stunned(): boolean {
    return this.stunMs > 0;
  }

  stun(ms = FLEE_STUN_MS): void {
    this.stunMs = ms;
  }

  override update(dt: number, grid: GridOccupancy): void {
    this.elapsed += dt;
    if (this.stunMs > 0) this.stunMs = Math.max(0, this.stunMs - dt);
    super.update(dt, grid);
  }

  override draw(ctx: CanvasRenderingContext2D, assets: AssetLoader, at: Point): void {
    // Atordoado: pisca a cada 100 ms.
    if (this.stunned && Math.floor(this.elapsed / 100) % 2 === 0) return;
    super.draw(ctx, assets, at);
  }
}
