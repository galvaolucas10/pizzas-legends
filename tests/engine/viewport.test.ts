import { describe, expect, it } from "vitest";
import {
  CAMERA_SCREEN_X,
  CAMERA_SCREEN_Y,
  VIEW_H,
  VIEW_W,
  fitToScreen,
} from "../../src/engine/render/viewport";

describe("viewport", () => {
  it("usa a resolução interna 384×216 com a câmera no centro", () => {
    expect([VIEW_W, VIEW_H]).toEqual([384, 216]);
    // O tile de 16 px seguido pela câmera fica exatamente no meio da tela.
    expect(CAMERA_SCREEN_X + 8).toBe(VIEW_W / 2);
    expect(CAMERA_SCREEN_Y + 8).toBe(VIEW_H / 2);
  });

  it.each([
    // [janela CSS, dpr, escala esperada]
    [1366, 768, 1, 3], // 1152×648
    [1920, 1080, 1, 5], // preenche a tela inteira
    [1920, 960, 1, 4], // 1080p com barra do navegador
    [2560, 1440, 1, 6], // 2304×1296
    [1536, 864, 1.25, 5], // 1080p com o Windows em 125%
    [1706.67, 960, 1.5, 6], // 1440p com o Windows em 150%
  ])("janela %ix%i (dpr %f) → escala ×%i", (w, h, dpr, scale) => {
    expect(fitToScreen(w, h, dpr).scale).toBe(scale);
  });

  it("ocupa um número inteiro de pixels físicos e fica centralizado", () => {
    const dpr = 1.25;
    const fit = fitToScreen(1536, 760, dpr); // 1920×950 físicos → ×4
    expect(fit.scale).toBe(4);
    expect(fit.cssWidth * dpr).toBe(VIEW_W * 4);
    expect(fit.cssHeight * dpr).toBe(VIEW_H * 4);
    expect(Number.isInteger(fit.cssLeft * dpr)).toBe(true);
    expect(Number.isInteger(fit.cssTop * dpr)).toBe(true);
    expect(fit.cssLeft * dpr).toBe((1920 - VIEW_W * 4) / 2);
  });

  it("nunca usa escala menor que 1, mesmo em janelas minúsculas", () => {
    const fit = fitToScreen(200, 100, 1);
    expect(fit.scale).toBe(1);
    expect(fit.cssLeft).toBe(0);
    expect(fit.cssTop).toBe(0);
  });
});
