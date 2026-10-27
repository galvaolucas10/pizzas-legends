import type { Scene } from "../../engine/SceneStack";
import type { WorldManager } from "../world/WorldManager";

/** Exploração do mapa ativo (ARCHITECTURE 7). */
export class WorldScene implements Scene {
  readonly blocksUpdateBelow = true;

  constructor(readonly world: WorldManager) {}

  update(dt: number): void {
    this.world.update(dt);
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    this.world.render(ctx, alpha);
  }
}
