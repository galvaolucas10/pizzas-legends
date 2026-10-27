import { describe, expect, it } from "vitest";
import { GameLoop, TICK_MS } from "../src/engine/GameLoop";
import { Player } from "../src/game/entities/Player";
import { GridOccupancy } from "../src/game/world/GridOccupancy";
import { FakeInput, testSprite } from "./helpers";
import type { Direction } from "../src/engine/input/InputManager";

/** Sala aberta de 40×40 tiles, sem paredes internas. */
const openGrid = () => new GridOccupancy(Array(40).fill(".".repeat(40)), 40, 40);

/** Segura uma direção por `durationMs` num monitor de `hz` e devolve a posição final do herói. */
function walk(hz: number, durationMs: number, direction: Direction) {
  const input = new FakeInput();
  input.direction = direction;
  const grid = openGrid();
  const hero = new Player(input, { x: 1, y: 1, direction: "down", sprite: testSprite });
  hero.mover.place(grid, 1, 1);
  const loop = new GameLoop({ update: (dt) => hero.update(dt, grid), render: () => {} });
  const frameMs = 1000 / hz;
  const frames = Math.round(durationMs / frameMs);
  for (let i = 0; i <= frames; i++) loop.frame(i * frameMs);
  return { x: hero.mover.x, y: hero.mover.y, frame: hero.animator.frameIndex };
}

describe("velocidade de caminhada", () => {
  it("é a mesma em 60, 120 e 144 Hz", () => {
    const at60 = walk(60, 1000, "right");
    expect(at60.x).toBe(16 + 60); // 60 ticks = 60 px, sem pausas entre os passos
    expect(walk(120, 1000, "right")).toEqual(at60);
    expect(walk(144, 1000, "right")).toEqual(at60);
  });

  it("anda 1 tile (16 px) a cada 16 ticks (~267 ms)", () => {
    expect(walk(60, 16 * TICK_MS, "down").y).toBe(16 + 16);
  });

  it("a animação não reinicia entre passos seguidos", () => {
    const input = new FakeInput();
    input.direction = "right";
    const grid = openGrid();
    const hero = new Player(input, { x: 1, y: 1, direction: "right", sprite: testSprite });
    hero.mover.place(grid, 1, 1);
    const seen: number[] = [];
    for (let tick = 0; tick < 64; tick++) {
      hero.update(TICK_MS, grid);
      seen.push(hero.animator.frameIndex);
    }
    // 64 ticks ≈ 1067 ms ≈ 7 quadros de 150 ms: o ciclo passa por todos os 4 quadros.
    expect(new Set(seen)).toEqual(new Set([0, 1, 2, 3]));
    expect(hero.animator.current).toBe("walk-right");
  });
});

describe("animação do sprite", () => {
  it("troca de quadro a cada 150 ms, independente da taxa de quadros", () => {
    const hero = new Player(new FakeInput(), { x: 0, y: 0, direction: "down", sprite: testSprite });
    hero.animator.play("walk-down");
    hero.animator.update(149);
    expect(hero.animator.frameIndex).toBe(0);
    hero.animator.update(1);
    expect(hero.animator.frameIndex).toBe(1);
    hero.animator.update(150 * 3);
    expect(hero.animator.frameIndex).toBe(0); // 4 quadros: volta ao início
  });
});
