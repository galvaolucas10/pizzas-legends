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

/** Anda `tiles` passos numa direção e solta a tecla (espera transições terminarem). */
async function walk(
  g: Awaited<ReturnType<typeof game>>,
  direction: "up" | "down" | "left" | "right",
  tiles: number,
) {
  g.input.press(direction);
  await g.tick(tiles * 16);
  await g.settle();
  g.input.release(direction);
  await g.tick();
}

describe("portas (F0-12) e mundo da demo", () => {
  it("cozinha ↔ vila pela porta de baixo, preservando o controle e a direção", async () => {
    const g = await game();
    // Da entrada (5,6), 4 passos para baixo chegam à porta (5,10).
    await walk(g, "down", 4);
    expect(g.where()).toEqual({ map: "map.vila", x: 6, y: 7, direction: "down" });

    // O controle volta ao jogador e a porta da Casa do Mestre (6,6) leva de volta.
    await walk(g, "up", 1);
    expect(g.where()).toEqual({ map: "map.cozinha_mestre", x: 5, y: 9, direction: "up" });
    expect(g.input.activeContext).toBe("world");
  });

  it("passagem do fundo leva à despensa, e a seta no chão leva de volta para fora", async () => {
    const g = await game();
    await walk(g, "up", 1); // (5,5)
    await walk(g, "right", 2); // (7,5)
    await walk(g, "up", 1); // abertura (7,4)
    expect(g.where()).toEqual({ map: "map.despensa", x: 4, y: 5, direction: "down" });

    // Na despensa, a seta no chão (5,10) é a saída: leva à vila, na porta da despensa.
    await walk(g, "right", 1); // (5,5)
    await walk(g, "down", 5); // (5,10): seta
    expect(g.where()).toEqual({ map: "map.vila", x: 23, y: 7, direction: "down" });

    // E a porta da despensa, na vila, leva para dentro de novo (chegando acima da seta).
    await walk(g, "up", 1);
    expect(g.where()).toEqual({ map: "map.despensa", x: 5, y: 9, direction: "up" });
  });

  it("vila → bosque → clareira e volta, pelas bordas dos mapas", async () => {
    const g = await game();
    await g.scene.loadMap("map.vila", { entrance: "bosque" }); // (30,9), na saída leste
    await walk(g, "right", 1);
    expect(g.where()).toMatchObject({ map: "map.bosque", x: 1, y: 15 });
    await g.scene.loadMap("map.bosque", { entrance: "clareira" }); // (38,8)
    await walk(g, "right", 1);
    expect(g.where()).toMatchObject({ map: "map.clareira", x: 1, y: 9 });
    await walk(g, "left", 1);
    expect(g.where()).toMatchObject({ map: "map.bosque", x: 38, y: 8 });
    await g.scene.loadMap("map.bosque", { entrance: "vila" }); // (1,15)
    await walk(g, "left", 1);
    expect(g.where()).toMatchObject({ map: "map.vila", x: 30, y: 9 });
  });

  it("segurar a tecla depois da porta não anda sem querer", async () => {
    const g = await game();
    g.input.press("down");
    await g.tick(4 * 16);
    await g.settle();
    await g.tick(60); // continua segurando "baixo" por 1 s depois de chegar na vila
    expect(g.where()).toMatchObject({ map: "map.vila", x: 6, y: 7 });
    g.input.release("down");
    await g.tick(); // uma pessoa leva pelo menos um tick para soltar e apertar de novo
    g.input.press("down"); // soltar e apertar de novo: agora anda
    await g.tick(16);
    expect(g.where()).toMatchObject({ map: "map.vila", x: 6, y: 8 });
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
