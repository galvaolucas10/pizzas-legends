import type { ActionReader, Direction } from "../../engine/input/InputManager";
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
  /** Direção ignorada até ser solta (ver lockDirection). */
  private lockedDirection: Direction | null = null;
  /** Caminho de um clique do mouse: passos a dar. O teclado cancela. */
  private route: Direction[] = [];
  private routeBlockedTicks = 0;
  /** Chamado uma vez quando o caminho do clique termina (ex.: falar com quem foi clicado). */
  private routeEnd: (() => void) | null = null;

  constructor(
    private readonly input: ActionReader,
    config: Omit<EntityConfig, "id" | "solid">,
  ) {
    super({ ...config, id: PLAYER_ID, solid: true });
  }

  /** Segue um caminho (clique do mouse); `onEnd` roda ao chegar. */
  setRoute(steps: Direction[], onEnd?: () => void): void {
    this.route = [...steps];
    this.routeBlockedTicks = 0;
    this.routeEnd = onEnd ?? null;
  }

  clearRoute(): void {
    this.route = [];
    this.routeEnd = null;
  }

  protected override think(grid: GridOccupancy): void {
    // Fora do contexto "world" (diálogo, fade) o jogador não decide nada, nem solta a trava.
    if (this.mover.moving || !this.input.active) return;
    if (this.input.wasPressed("confirm")) {
      this.clearRoute();
      const ahead = this.mover.facingTile;
      this.hooks.onInteract?.(ahead.x, ahead.y);
      return;
    }
    const direction = this.input.direction;
    if (direction !== this.lockedDirection) this.lockedDirection = null;
    if (direction) {
      this.clearRoute();
      if (!this.lockedDirection) this.mover.tryStep(direction, grid);
      return;
    }
    const next = this.route[0];
    if (next) {
      if (this.mover.tryStep(next, grid)) {
        this.route.shift();
        this.routeBlockedTicks = 0;
      } else if (++this.routeBlockedTicks > 45) {
        this.clearRoute(); // alguém parou no caminho por ~0,75 s: desiste
      } else {
        this.mover.direction = next;
      }
      return;
    }
    const end = this.routeEnd;
    if (end) {
      this.routeEnd = null;
      end();
    }
  }

  /**
   * Depois de passar por uma porta, quem segura a mesma tecla não anda de novo até soltá-la:
   * evita voltar pela porta sem querer. Outra direção funciona na hora.
   */
  lockDirection(direction: Direction): void {
    this.lockedDirection = direction;
  }

  protected override onStepEnd(): void {
    this.hooks.onStepEnd?.(this.mover.tileX, this.mover.tileY);
  }
}
