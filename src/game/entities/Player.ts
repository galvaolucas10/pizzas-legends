import type { ActionReader } from "../../engine/input/InputManager";
import type { GridOccupancy } from "../world/GridOccupancy";
import { Entity, type EntityConfig } from "./Entity";

export interface PlayerHooks {
  /** O jogador terminou um passo no tile (x, y): portas e gatilhos (ARCHITECTURE 10.3). */
  onStepEnd?(x: number, y: number): void;
  /** O jogador apertou "confirmar" olhando para o tile (x, y). */
  onInteract?(x: number, y: number): void;
}

export const PLAYER_ID = "player";

/** Protagonista: anda pelas ações do contexto "world" e interage com o tile à frente. */
export class Player extends Entity {
  hooks: PlayerHooks = {};

  constructor(
    private readonly input: ActionReader,
    config: Omit<EntityConfig, "id" | "solid">,
  ) {
    super({ ...config, id: PLAYER_ID, solid: true });
  }

  protected override think(grid: GridOccupancy): void {
    if (this.mover.moving) return;
    if (this.input.wasPressed("confirm")) {
      const ahead = this.mover.facingTile;
      this.hooks.onInteract?.(ahead.x, ahead.y);
      return;
    }
    const direction = this.input.direction;
    if (direction) this.mover.tryStep(direction, grid);
  }

  protected override onStepEnd(): void {
    this.hooks.onStepEnd?.(this.mover.tileX, this.mover.tileY);
  }
}
