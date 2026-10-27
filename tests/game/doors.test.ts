import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import { FADE_MS, SceneStack } from "../../src/engine/SceneStack";
import { WorldScene } from "../../src/game/scenes/WorldScene";
import { WorldManager } from "../../src/game/world/WorldManager";
import { content, fakeAssets, stubDom } from "../helpers";

beforeEach(() => vi.stubGlobal("document", stubDom().document));
afterEach(() => vi.unstubAllGlobals());

async function game() {
  const input = new InputManager();
  const scenes = new SceneStack({
    onTransitionStart: () => input.pushContext("transition"),
    onTransitionEnd: () => input.popContext("transition"),
  });
  const world = new WorldManager({
    content: content(),
    assets: fakeAssets(),
    input: input.reader("world"),
    state: () => ({ flags: {} }),
  });
  const scene = new WorldScene({ world, input, transition: (work) => scenes.transition(work) });
  await scene.loadMap("map.cozinha_mestre", { entrance: "inicio" });
  await scenes.push(scene);

  const tick = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.poll();
      scenes.update(TICK_MS);
      await scene.loading; // o carregamento do mapa é assíncrono (assets)
    }
  };
  /** Roda até a transição terminar (ou `maxTicks`). */
  const settle = async (maxTicks = 300) => {
    for (let i = 0; i < maxTicks && (scenes.inTransition || world.player.mover.moving); i++)
      await tick();
  };
  const where = () => ({
    map: world.map?.id,
    x: world.player.mover.tileX,
    y: world.player.mover.tileY,
    direction: world.player.mover.direction,
  });
  return { input, scenes, scene, world, tick, settle, where };
}

describe("portas (F0-12)", () => {
  it("ida e volta cozinha ↔ despensa preservando o controle e a direção", async () => {
    const g = await game();
    // Da entrada (5,6), 4 passos para baixo chegam à porta (5,10).
    g.input.press("down");
    await g.tick(4 * 16);
    expect(g.scenes.inTransition).toBe(true);
    await g.settle();
    g.input.release("down");
    expect(g.where()).toEqual({ map: "map.despensa", x: 5, y: 9, direction: "up" });

    // O controle volta ao jogador: anda para cima na despensa.
    g.input.press("up");
    await g.tick(16);
    g.input.release("up");
    await g.settle();
    expect(g.where()).toMatchObject({ map: "map.despensa", x: 5, y: 8 });

    // E volta pela porta da despensa para a cozinha.
    g.input.press("down");
    await g.tick(2 * 16);
    await g.settle();
    g.input.release("down");
    expect(g.where()).toEqual({ map: "map.cozinha_mestre", x: 5, y: 9, direction: "up" });
    expect(g.input.activeContext).toBe("world");
  });

  it("a passagem do fundo da cozinha leva à despensa e volta", async () => {
    const g = await game();
    // Da entrada (5,6): direita até (7,5) pela linha 5 e depois para cima, na abertura (7,4).
    g.input.press("up");
    await g.tick(16);
    g.input.release("up");
    await g.settle();
    g.input.press("right");
    await g.tick(2 * 16);
    g.input.release("right");
    await g.settle();
    expect(g.where()).toMatchObject({ map: "map.cozinha_mestre", x: 7, y: 5 });
    g.input.press("up");
    await g.tick(16);
    await g.settle();
    g.input.release("up");
    expect(g.where()).toEqual({ map: "map.despensa", x: 4, y: 5, direction: "down" });

    // Na despensa, o vão do fundo (4,4) leva de volta.
    await g.tick();
    g.input.press("up");
    await g.tick(16);
    await g.settle();
    g.input.release("up");
    expect(g.where()).toEqual({ map: "map.cozinha_mestre", x: 7, y: 5, direction: "down" });
  });

  it("segurar a tecla depois da porta não leva de volta sem querer", async () => {
    const g = await game();
    g.input.press("down");
    await g.tick(4 * 16);
    await g.settle();
    await g.tick(60); // continua segurando "baixo" por 1 s
    expect(g.where()).toMatchObject({ map: "map.despensa", x: 5, y: 9 });
    g.input.release("down");
    await g.tick(); // uma pessoa leva pelo menos um tick para soltar e apertar de novo
    g.input.press("down"); // soltar e apertar de novo: agora entra na porta
    await g.tick(16);
    expect(g.scenes.inTransition).toBe(true);
  });

  it("o fade escurece, troca o mapa com a tela preta e clareia", async () => {
    const g = await game();
    const opacities: number[] = [];
    g.scene.goTo("map.despensa", "porta");
    for (let i = 0; i < Math.ceil((2 * FADE_MS) / TICK_MS) + 4; i++) {
      await g.tick();
      opacities.push(g.scenes.fadeOpacity());
    }
    const peak = opacities.indexOf(1);
    expect(peak).toBeGreaterThan(0);
    expect(opacities.slice(0, peak)).toEqual([...opacities.slice(0, peak)].sort((a, b) => a - b));
    expect(opacities.at(-1)).toBe(0);
    expect(g.world.map?.id).toBe("map.despensa");
  });

  it("a entrada é ignorada durante a transição", async () => {
    const g = await game();
    g.scene.goTo("map.despensa", "porta");
    g.input.press("left");
    await g.tick(5);
    expect(g.input.activeContext).toBe("transition");
    expect(g.world.player.mover.moving).toBe(false);
  });

  it("o evento changeMap também troca de mapa", async () => {
    const g = await game();
    g.scene.events.runBlocking([{ type: "changeMap", mapId: "map.despensa", entrance: "porta" }]);
    await g.tick();
    await g.settle();
    expect(g.where()).toMatchObject({ map: "map.despensa", x: 5, y: 9 });
    expect(g.input.activeContext).toBe("world");
  });
});
