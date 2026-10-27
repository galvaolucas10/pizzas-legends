import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cameraView } from "../../src/engine/Camera";
import { TICK_MS } from "../../src/engine/GameLoop";
import { VIEW_H, VIEW_W } from "../../src/engine/render/viewport";
import { WorldManager } from "../../src/game/world/WorldManager";
import { GridOccupancy } from "../../src/game/world/GridOccupancy";
import { content, fakeAssets, FakeInput, stubDom } from "../helpers";

let dom: ReturnType<typeof stubDom>;
beforeEach(() => {
  dom = stubDom();
  vi.stubGlobal("document", dom.document);
});
afterEach(() => vi.unstubAllGlobals());

async function world(mapId = "map.cozinha_mestre", entrance = "inicio") {
  const input = new FakeInput();
  const manager = new WorldManager({
    content: content(),
    assets: fakeAssets(),
    input,
    state: () => ({ flags: {} }),
  });
  await manager.loadMap(mapId, { entrance });
  return { manager, input };
}

/** Segura a direção até o herói parar (ou `maxTiles` passos). */
function hold(
  manager: WorldManager,
  input: FakeInput,
  direction: FakeInput["direction"],
  maxTiles = 20,
) {
  input.direction = direction;
  for (let i = 0; i < maxTiles * 16; i++) manager.update(TICK_MS);
  input.direction = null;
  for (let i = 0; i < 16; i++) manager.update(TICK_MS); // termina o passo em andamento
  return { x: manager.player.mover.tileX, y: manager.player.mover.tileY };
}

describe("GridOccupancy", () => {
  it("fora do mapa conta como parede", () => {
    const grid = new GridOccupancy(["..", ".."], 2, 2);
    expect(grid.isBlocked(-1, 0)).toBe(true);
    expect(grid.isBlocked(2, 0)).toBe(true);
    expect(grid.isBlocked(1, 1)).toBe(false);
  });

  it("duas entidades nunca reservam o mesmo tile", () => {
    const grid = new GridOccupancy(["..."], 3, 1);
    expect(grid.reserve("a", 1, 0)).toBe(true);
    expect(grid.reserve("b", 1, 0)).toBe(false);
    expect(grid.reserve("a", 1, 0)).toBe(true); // reservar de novo o próprio tile
    grid.release("b", 1, 0); // só o dono libera
    expect(grid.occupant(1, 0)).toBe("a");
    grid.release("a", 1, 0);
    expect(grid.isBlocked(1, 0)).toBe(false);
  });
});

describe("andar pelo mapa (F0-10)", () => {
  it("começa na entrada 'inicio' da cozinha", async () => {
    const { manager } = await world();
    expect([manager.player.mover.tileX, manager.player.mover.tileY]).toEqual([5, 6]);
  });

  it("respeita as paredes nas 4 direções", async () => {
    const { manager, input } = await world();
    expect(hold(manager, input, "up")).toEqual({ x: 5, y: 4 }); // parede de cima (linha 3)
    expect(hold(manager, input, "left")).toEqual({ x: 5, y: 4 }); // estante em (4,4)
    expect(hold(manager, input, "down")).toEqual({ x: 5, y: 10 }); // o tile da porta é piso
  });

  it("não atravessa a mesa nem NPCs", async () => {
    const { manager, input } = await world();
    expect(hold(manager, input, "right")).toEqual({ x: 6, y: 6 }); // mesa em (7,6)
    // Bento está em (3,7): andando para a esquerda pela linha 7, o herói para em (4,7).
    hold(manager, input, "down", 1);
    expect(hold(manager, input, "left")).toEqual({ x: 4, y: 7 });
  });

  it("NPCs ocupam seus tiles na grade", async () => {
    const { manager } = await world();
    expect(manager.grid?.occupant(7, 9)).toBe("mestre");
    expect(manager.grid?.occupant(3, 7)).toBe("bento");
    expect(manager.entityAt(7, 9)?.id).toBe("mestre");
  });

  it("carrega a despensa com colisão própria", async () => {
    const { manager, input } = await world("map.despensa", "porta");
    expect([manager.player.mover.tileX, manager.player.mover.tileY]).toEqual([5, 9]);
    expect(hold(manager, input, "up")).toEqual({ x: 5, y: 5 }); // fogão em (5,4)
  });
});

describe("câmera (ARCHITECTURE 10.4)", () => {
  it("centraliza mapas menores que a tela", () => {
    // Cozinha: 192×192 px numa tela de 384×216.
    expect(cameraView({ x: 0, y: 0 }, 192, 192)).toEqual({ x: -96, y: -12 });
  });

  it("segue o alvo e para nas bordas de mapas maiores", () => {
    const big = { w: 1000, h: 1000 };
    expect(cameraView({ x: 500, y: 500 }, big.w, big.h)).toEqual({
      x: 500 - VIEW_W / 2,
      y: 500 - VIEW_H / 2,
    });
    expect(cameraView({ x: 10, y: 10 }, big.w, big.h)).toEqual({ x: 0, y: 0 });
    expect(cameraView({ x: 990, y: 990 }, big.w, big.h)).toEqual({
      x: 1000 - VIEW_W,
      y: 1000 - VIEW_H,
    });
  });
});

describe("ordem de desenho (ARCHITECTURE 10.5)", () => {
  it("desenha chão, sombras, personagens por Y e depois a camada de cima", async () => {
    const { manager } = await world();
    dom.calls.length = 0;
    manager.render(dom.ctx, 1);
    const ids = dom.calls.map((c) => (c.image as { id?: string }).id ?? "cache");
    const characters = ids.filter((id) => id.startsWith("img.") && id !== "img.shadow");
    // Herói em y=6, Bento em y=7, Mestre em y=9: quem está mais abaixo é desenhado por cima.
    expect(characters).toEqual(["img.hero", "img.npc2", "img.npc1"]);
    expect(ids[0]).toBe("cache"); // camada de baixo
    expect(ids.at(-1)).toBe("cache"); // camada de cima (a cozinha tem tiles "over")
    expect(ids.indexOf("img.shadow")).toBeLessThan(ids.indexOf("img.hero"));
  });
});
