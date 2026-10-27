import { DirectionInput } from "./DirectionInput";
import { GameLoop } from "./engine/GameLoop";
import { VIEW_H, VIEW_W, attachScreenScaler } from "./engine/render/viewport";
import { OverworldMap, OverworldMaps } from "./OverworldMap";

export class Overworld {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  map: OverworldMap | null;
  directionInput: DirectionInput;
  loop: GameLoop;

  constructor(config: { element: HTMLElement }) {
    this.element = config.element;
    const canvas = this.element.querySelector<HTMLCanvasElement>(".game-canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("Canvas .game-canvas não encontrado");
    // O canvas tem a resolução interna; o CSS só o amplia por um fator inteiro.
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    ctx.imageSmoothingEnabled = false;
    this.canvas = canvas;
    this.ctx = ctx;
    this.map = null;
    this.directionInput = new DirectionInput();
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha) => this.render(alpha),
    });
  }

  /** Um tick de lógica (dt fixo de 1/60 s). */
  update(dt: number): void {
    const map = this.map;
    if (!map) return;

    const objects = Object.values(map.gameObjects);
    objects.forEach((object) => object.savePrevious());
    objects.forEach((object) => {
      object.update({
        arrow: this.directionInput.direction,
        map,
      });
      object.sprite.update(dt);
    });
  }

  /** Desenho, interpolado entre o tick anterior e o atual. */
  render(alpha: number): void {
    const map = this.map;
    const cameraPerson = map?.gameObjects.hero;
    if (!map || !cameraPerson) return;

    //Clear off the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const camera = cameraPerson.renderPosition(alpha);

    //Draw Lower layer
    map.drawLowerImage(this.ctx, camera);

    //Draw Game Objects
    Object.values(map.gameObjects).forEach((object) => {
      object.sprite.draw(this.ctx, object.renderPosition(alpha), camera);
    });

    //Draw Upper layer
    map.drawUpperImage(this.ctx, camera);
  }

  init(): void {
    const demoRoom = OverworldMaps.DemoRoom;
    if (!demoRoom) throw new Error("Mapa DemoRoom não encontrado");
    this.map = new OverworldMap(demoRoom);
    this.map.mountObjects();

    this.directionInput.init();
    attachScreenScaler(this.element);

    // Aba oculta: para o loop. Ao voltar, recomeça sem "pular" o tempo perdido (ARCHITECTURE 5.3).
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.loop.stop();
      else this.loop.start();
    });

    this.loop.start();
  }
}
