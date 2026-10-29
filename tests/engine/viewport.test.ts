import { describe, expect, it } from "vitest";
import {
  MAX_VIEW_W,
  MIN_VIEW_W,
  VIEW_H,
  VIEW_W,
  fitToScreen,
} from "../../src/engine/render/viewport";

describe("viewport (tela cheia)", () => {
  it("começa em 384×216 de pixels de jogo", () => {
    expect([VIEW_W, VIEW_H]).toEqual([384, 216]);
  });

  it.each([
    // [janela CSS, dpr]
    [1920, 1080, 1], // 16:9
    [1366, 768, 1],
    [2532 / 3, 1170 / 3, 3], // iPhone deitado (19,5:9)
    [1706.67, 960, 1.5],
  ])("janela %ix%i (dpr %f): ocupa a tela toda, sem faixas pretas", (w, h, dpr) => {
    const fit = fitToScreen(w, h, dpr);
    const deviceW = Math.floor(w * dpr);
    const deviceH = Math.floor(h * dpr);
    expect(Math.abs(fit.cssWidth * dpr - deviceW)).toBeLessThanOrEqual(fit.scale);
    expect(Math.abs(fit.cssHeight * dpr - deviceH)).toBeLessThanOrEqual(1);
    expect(fit.viewW).toBeGreaterThanOrEqual(MIN_VIEW_W);
    expect(fit.viewW).toBeLessThanOrEqual(MAX_VIEW_W);
  });

  it("celular deitado ganha largura: a visão fica mais larga que 384", () => {
    expect(fitToScreen(844, 390, 3).viewW).toBeGreaterThan(384);
  });

  it("celular em pé: a largura mínima cabe na tela (faixas em cima e embaixo)", () => {
    const fit = fitToScreen(390, 844, 3);
    expect(fit.viewW).toBe(MIN_VIEW_W);
    expect(fit.cssWidth).toBeLessThanOrEqual(390 + 1);
  });

  it("nunca usa escala menor que 1, mesmo em janelas minúsculas", () => {
    expect(fitToScreen(200, 100, 1).scale).toBe(1);
  });
});
