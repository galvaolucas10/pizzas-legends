/**
 * Coletas e baús desenhados em código (arte provisória autoral, como o forno em `ovenArt`).
 * `x`, `y` são o canto superior esquerdo do tile (16 px), já com a câmera.
 */

type Px = (dx: number, dy: number, w: number, h: number, color: string) => void;

function painter(ctx: CanvasRenderingContext2D, x: number, y: number): Px {
  return (dx, dy, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
}

/** Arbusto/planta de coleta. Colhido: só os galhos, sem folhas nem frutos. */
export function drawHarvest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ingredientId: string,
  taken: boolean,
  time: number,
): void {
  const px = painter(ctx, x, y);
  // Sombra e galhos (sempre).
  px(3, 13, 10, 2, "#00000033");
  px(7, 9, 2, 5, "#6b4a2b");

  if (ingredientId === "ing.cogumelo") {
    if (taken) {
      px(4, 12, 3, 2, "#c9b79c");
      px(10, 12, 2, 2, "#c9b79c");
      return;
    }
    // Três cogumelos de chapéu marrom com pintas.
    for (const [cx, cy, s] of [
      [2, 7, 6],
      [8, 5, 7],
      [10, 9, 5],
    ] as const) {
      px(cx + Math.floor(s / 2) - 1, cy + 3, 2, 4, "#efe3cc");
      px(cx, cy, s, 3, "#8a5130");
      px(cx + 1, cy - 1, s - 2, 1, "#a8653c");
      px(cx + 1, cy + 1, 1, 1, "#f4e6c8");
    }
    return;
  }

  const leaf = ingredientId === "ing.pimenta_dragao" ? "#3f7d3a" : "#4f9a3f";
  const light = ingredientId === "ing.pimenta_dragao" ? "#5aa04d" : "#79c25a";
  if (taken) {
    px(5, 8, 2, 1, "#6b4a2b");
    px(9, 7, 2, 1, "#6b4a2b");
    return;
  }
  // Copa de folhas.
  px(3, 4, 10, 6, leaf);
  px(2, 6, 12, 4, leaf);
  px(4, 3, 8, 1, light);
  px(4, 5, 3, 2, light);
  px(9, 6, 3, 2, light);
  // Brilho piscando: "dá para colher aqui".
  const sparkle = Math.floor(time / 400) % 2 === 0;
  if (ingredientId === "ing.pimenta_dragao") {
    px(4, 7, 2, 3, "#d8321f");
    px(10, 5, 2, 3, "#d8321f");
    px(7, 8, 2, 3, "#ef5a2a");
  } else {
    px(5, 6, 1, 1, "#d6f5b8");
    px(10, 8, 1, 1, "#d6f5b8");
  }
  if (sparkle) px(12, 2, 1, 1, "#fff7c2");
}

/** Baú de madeira. Aberto: tampa levantada e vazio. */
export function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean) {
  const px = painter(ctx, x, y);
  px(1, 14, 14, 2, "#00000033");
  px(1, 7, 14, 8, "#8e5a2e");
  px(1, 10, 14, 1, "#5e3a1c");
  px(1, 7, 1, 8, "#5e3a1c");
  px(14, 7, 1, 8, "#5e3a1c");
  if (open) {
    px(2, 8, 12, 2, "#2a1a10");
    px(1, 2, 14, 5, "#a46a36");
    px(1, 2, 14, 1, "#5e3a1c");
  } else {
    px(1, 4, 14, 4, "#a46a36");
    px(1, 4, 14, 1, "#5e3a1c");
    px(7, 8, 2, 3, "#e3b341");
  }
}
