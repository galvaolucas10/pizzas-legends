import {
  GameObject,
  type BehaviorEvent,
  type GameObjectConfig,
  type UpdateState,
} from "./GameObject";
import type { Direction } from "./utils";

export interface PersonConfig extends GameObjectConfig {
  isPlayerControlled?: boolean;
}

export class Person extends GameObject {
  movingProgressRemaining: number;
  isPlayerControlled: boolean;
  directionUpdate: Record<Direction, ["x" | "y", number]>;

  constructor(config: PersonConfig) {
    super(config);
    this.movingProgressRemaining = 0;

    this.isPlayerControlled = config.isPlayerControlled || false;

    this.directionUpdate = {
      up: ["y", -1],
      down: ["y", 1],
      left: ["x", -1],
      right: ["x", 1],
    };
  }

  override update(state: UpdateState): void {
    if (this.movingProgressRemaining > 0) {
      this.updatePosition();
    } else {
      //More cases for starting to walk will come here

      //Case: We're keyboard ready and have an arrow pressed
      if (this.isPlayerControlled && state.arrow) {
        this.startBehavior(state, {
          type: "walk",
          direction: state.arrow,
        });
        // O passo já anda no tick em que começa: 1 tile = 16 ticks (ARCHITECTURE 6.1).
        if (this.movingProgressRemaining > 0) this.updatePosition();
      }
      this.updateSprite();
    }
  }

  startBehavior(state: UpdateState, behavior: BehaviorEvent): void {
    //Set character direction to whatever behavior has
    this.direction = behavior.direction;

    if (behavior.type === "walk") {
      //Stop here if space is not free
      if (state.map.isSpaceTaken(this.x, this.y, this.direction)) {
        return;
      }

      //Ready to walk!
      state.map.moveWall(this.x, this.y, this.direction);
      this.movingProgressRemaining = 16;
    }
  }

  updatePosition(): void {
    const [property, change] = this.directionUpdate[this.direction];
    this[property] += change;
    this.movingProgressRemaining -= 1;
  }

  updateSprite(): void {
    if (this.movingProgressRemaining > 0) {
      this.sprite.setAnimation("walk-" + this.direction);
      return;
    }
    this.sprite.setAnimation("idle-" + this.direction);
  }
}
