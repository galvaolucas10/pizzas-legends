/**
 * Forno de tijolos desenhado em código (16 px de largura, 24 px de altura), para mapas cuja
 * arte não tem forno. `x`, `y` são o canto superior esquerdo do tile do forno, já com a câmera.
 * `time` (ms) anima o fogo.
 */
export function drawBrickOven(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
): void {
  const top = y - 8; // a cúpula sobe meio tile sobre a parede
  const px = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, top + dy, w, h);
  };
  // Cúpula e corpo.
  px(3, 0, 10, 2, "#7a3b22");
  px(1, 2, 14, 2, "#8e4528");
  px(0, 4, 16, 20, "#a4522f");
  // Fiadas de tijolo.
  for (let row = 0; row < 5; row++) {
    const dy = 6 + row * 4;
    px(0, dy, 16, 1, "#7a3b22");
    const offset = row % 2 === 0 ? 4 : 0;
    for (let col = offset; col < 16; col += 8) px(col, dy - 3, 1, 3, "#7a3b22");
  }
  // Boca do forno com o fogo.
  px(3, 10, 10, 9, "#2a1410");
  const flicker = Math.floor(time / 120) % 3;
  px(4, 14 + (flicker === 1 ? 1 : 0), 8, 5 - (flicker === 1 ? 1 : 0), "#e8742c");
  px(5, 16 - (flicker === 2 ? 1 : 0), 6, 3 + (flicker === 2 ? 1 : 0), "#f6c142");
  px(7, 17, 2, 2, "#fff3c4");
  // Base de pedra.
  px(0, 21, 16, 3, "#6b5a4e");
  px(0, 21, 16, 1, "#8a786a");
}
