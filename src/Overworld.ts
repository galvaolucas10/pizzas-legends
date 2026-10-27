import { DirectionInput } from "./DirectionInput";
import { OverworldMap, OverworldMaps } from "./OverworldMap";

export class Overworld {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  map: OverworldMap | null;
  directionInput: DirectionInput;

  constructor(config: { element: HTMLElement }) {
    this.element = config.element;
    const canvas = this.element.querySelector<HTMLCanvasElement>(".game-canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("Canvas .game-canvas não encontrado");
    this.canvas = canvas;
    this.ctx = ctx;
    this.map = null;
    this.directionInput = new DirectionInput();
  }

  startGameLoop(): void {
    const step = () => {
      const map = this.map;
      const cameraPerson = map?.gameObjects.hero;
      if (!map || !cameraPerson) return;

      //Clear off the canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      //Update all objects
      Object.values(map.gameObjects).forEach((object) => {
        object.update({
          arrow: this.directionInput.direction,
          map,
        });
      });

      //Draw Lower layer
      map.drawLowerImage(this.ctx, cameraPerson);

      //Draw Game Objects
      Object.values(map.gameObjects).forEach((object) => {
        object.sprite.draw(this.ctx, cameraPerson);
      });

      //Draw Upper layer
      map.drawUpperImage(this.ctx, cameraPerson);

      requestAnimationFrame(() => {
        step();
      });
    };
    step();
  }

  init(): void {
    const demoRoom = OverworldMaps.DemoRoom;
    if (!demoRoom) throw new Error("Mapa DemoRoom não encontrado");
    this.map = new OverworldMap(demoRoom);
    this.map.mountObjects();

    this.directionInput.init();

    this.startGameLoop();
  }
}
