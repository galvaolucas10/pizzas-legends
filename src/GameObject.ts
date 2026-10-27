import { interpolate } from "./engine/interpolate";
import type { OverworldMap } from "./OverworldMap";
import { Sprite, type Point } from "./Sprite";
import { utils, type Direction } from "./utils";

export interface BehaviorEvent {
  type: "walk" | "stand";
  direction: Direction;
  time?: number;
  who?: string;
}

export interface GameObjectConfig {
  x?: number;
  y?: number;
  direction?: Direction;
  src?: string;
  behaviorLoop?: BehaviorEvent[];
}

export interface UpdateState {
  arrow: Direction | undefined;
  map: OverworldMap;
}

export class GameObject {
  id: string | null;
  isMounted: boolean;
  x: number;
  y: number;
  /** Posição no tick anterior, para interpolar o desenho entre ticks. */
  prevX: number;
  prevY: number;
  direction: Direction;
  sprite: Sprite;
  behaviorLoop: BehaviorEvent[];
  behaviorLoopIndex: number;

  constructor(config: GameObjectConfig) {
    this.id = null;
    this.isMounted = false;
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.direction = config.direction || "down";
    this.sprite = new Sprite({
      gameObject: this,
      src: config.src || utils.asset("images/hero.png"),
    });

    this.behaviorLoop = config.behaviorLoop || [];
    this.behaviorLoopIndex = 0;
  }

  /** Guarda a posição atual antes de cada tick. */
  savePrevious(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Posição de desenho entre o tick anterior e o atual, em pixels inteiros. */
  renderPosition(alpha: number): Point {
    return {
      x: interpolate(this.prevX, this.x, alpha),
      y: interpolate(this.prevY, this.y, alpha),
    };
  }

  mount(map: OverworldMap): void {
    this.isMounted = true;
    map.addWall(this.x, this.y);

    //If we have a behavior, kick off after a short delay
    setTimeout(() => {
      this.doBehaviorEvent(map);
    }, 10);
  }

  update(_state: UpdateState): void {}

  doBehaviorEvent(_map: OverworldMap): void {
    // F0-02: objetos sem comportamento não fazem nada (antes: erro com eventConfig undefined).
    const eventConfig = this.behaviorLoop[this.behaviorLoopIndex];
    if (!eventConfig) return;

    // A classe OverworldEvent nunca existiu no projeto. O behaviorLoop passa a ser
    // executado pelo EventSystem (roadmap F0-11); até lá, os NPCs ficam parados.
  }
}
