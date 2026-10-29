/**
 * Visuais do aprendiz: a mesma folha de sprites (img.hero) com cores trocadas.
 * Cada visual troca a cor da camisa, do cabelo e da pele.
 */
export interface Look {
  name: string;
  /** Cor original → cor nova (hex minúsculo, sem alfa). */
  swaps: Record<string, string>;
}

// Cores da folha original, por parte do corpo.
const SHIRT = ["#4e0d1f", "#4e0e1f", "#501021", "#4f0f22"];
const HAIR = ["#b77150", "#8f563b", "#7f462b", "#6e402b", "#693116"];
const SKIN = ["#ffeed9", "#ffd4b8", "#f3d9b8", "#ffc2aa", "#d5ab90"];

function swaps(shirt: string[], hair: string[], skin?: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  // Tons extras repetem o último da lista (a folha tem mais tons do que cada paleta).
  const put = (from: string[], to: string[]) =>
    from.forEach((c, i) => (map[c] = to[Math.min(i, to.length - 1)]!));
  put(SHIRT, shirt);
  put(HAIR, hair);
  if (skin) put(SKIN, skin);
  return map;
}

export const LOOKS: readonly Look[] = [
  { name: "Clássico", swaps: {} },
  {
    name: "Manjericão",
    swaps: swaps(
      ["#164a1e", "#174b1f", "#185020", "#175021"],
      ["#3a2a20", "#2a1d16", "#22170f", "#1c130c", "#170f09"],
    ),
  },
  {
    name: "Oceano",
    swaps: swaps(
      ["#123a7a", "#133b7b", "#143e80", "#143d7f"],
      ["#f6d36b", "#e6b84a", "#cf9c35", "#b5832a", "#a07322"],
    ),
  },
  {
    name: "Pimenta",
    swaps: swaps(
      ["#4a1a6b", "#4b1b6c", "#4e1d70", "#4d1c6f"],
      ["#e8643a", "#c84a26", "#b03c1e", "#992f17", "#8a2a14"],
      ["#f0caa0", "#e2b48a", "#dcb08a", "#cf9a78", "#b88264"],
    ),
  },
  {
    name: "Brasa",
    swaps: swaps(
      ["#b8520f", "#b95310", "#bd5612", "#bc5511"],
      ["#2b2b33", "#1f1f26", "#18181e", "#121217", "#0e0e12"],
      ["#b8805a", "#a06c4a", "#9c6a48", "#8a5a3c", "#6f4630"],
    ),
  },
];

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Folha de sprites recolorida (mantém a transparência de cada pixel). */
export function recolor(
  doc: Document,
  image: CanvasImageSource & { width: number; height: number },
  look: Look,
): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);
  const entries = Object.entries(look.swaps);
  if (entries.length === 0) return canvas;
  const table = new Map<number, [number, number, number]>();
  for (const [from, to] of entries) {
    const [r, g, b] = parse(from);
    table.set((r << 16) | (g << 8) | b, parse(to));
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const to = table.get((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    if (to) [d[i], d[i + 1], d[i + 2]] = to;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** Retrato (quadro de frente, parado) ampliado, para a escolha de personagem. */
export function portrait(doc: Document, sheet: HTMLCanvasElement, scale = 3): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = 32 * scale;
  canvas.height = 32 * scale;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, 0, 0, 32, 32, 0, 0, 32 * scale, 32 * scale);
  }
  return canvas;
}

export function lookIndex(value: number | undefined): number {
  return value !== undefined && value >= 0 && value < LOOKS.length ? Math.floor(value) : 0;
}
