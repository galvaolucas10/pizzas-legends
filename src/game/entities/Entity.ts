import type { Direction } from "../../content/schemas/common";
import type { AssetLoader } from "../../engine/assets/AssetLoader";
import type { Point } from "../../engine/Camera";
import { interpolate } from "../../engine/interpolate";
import { SpriteAnimator, type AnimationClip } from "../../engine/render/SpriteAnimator";
import type { GridOccupancy } from "../world/GridOccupancy";
import { GridMover } from "./GridMover";

export interface SpriteDef {
  imageId: string;
  frame: { w: number; h: number };
  origin: Point;
  clips: Readonly<Record<string, AnimationClip>>;
  shadowId?: string;
}

export interface EntityConfig {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  solid: boolean;
  sprite: SpriteDef;
}

/** Base de tudo o que existe no mapa: posição em grade, sprite e animação (ARCHITECTURE 10.3). */
export abstract class Entity {
  readonly id: string;
  readonly mover: GridMover;
  readonly sprite: SpriteDef;
  readonly animator: SpriteAnimator;

  constructor(config: EntityConfig) {
    this.id = config.id;
    this.mover = new GridMover(config.id, config.x, config.y, config.direction, config.solid);
    this.sprite = config.sprite;
    this.animator = new SpriteAnimator(config.sprite.clips, `idle-${config.direction}`);
  }

  /** Lógica de um tick. As subclasses decidem o movimento; aqui ele avança e anima. */
  update(dt: number, grid: GridOccupancy): void {
    this.mover.savePrevious();
    this.think(grid);
    // A animação é escolhida antes de avançar: no tick em que o passo termina ela continua
    // "walk", e um passo seguido do outro não reinicia o ciclo (sem piscar para "idle").
    this.animator.play(`${this.mover.moving ? "walk" : "idle"}-${this.mover.direction}`);
    if (this.mover.advance(grid)) this.onStepEnd(grid);
    this.animator.update(dt);
  }

  /** Decide o que fazer neste tick (andar, interagir...). */
  protected think(_grid: GridOccupancy): void {}

  /** Chamado no tick em que um passo termina. */
  protected onStepEnd(_grid: GridOccupancy): void {}

  /** Posição de desenho interpolada, em pixels inteiros. */
  renderPosition(alpha: number): Point {
    return {
      x: interpolate(this.mover.prevX, this.mover.x, alpha),
      y: interpolate(this.mover.prevY, this.mover.y, alpha),
    };
  }

  drawShadow(ctx: CanvasRenderingContext2D, assets: AssetLoader, at: Point): void {
    if (!this.sprite.shadowId) return;
    ctx.drawImage(
      assets.image(this.sprite.shadowId),
      at.x - this.sprite.origin.x,
      at.y - this.sprite.origin.y,
    );
  }

  draw(ctx: CanvasRenderingContext2D, assets: AssetLoader, at: Point): void {
    const { frame, origin, imageId } = this.sprite;
    const [col, row] = this.animator.frame;
    ctx.drawImage(
      assets.image(imageId),
      col * frame.w,
      row * frame.h,
      frame.w,
      frame.h,
      at.x - origin.x,
      at.y - origin.y,
      frame.w,
      frame.h,
    );
  }
}
