/**
 * Veículos da avenida em pixel art (desenhados por código, sem imagens): carros de 4 modelos
 * e a moto de entrega. Tudo em retângulos inteiros para ficar nítido na escala do jogo.
 * Coordenadas: (x, y) é o centro da base do veículo na faixa; desenho voltado para a direita
 * e espelhado quando anda para a esquerda.
 */

export type CarKind = "sedan" | "hatch" | "van" | "taxi";
export const CAR_KINDS: readonly CarKind[] = ["sedan", "hatch", "van", "taxi"];

/** Largura dos carros (para o laço da avenida). */
export const CAR_WIDTH = 34;
export const MOTO_WIDTH = 22;

/** Clareia (amount > 0) ou escurece (amount < 0) uma cor #rrggbb. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** Disco "pixelado" (linhas de retângulos), nítido em qualquer escala. */
function disc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

function rect(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Roda com pneu, aro e calota; os raios giram com o tempo. */
function wheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  spin: number,
): void {
  disc(ctx, cx, cy, r, "#151515"); // pneu
  disc(ctx, cx, cy, r - 1, "#2a2a2a");
  disc(ctx, cx, cy, Math.max(1, r - 2), "#9aa3ab"); // aro
  const frame = Math.floor(spin) % 2;
  rect(ctx, "#5c656d", cx - (frame ? 0 : 1), cy - (frame ? 1 : 0), frame ? 1 : 3, frame ? 3 : 1); // raio
  rect(ctx, "#dfe6ec", cx, cy, 1, 1); // centro
}

/** Sombra suave no asfalto. */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  rect(ctx, "#000", x + 2, y + 1, w - 4, 2);
  rect(ctx, "#000", x + 4, y + 3, w - 8, 1);
  ctx.restore();
}

/** Carro em perspectiva lateral com teto, vidros, faróis, portas e rodas girando. */
export function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: CarKind,
  color: string,
  direction: 1 | -1,
  timeMs: number,
): void {
  const w = CAR_WIDTH;
  const left = Math.round(x - w / 2);
  const base = Math.round(y + 6); // linha do chão (embaixo das rodas)
  ctx.save();
  if (direction < 0) {
    // Espelha em torno do centro do carro.
    ctx.translate(left * 2 + w, 0);
    ctx.scale(-1, 1);
  }
  const body = kind === "taxi" ? "#f2c418" : color;
  const light = shade(body, 0.35);
  const dark = shade(body, -0.35);
  const darker = shade(body, -0.55);
  shadow(ctx, left, base, w);

  // Lataria de baixo (com sombreado embaixo e brilho em cima).
  const bodyTop = base - 10;
  rect(ctx, darker, left, bodyTop, w, 9); // contorno
  rect(ctx, body, left + 1, bodyTop + 1, w - 2, 6);
  rect(ctx, light, left + 2, bodyTop + 1, w - 4, 1); // brilho
  rect(ctx, dark, left + 1, bodyTop + 6, w - 2, 2); // saia escura
  // Para-choques, farol e lanterna.
  rect(ctx, "#c9d1d8", left + w - 2, bodyTop + 5, 2, 2);
  rect(ctx, "#c9d1d8", left, bodyTop + 5, 2, 2);
  rect(ctx, "#fff3a6", left + w - 2, bodyTop + 2, 2, 2); // farol
  rect(ctx, "#ffffff", left + w - 1, bodyTop + 2, 1, 1);
  rect(ctx, "#d62828", left, bodyTop + 2, 1, 3); // lanterna

  // Cabine (teto + vidros), formato por modelo.
  const cab =
    kind === "van"
      ? { from: 3, to: w - 7, rise: 9, slant: 2 }
      : kind === "hatch"
        ? { from: 7, to: w - 9, rise: 7, slant: 3 }
        : { from: 8, to: w - 10, rise: 7, slant: 4 };
  const cabTop = bodyTop - cab.rise;
  for (let row = 0; row < cab.rise; row++) {
    // Para-brisa inclinado na frente; traseira mais reta.
    const inset = Math.round(((cab.rise - row) / cab.rise) * cab.slant);
    const x0 = left + cab.from + (kind === "van" ? 0 : Math.round(inset / 2));
    const x1 = left + cab.to + 4 - inset;
    rect(ctx, row === 0 ? darker : dark, x0, cabTop + row, x1 - x0, 1);
  }
  rect(ctx, light, left + cab.from + 2, cabTop, cab.to - cab.from - 2, 1); // brilho do teto
  // Vidros (azul com reflexo) e coluna do meio.
  const glassTop = cabTop + 2;
  const glassH = cab.rise - 3;
  const g0 = left + cab.from + 2;
  const g1 = left + cab.to + 1;
  rect(ctx, "#7fb8d8", g0, glassTop, g1 - g0, glassH);
  rect(ctx, "#bfe3f5", g0 + 1, glassTop, 2, glassH - 1); // reflexo
  const mid = Math.round((g0 + g1) / 2);
  rect(ctx, darker, mid, glassTop, 1, glassH); // coluna
  if (kind === "van") rect(ctx, darker, g0 + Math.round((g1 - g0) / 3), glassTop, 1, glassH);

  // Portas e maçanetas.
  rect(ctx, darker, mid, bodyTop + 1, 1, 6);
  rect(ctx, "#e6e6e6", mid - 4, bodyTop + 3, 2, 1);
  rect(ctx, "#e6e6e6", mid + 3, bodyTop + 3, 2, 1);

  // Táxi: placa no teto e faixa quadriculada.
  if (kind === "taxi") {
    rect(ctx, "#222", mid - 3, cabTop - 3, 7, 3);
    rect(ctx, "#fff7c2", mid - 2, cabTop - 2, 5, 1);
    for (let i = 0; i < w - 4; i += 2)
      rect(ctx, i % 4 ? "#222" : "#fff", left + 2 + i, bodyTop + 4, 2, 1);
  }

  // Rodas (girando conforme anda).
  const spin = timeMs / 90;
  wheel(ctx, left + 7, base - 2, 3, spin);
  wheel(ctx, left + w - 8, base - 2, 3, spin);
  ctx.restore();
}

