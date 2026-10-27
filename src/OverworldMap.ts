import { GameObject } from "./GameObject";
import { Person } from "./Person";
import { utils, type Direction } from "./utils";

export interface OverworldMapConfig {
  lowerSrc: string;
  upperSrc: string;
  gameObjects: Record<string, GameObject>;
  walls?: Record<string, boolean>;
}

export class OverworldMap {
  gameObjects: Record<string, GameObject>;
  walls: Record<string, boolean>;
  lowerImage: HTMLImageElement;
  upperImage: HTMLImageElement;

  constructor(config: OverworldMapConfig) {
    this.gameObjects = config.gameObjects;
    this.walls = config.walls || {};

    this.lowerImage = new Image();
    this.lowerImage.src = config.lowerSrc;

    this.upperImage = new Image();
    this.upperImage.src = config.upperSrc;
  }

  drawLowerImage(ctx: CanvasRenderingContext2D, cameraPerson: GameObject): void {
    ctx.drawImage(
      this.lowerImage,
      utils.withGrid(10.5) - cameraPerson.x,
      utils.withGrid(6) - cameraPerson.y,
    );
  }

  drawUpperImage(ctx: CanvasRenderingContext2D, cameraPerson: GameObject): void {
    ctx.drawImage(
      this.upperImage,
      utils.withGrid(10.5) - cameraPerson.x,
      utils.withGrid(6) - cameraPerson.y,
    );
  }

  isSpaceTaken(currentX: number, currentY: number, direction: Direction): boolean {
    const { x, y } = utils.nextPosition(currentX, currentY, direction);
    return this.walls[`${x},${y}`] || false;
  }

  mountObjects(): void {
    Object.keys(this.gameObjects).forEach((key) => {
      const object = this.gameObjects[key];
      if (!object) return;
      object.id = key;

      //TODO: determine if this object should actually mount
      object.mount(this);
    });
  }

  addWall(x: number, y: number): void {
    this.walls[`${x},${y}`] = true;
  }
  removeWall(x: number, y: number): void {
    delete this.walls[`${x},${y}`];
  }
  moveWall(wasX: number, wasY: number, direction: Direction): void {
    this.removeWall(wasX, wasY);
    const { x, y } = utils.nextPosition(wasX, wasY, direction);
    this.addWall(x, y);
  }
}

// Antes era window.OverworldMap (sobrescrevendo a classe no escopo global).
export const OverworldMaps: Record<string, OverworldMapConfig> = {
  DemoRoom: {
    lowerSrc: utils.asset("images/demo_lower.png"),
    upperSrc: utils.asset("images/demo_upper.png"),
    gameObjects: {
      hero: new Person({
        isPlayerControlled: true,
        x: utils.withGrid(5),
        y: utils.withGrid(6),
      }),
      npcA: new Person({
        x: utils.withGrid(7),
        y: utils.withGrid(9),
        src: utils.asset("images/npc1.png"),
        behaviorLoop: [
          { type: "stand", direction: "left", time: 800 },
          { type: "stand", direction: "up", time: 800 },
          { type: "stand", direction: "right", time: 1200 },
          { type: "stand", direction: "up", time: 300 },
        ],
      }),
      npcB: new Person({
        x: utils.withGrid(3),
        y: utils.withGrid(7),
        src: utils.asset("images/npc2.png"),
        behaviorLoop: [
          { type: "walk", direction: "left" },
          { type: "stand", direction: "up", time: 800 },
          { type: "walk", direction: "up" },
          { type: "walk", direction: "right" },
          { type: "walk", direction: "down" },
        ],
      }),
    },
    walls: {
      [utils.asGridCoord(7, 6)]: true,
      [utils.asGridCoord(8, 6)]: true,
      [utils.asGridCoord(7, 7)]: true,
      [utils.asGridCoord(8, 7)]: true,
    },
  },
  // Coordenadas em tiles (inconsistentes com o DemoRoom): o mapa será refeito no Tiled (F0-08).
  Kitchen: {
    lowerSrc: utils.asset("images/kitchen_lower.png"),
    upperSrc: utils.asset("images/kitchen_upper.png"),
    gameObjects: {
      hero: new GameObject({
        x: 3,
        y: 5,
      }),
      npcA: new GameObject({
        x: 9,
        y: 6,
        src: utils.asset("images/npc2.png"),
      }),
      npcB: new GameObject({
        x: 10,
        y: 8,
        src: utils.asset("images/npc3.png"),
      }),
    },
  },
};
