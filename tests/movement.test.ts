import { beforeAll, describe, expect, it, vi } from "vitest";
import type { OverworldMap } from "../src/OverworldMap";
import type { Direction } from "../src/utils";

// Os testes rodam em Node, sem DOM: basta uma imagem falsa para o Sprite.
beforeAll(() => {
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      onload: (() => void) | null = null;
    },
  );
});

/** Mapa mínimo: sem paredes, só o que o Person usa ao andar. */
const openMap = {
  isSpaceTaken: () => false,
  moveWall: () => {},
} as unknown as OverworldMap;

/** Segura uma direção por `durationMs` num monitor de `hz` e devolve a posição final do herói. */
async function walk(hz: number, durationMs: number, arrow: Direction) {
  const { GameLoop } = await import("../src/engine/GameLoop");
  const { Person } = await import("../src/Person");
  const hero = new Person({ isPlayerControlled: true, x: 0, y: 0 });
  const loop = new GameLoop({
    update: (dt) => {
      hero.savePrevious();
      hero.update({ arrow, map: openMap });
      hero.sprite.update(dt);
    },
    render: () => {},
  });
  const frameMs = 1000 / hz;
  const frames = Math.round(durationMs / frameMs);
  for (let i = 0; i <= frames; i++) loop.frame(i * frameMs);
  return { x: hero.x, y: hero.y, frame: hero.sprite.currentAnimationFrame };
}

describe("velocidade de caminhada", () => {
  it("é a mesma em 60, 120 e 144 Hz", async () => {
    const at60 = await walk(60, 1000, "right");
    expect(at60.x).toBe(60); // 60 ticks = 60 px = 3,75 tiles, sem pausas entre os passos
    expect(await walk(120, 1000, "right")).toEqual(at60);
    expect(await walk(144, 1000, "right")).toEqual(at60);
  });

  it("anda 1 tile (16 px) a cada 16 ticks (~267 ms)", async () => {
    // 60 Hz: 1 quadro = 1 tick, então 16 quadros = 16 ticks exatos.
    const { TICK_MS } = await import("../src/engine/GameLoop");
    const result = await walk(60, 16 * TICK_MS, "down");
    expect(result.y).toBe(16);
  });
});

describe("animação do sprite", () => {
  it("troca de quadro a cada 150 ms, independente da taxa de quadros", async () => {
    const { Person } = await import("../src/Person");
    const hero = new Person({ x: 0, y: 0 });
    hero.sprite.setAnimation("walk-down");
    hero.sprite.update(149);
    expect(hero.sprite.currentAnimationFrame).toBe(0);
    hero.sprite.update(1);
    expect(hero.sprite.currentAnimationFrame).toBe(1);
    hero.sprite.update(150 * 3);
    expect(hero.sprite.currentAnimationFrame).toBe(0); // 4 quadros: volta ao início
  });
});
