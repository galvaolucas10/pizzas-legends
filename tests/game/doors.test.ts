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
  it("cozinha → salão → avenida e volta, preservando o controle e a direção", async () => {
    const g = await game();
    await walk(g, "down", 4); // porta de baixo da cozinha (5,10)
    expect(g.where()).toEqual({ map: "map.salao", x: 7, y: 4, direction: "down" });

    // Do salão até a seta (6,12), que sai na avenida em frente à pizzaria.
    await walk(g, "down", 2); // (7,6)
    await walk(g, "left", 1); // (6,6)
    await walk(g, "down", 6); // (6,12)
    expect(g.where()).toEqual({ map: "map.vila", x: 5, y: 10, direction: "down" });

    // A porta da pizzaria leva de volta ao salão; a porta do fundo, à cozinha.
    await walk(g, "up", 1);
    expect(g.where()).toEqual({ map: "map.salao", x: 6, y: 11, direction: "up" });
    await walk(g, "up", 5); // (6,6)
    await walk(g, "right", 1); // (7,6)
    await walk(g, "up", 3); // porta (7,3)
    expect(g.where()).toEqual({ map: "map.cozinha_mestre", x: 5, y: 9, direction: "up" });
    expect(g.input.activeContext).toBe("world");
  });

  it("passagem do fundo leva à despensa, e a seta no chão volta à cozinha do Mestre", async () => {
    const g = await game();
    await walk(g, "up", 1); // (5,5)
    await walk(g, "right", 2); // (7,5)
    await walk(g, "up", 1); // abertura (7,4)
    expect(g.where()).toEqual({ map: "map.despensa", x: 4, y: 5, direction: "down" });

    await walk(g, "right", 1); // (5,5)
    await walk(g, "down", 5); // (5,10): seta
    // Volta à cozinha do Mestre, logo abaixo da passagem (não sai na rua pela porta do salão).
    expect(g.where()).toEqual({ map: "map.cozinha_mestre", x: 7, y: 5, direction: "down" });
  });

  it("avenida ↔ loja e praça ↔ Neon Greens", async () => {
    const g = await game();
    await g.scene.loadMap("map.vila", { entrance: "loja" }); // (29,10)
    await walk(g, "up", 1);
    expect(g.where()).toMatchObject({ map: "map.loja", x: 5, y: 11 });
    await walk(g, "down", 1);
    expect(g.where()).toMatchObject({ map: "map.vila", x: 29, y: 10 });

    await g.scene.loadMap("map.vila", { entrance: "praca" }); // (25,6)
    await walk(g, "up", 1);
    expect(g.where()).toMatchObject({ map: "map.praca", x: 7, y: 15 });
    await walk(g, "down", 1);
    expect(g.where()).toMatchObject({ map: "map.vila", x: 25, y: 6 });

    await g.scene.loadMap("map.praca", { entrance: "estufa" }); // (7,6)
    await walk(g, "up", 1);
    expect(g.where()).toMatchObject({ map: "map.estufa", x: 5, y: 11 });
    await walk(g, "down", 1);
    expect(g.where()).toMatchObject({ map: "map.praca", x: 7, y: 6 });
  });

  it("segurar a tecla depois da porta não anda sem querer", async () => {
    const g = await game();
    g.input.press("down");
    await g.tick(4 * 16);
    await g.settle();
    await g.tick(60); // continua segurando "baixo" por 1 s depois de chegar ao salão
    expect(g.where()).toMatchObject({ map: "map.salao", x: 7, y: 4 });
    g.input.release("down");
    await g.tick(); // uma pessoa leva pelo menos um tick para soltar e apertar de novo
    g.input.press("down"); // soltar e apertar de novo: agora anda
    await g.tick(16);
    expect(g.where()).toMatchObject({ map: "map.salao", x: 7, y: 5 });
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
