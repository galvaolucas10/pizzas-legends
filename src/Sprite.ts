import type { GameObject } from "./GameObject";
import { utils } from "./utils";

type Frame = [number, number];

export interface SpriteConfig {
  gameObject: GameObject;
  src: string;
  animations?: Record<string, Frame[]>;
  animationFrameLimit?: number;
}

export class Sprite {
  image: HTMLImageElement;
  isLoaded = false;
  shadow: HTMLImageElement;
  useShadow: boolean;
  isShadowLoaded = false;
  animations: Record<string, Frame[]>;
  currentAnimation: string;
  currentAnimationFrame: number;
  animationFrameLimit: number;
  animationFrameProgress: number;
  gameObject: GameObject;

  constructor(config: SpriteConfig) {
    //Set up the image
    this.image = new Image();
    this.image.src = config.src;
    this.image.onload = () => {
      this.isLoaded = true;
    };

    //Shadow
    this.shadow = new Image();
    this.useShadow = true; //config.useShadow || false
    if (this.useShadow) {
      this.shadow.src = utils.asset("images/shadow.png");
    }
    this.shadow.onload = () => {
      this.isShadowLoaded = true;
    };

    //Configure Animation & Initial State
    this.animations = config.animations || {
      "idle-down": [[0, 0]],
      "idle-right": [[0, 1]],
      "idle-up": [[0, 2]],
      "idle-left": [[0, 3]],
      "walk-down": [
        [1, 0],
        [0, 0],
        [3, 0],
        [0, 0],
      ],
      "walk-right": [
        [1, 1],
        [0, 1],
        [3, 1],
        [0, 1],
      ],
      "walk-up": [
        [1, 2],
        [0, 2],
        [3, 2],
        [0, 2],
      ],
      "walk-left": [
        [1, 3],
        [0, 3],
        [3, 3],
        [0, 3],
      ],
    };
    this.currentAnimation = "idle-right"; //config.currentAnimation || "idle-down";
    this.currentAnimationFrame = 0;

    this.animationFrameLimit = config.animationFrameLimit || 8;
    this.animationFrameProgress = this.animationFrameLimit;

    //Reference the game object
    this.gameObject = config.gameObject;
  }

  get frame(): Frame | undefined {
    return this.animations[this.currentAnimation]?.[this.currentAnimationFrame];
  }

  setAnimation(key: string): void {
    if (this.currentAnimation !== key) {
      this.currentAnimation = key;
      this.currentAnimationFrame = 0;
      this.animationFrameProgress = this.animationFrameLimit;
    }
  }

  updateAnimationProgress(): void {
    //Downtick frame progress
    if (this.animationFrameProgress > 0) {
      this.animationFrameProgress -= 1;
      return;
    }

    //Reset the counter
    this.animationFrameProgress = this.animationFrameLimit;
    this.currentAnimationFrame += 1;

    if (this.frame === undefined) {
      this.currentAnimationFrame = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, cameraPerson: GameObject): void {
    const x = this.gameObject.x - 8 + utils.withGrid(10.5) - cameraPerson.x;
    const y = this.gameObject.y - 18 + utils.withGrid(6) - cameraPerson.y;

    if (this.isShadowLoaded) ctx.drawImage(this.shadow, x, y);

    const frame = this.frame;
    if (this.isLoaded && frame) {
      const [frameX, frameY] = frame;
      ctx.drawImage(this.image, frameX * 32, frameY * 32, 32, 32, x, y, 32, 32);
    }

    this.updateAnimationProgress();
  }
}
