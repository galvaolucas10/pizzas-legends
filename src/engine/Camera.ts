import { VIEW_H, VIEW_W } from "./render/viewport";

export interface Point {
  x: number;
  y: number;
}

/**
 * Canto superior esquerdo da visão, em pixels do mundo (ARCHITECTURE 10.4).
 * - Centrada no alvo (o centro do tile seguido), sempre em pixel inteiro.
 * - Limitada às bordas do mapa: nada de área preta além do cenário.
 * - Mapa menor que a tela naquele eixo: o mapa fica centralizado.
 */
export function cameraView(
  focus: Point,
  mapWidthPx: number,
  mapHeightPx: number,
  viewW: number = VIEW_W,
  viewH: number = VIEW_H,
): Point {
  return {
    x: axis(focus.x, mapWidthPx, viewW),
    y: axis(focus.y, mapHeightPx, viewH),
  };
}

function axis(center: number, mapSize: number, viewSize: number): number {
  if (mapSize <= viewSize) return -Math.floor((viewSize - mapSize) / 2);
  const start = Math.round(center - viewSize / 2);
  return Math.min(Math.max(start, 0), mapSize - viewSize);
}
