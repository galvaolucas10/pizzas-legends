import type { Direction } from "../../content/schemas/common";
import type { GridOccupancy } from "../world/GridOccupancy";

export const TILE = 16;
/** 1 tile a cada 16 ticks (~267 ms a 60 Hz): 1 px por tick (ARCHITECTURE 6.1). */
export const PIXELS_PER_TICK = 1;

const STEP: Record<Direction, [dx: number, dy: number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function neighbor(x: number, y: number, direction: Direction): { x: number; y: number } {
  const [dx, dy] = STEP[direction];
  return { x: x + dx, y: y + dy };
}

/**
 * Movimento em grade, compartilhado por jogador, NPCs e inimigos (ARCHITECTURE 10.3).
 * Posição lógica em tiles; posição de desenho em pixels, com a do tick anterior para interpolar.
 */
export class GridMover {
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  direction: Direction;
  private remaining = 0;
  private fromX = 0;
  private fromY = 0;

  constructor(
    readonly entityId: string,
    tileX: number,
    tileY: number,
    direction: Direction,
    readonly solid: boolean,
  ) {
    this.tileX = tileX;
    this.tileY = tileY;
    this.x = this.prevX = tileX * TILE;
    this.y = this.prevY = tileY * TILE;
    this.direction = direction;
  }

  get moving(): boolean {
    return this.remaining > 0;
  }

  /** Tile para onde a entidade está olhando. */
  get facingTile(): { x: number; y: number } {
    return neighbor(this.tileX, this.tileY, this.direction);
  }

  /** Coloca a entidade no tile, ocupando-o (entrada no mapa, teleporte). */
  place(grid: GridOccupancy, tileX: number, tileY: number, direction?: Direction): void {
    if (this.solid) grid.release(this.entityId, this.tileX, this.tileY);
    this.tileX = tileX;
    this.tileY = tileY;
    this.x = this.prevX = tileX * TILE;
    this.y = this.prevY = tileY * TILE;
    this.remaining = 0;
    if (direction) this.direction = direction;
    if (this.solid) grid.reserve(this.entityId, tileX, tileY);
  }

  /** Vira para a direção e tenta começar um passo. Devolve false se o destino estiver ocupado. */
  tryStep(direction: Direction, grid: GridOccupancy): boolean {
    if (this.moving) return false;
    this.direction = direction;
    const to = neighbor(this.tileX, this.tileY, direction);
    if (this.solid ? !grid.reserve(this.entityId, to.x, to.y) : grid.isBlocked(to.x, to.y)) {
      return false;
    }
    this.fromX = this.tileX;
    this.fromY = this.tileY;
    this.tileX = to.x;
    this.tileY = to.y;
    this.remaining = TILE;
    return true;
  }

  savePrevious(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Avança 1 tick. Devolve true no tick em que o passo termina. */
  advance(grid: GridOccupancy): boolean {
    if (!this.moving) return false;
    const [dx, dy] = STEP[this.direction];
    this.x += dx * PIXELS_PER_TICK;
    this.y += dy * PIXELS_PER_TICK;
    this.remaining -= PIXELS_PER_TICK;
    if (this.remaining > 0) return false;
    if (this.solid) grid.release(this.entityId, this.fromX, this.fromY);
    return true;
  }
}