/**
 * Moto de entrega: rodas com raios, tanque, banco, escapamento, guidão, baú de pizza e o
 * motoboy de capacete (só quando está andando).
 */
export function drawMoto(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 1 | -1,
  rider: boolean,
  timeMs: number,
): void {
  const w = MOTO_WIDTH;
  const left = Math.round(x - w / 2);
  const base = Math.round(y + 6);
  ctx.save();
  if (direction < 0) {
    ctx.translate(left * 2 + w, 0);
    ctx.scale(-1, 1);
  }
  shadow(ctx, left, base, w);
  const spin = rider ? timeMs / 70 : 0;
  const rearX = left + 4;
  const frontX = left + w - 5;
  const wheelY = base - 4;
  // Rodas grandes com raios.
  wheel(ctx, rearX, wheelY, 4, spin);
  wheel(ctx, frontX, wheelY, 4, spin);
  // Quadro, escapamento e garfo.
  rect(ctx, "#2d2d2d", rearX, wheelY - 3, frontX - rearX - 2, 2); // quadro
  rect(ctx, "#b8c2cb", rearX - 1, wheelY - 1, 7, 2); // escapamento
  rect(ctx, "#e9eef2", rearX - 1, wheelY - 1, 2, 1);
  rect(ctx, "#3b3b3b", frontX - 2, wheelY - 8, 2, 8); // garfo
  // Tanque vermelho com brilho e banco.
  rect(ctx, "#8e1b1b", left + 8, wheelY - 7, 7, 4);
  rect(ctx, "#d63031", left + 8, wheelY - 7, 6, 3);
  rect(ctx, "#ff7675", left + 9, wheelY - 7, 3, 1);
  rect(ctx, "#1e1e1e", left + 4, wheelY - 6, 6, 2); // banco
  // Guidão e farol.
  rect(ctx, "#3b3b3b", frontX - 4, wheelY - 9, 4, 1);
  rect(ctx, "#fff3a6", frontX, wheelY - 7, 2, 2);
  // Baú de entrega (vermelho, tampa clara e uma pizza desenhada).
  const boxX = left;
  const boxY = wheelY - 14;
  rect(ctx, "#7a1010", boxX, boxY, 8, 8);
  rect(ctx, "#c0392b", boxX + 1, boxY + 1, 6, 6);
  rect(ctx, "#f5f0e6", boxX + 1, boxY + 1, 6, 1);
  disc(ctx, boxX + 4, boxY + 4, 1, "#f2c14e");
  rect(ctx, "#d2452b", boxX + 4, boxY + 4, 1, 1);
  if (rider) {
    // Motoboy: perna, jaqueta, braço no guidão e capacete com viseira.
    rect(ctx, "#1f2d50", left + 7, wheelY - 8, 3, 4); // perna
    rect(ctx, "#2d3436", left + 7, wheelY - 13, 5, 6); // jaqueta
    rect(ctx, "#e17055", left + 8, wheelY - 12, 3, 1); // faixa refletiva
    rect(ctx, "#2d3436", left + 11, wheelY - 11, 5, 2); // braço
    rect(ctx, "#f1c27d", frontX - 4, wheelY - 10, 1, 1); // mão
    disc(ctx, left + 9, wheelY - 16, 3, "#f5c518"); // capacete
    rect(ctx, "#2b2b2b", left + 10, wheelY - 17, 3, 2); // viseira
    rect(ctx, "#ffffff", left + 8, wheelY - 18, 1, 1); // brilho
  }
  ctx.restore();
}
