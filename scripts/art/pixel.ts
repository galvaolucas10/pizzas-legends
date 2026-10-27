/** Pequena "tela" RGBA para desenhar arte provisória em pixel art por código. */
export class Pixels {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, color: string | null): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!color || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b, a] = parse(color);
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  /** Elipse preenchida, com contorno opcional. */
  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, outline?: string): void {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d <= 1) {
          const edge =
            outline &&
            (((x + 1.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1 ||
              ((x - 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1 ||
              ((x + 0.5 - cx) / rx) ** 2 + ((y + 1.5 - cy) / ry) ** 2 > 1 ||
              ((x + 0.5 - cx) / rx) ** 2 + ((y - 0.5 - cy) / ry) ** 2 > 1);
          this.set(x, y, edge ? outline : fill);
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      this.set(
        Math.round(x0 + ((x1 - x0) * s) / steps),
        Math.round(y0 + ((y1 - y0) * s) / steps),
        color,
      );
    }
  }

  /** Copia outra imagem para (dx, dy). Pixels transparentes não sobrescrevem. */
  blit(src: Pixels, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        if (src.data[i + 3] === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        const j = (ty * this.width + tx) * 4;
        this.data.set(src.data.subarray(i, i + 4), j);
      }
    }
  }

  /** Espelha horizontalmente (para personagens virados para a esquerda). */
  flipped(): Pixels {
    const out = new Pixels(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        const j = (y * this.width + (this.width - 1 - x)) * 4;
        out.data.set(this.data.subarray(i, i + 4), j);
      }
    }
    return out;
  }
}

function parse(color: string): [number, number, number, number] {
  const hex = color.replace("#", "");
  const n = parseInt(hex.slice(0, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** RNG determinístico (mulberry32): a arte gerada é sempre a mesma. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
