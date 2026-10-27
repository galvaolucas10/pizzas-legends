import { describe, expect, it } from "vitest";
import { GameLoop, MAX_FRAME_MS, TICK_MS } from "../../src/engine/GameLoop";
import { interpolate } from "../../src/engine/interpolate";

/** Roda o loop por `durationMs` simulando um monitor de `hz` quadros por segundo. */
function simulate(hz: number, durationMs: number) {
  let ticks = 0;
  const alphas: number[] = [];
  const loop = new GameLoop({
    update: () => ticks++,
    render: (alpha) => alphas.push(alpha),
  });
  const frameMs = 1000 / hz;
  const frames = Math.round(durationMs / frameMs);
  for (let i = 0; i <= frames; i++) loop.frame(i * frameMs);
  return { ticks, alphas, clock: loop.clock.elapsedMs };
}

describe("GameLoop", () => {
  it("roda a mesma quantidade de ticks em 60, 120 e 144 Hz", () => {
    expect(simulate(60, 1000).ticks).toBe(60);
    expect(simulate(120, 1000).ticks).toBe(60);
    expect(simulate(144, 1000).ticks).toBe(60);
  });

  it("monitores lentos (30 Hz) rodam 2 ticks por quadro", () => {
    expect(simulate(30, 1000).ticks).toBe(60);
  });

  it("o relógio do jogo acompanha os ticks", () => {
    expect(simulate(144, 1000).clock).toBeCloseTo(60 * TICK_MS);
  });

  it("alpha fica sempre entre 0 e 1", () => {
    for (const alpha of simulate(144, 1000).alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it("limita um quadro travado a MAX_FRAME_MS", () => {
    let ticks = 0;
    const loop = new GameLoop({ update: () => ticks++, render: () => {} });
    loop.frame(0);
    loop.frame(5000);
    expect(ticks).toBe(Math.round(MAX_FRAME_MS / TICK_MS)); // 15 ticks, não 300
  });

  it("resetTiming descarta o tempo parado", () => {
    let ticks = 0;
    const loop = new GameLoop({ update: () => ticks++, render: () => {} });
    loop.frame(0);
    loop.resetTiming();
    loop.frame(10_000);
    expect(ticks).toBe(0);
  });

  it("start/stop usam o agendador de quadros injetado", () => {
    const pending: ((now: number) => void)[] = [];
    let ticks = 0;
    const loop = new GameLoop({
      update: () => ticks++,
      render: () => {},
      requestFrame: (cb) => pending.push(cb),
      cancelFrame: () => pending.splice(0),
    });
    loop.start();
    pending.shift()?.(0);
    pending.shift()?.(1000 / 60 + 0.01);
    expect(ticks).toBe(1);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(pending).toHaveLength(0);
  });
});

describe("interpolate", () => {
  it("arredonda para pixel inteiro", () => {
    expect(interpolate(0, 1, 0.4)).toBe(0);
    expect(interpolate(0, 1, 0.6)).toBe(1);
    expect(interpolate(10, 20, 0.5)).toBe(15);
  });
});
