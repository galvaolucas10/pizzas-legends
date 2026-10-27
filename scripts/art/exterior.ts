import { Pixels, pick, rng } from "./pixel";

/**
 * Tileset externo provisório (16×16), autoral e gerado por código.
 * A ordem da lista define o índice do tile (gid = firstGid + índice).
 */

const C = {
  grass: ["#5f9e3c", "#68a943", "#5a9638"],
  grassDark: "#4a8530",
  grassLight: "#7cbf52",
  forestFloor: ["#3f7a33", "#457f36", "#3a7230"],
  path: ["#c9a46c", "#c19b62", "#d2ae77"],
  pathDark: "#a8834f",
  water: ["#3d7fd6", "#4588de"],
  waterLight: "#7fb4f0",
  trunk: "#6b4426",
  trunkDark: "#4a2d17",
  canopy: "#2f7a3a",
  canopyDark: "#22602c",
  canopyLight: "#4a9c4f",
  canopyHighlight: "#6cbf5c",
  wall: "#ead9b5",
  wallShade: "#cdb98f",
  wood: "#8a5a32",
  woodDark: "#5e3a1d",
  woodLight: "#b07a44",
  roof: "#b8473a",
  roofDark: "#8a3127",
  roofLight: "#d4675a",
  glass: "#8fc3ea",
  stone: "#9a948c",
  stoneDark: "#6f6a63",
  stoneLight: "#bdb7ae",
  fire: "#f08a24",
  fireLight: "#ffd04a",
  outline: "#2b1d12",
};

type Painter = (p: Pixels, r: () => number) => void;

function grassBase(p: Pixels, r: () => number, palette = C.grass): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(r, palette));
}

function tuft(p: Pixels, x: number, y: number, color = C.grassDark): void {
  p.set(x, y, color);
  p.set(x - 1, y - 1, color);
  p.set(x + 1, y - 1, color);
}

function treeCanopy(p: Pixels, cy: number): void {
  p.ellipse(8, cy, 7.5, 7, C.canopyDark);
  p.ellipse(8, cy - 1, 6.8, 6.2, C.canopy);
  p.ellipse(6, cy - 3, 3, 2.4, C.canopyLight);
  p.set(5, cy - 4, C.canopyHighlight);
  p.set(6, cy - 4, C.canopyHighlight);
  p.set(10, cy + 1, C.canopyLight);
  p.set(11, cy - 1, C.canopyLight);
}

export const EXTERIOR_TILES: { name: string; paint: Painter }[] = [
  { name: "grass", paint: (p, r) => grassBase(p, r) },
  {
    name: "grass_tuft",
    paint: (p, r) => {
      grassBase(p, r);
      tuft(p, 4, 6);
      tuft(p, 11, 12);
      tuft(p, 12, 4, C.grassLight);
    },
  },
  {
    name: "flowers",
    paint: (p, r) => {
      grassBase(p, r);
      const flower = (x: number, y: number, petal: string) => {
        p.set(x, y - 1, petal);
        p.set(x - 1, y, petal);
        p.set(x + 1, y, petal);
        p.set(x, y + 1, petal);
        p.set(x, y, "#ffe066");
      };
      flower(4, 4, "#f2f2f2");
      flower(11, 6, "#e8505b");
      flower(6, 11, "#f5c542");
      flower(12, 12, "#f2f2f2");
    },
  },
  {
    name: "path",
    paint: (p, r) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(r, C.path));
      for (let i = 0; i < 6; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), C.pathDark);
    },
  },
  {
    name: "forest_fill",
    paint: (p) => {
      p.rect(0, 0, 16, 16, C.canopyDark);
      p.ellipse(4, 4, 5, 4.5, C.canopy);
      p.ellipse(12, 10, 5, 4.5, C.canopy);
      p.ellipse(3, 4, 2, 1.6, C.canopyLight);
      p.ellipse(11, 9, 2, 1.6, C.canopyLight);
    },
  },
  {
    // Parte de baixo da árvore (chão): copa inferior e tronco. Bloqueia.
    name: "tree_bottom",
    paint: (p, r) => {
      grassBase(p, r);
      p.ellipse(8, 15, 6, 2, "#3e7a2c"); // sombra
      p.rect(6, 6, 4, 9, C.trunk);
      p.rect(9, 6, 1, 9, C.trunkDark);
      p.set(6, 14, C.trunkDark);
      p.set(10, 14, C.trunk);
      p.set(5, 14, C.trunk);
      treeCanopy(p, -1);
    },
  },
  {
    // Parte de cima da árvore (camada "over"): o jogador passa por trás.
    name: "tree_top",
    paint: (p) => treeCanopy(p, 15),
  },
  {
    name: "bush",
    paint: (p, r) => {
      grassBase(p, r);
      p.ellipse(8, 9, 7, 6, C.canopyDark);
      p.ellipse(8, 8, 6, 5, C.canopy);
      p.ellipse(6, 6, 2.5, 2, C.canopyLight);
      p.set(10, 9, "#e8505b");
      p.set(5, 10, "#e8505b");
    },
  },
  {
    name: "rock",
    paint: (p, r) => {
      grassBase(p, r);
      p.ellipse(8, 10, 6.5, 5, C.stoneDark, C.outline);
      p.ellipse(8, 9, 5.5, 4, C.stone);
      p.ellipse(6, 7.5, 2.2, 1.4, C.stoneLight);
    },
  },
  {
    name: "water",
    paint: (p, r) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(r, C.water));
      p.line(2, 4, 5, 4, C.waterLight);
      p.line(9, 10, 13, 10, C.waterLight);
      p.line(6, 13, 8, 13, C.waterLight);
    },
  },
  {
    name: "fence",
    paint: (p, r) => {
      grassBase(p, r);
      p.rect(0, 6, 16, 2, C.wood);
      p.rect(0, 10, 16, 2, C.wood);
      p.rect(0, 7, 16, 1, C.woodDark);
      p.rect(0, 11, 16, 1, C.woodDark);
      for (const x of [2, 12]) {
        p.rect(x, 3, 3, 12, C.woodLight);
        p.rect(x + 2, 3, 1, 12, C.woodDark);
      }
    },
  },
  {
    name: "wall",
    paint: (p) => {
      p.rect(0, 0, 16, 16, C.wall);
      for (const y of [4, 9, 14]) p.rect(0, y, 16, 1, C.wallShade);
      p.rect(0, 15, 16, 1, C.wood);
    },
  },
  {
    name: "wall_window",
    paint: (p) => {
      p.rect(0, 0, 16, 16, C.wall);
      p.rect(0, 15, 16, 1, C.wood);
      p.rect(3, 3, 10, 9, C.woodDark);
      p.rect(4, 4, 8, 7, C.glass);
      p.rect(7, 4, 2, 7, C.woodDark);
      p.rect(4, 7, 8, 1, C.woodDark);
      p.set(5, 5, "#ffffff");
      p.rect(2, 12, 12, 2, C.wood);
    },
  },
  {
    name: "door",
    paint: (p) => {
      p.rect(0, 0, 16, 16, C.wall);
      p.rect(2, 1, 12, 15, C.woodDark);
      p.rect(3, 2, 10, 14, C.wood);
      p.rect(7, 2, 1, 14, C.woodDark);
      p.set(10, 9, C.fireLight);
      p.set(5, 9, C.fireLight);
    },
  },
  {
    name: "roof",
    paint: (p) => {
      p.rect(0, 0, 16, 16, C.roof);
      for (const y of [3, 7, 11, 15]) p.rect(0, y, 16, 1, C.roofDark);
      for (let y = 0; y < 16; y += 4) {
        const offset = (y / 4) % 2 === 0 ? 0 : 4;
        for (let x = offset; x < 16; x += 8) p.rect(x, y, 1, 3, C.roofDark);
      }
      p.rect(0, 0, 16, 1, C.roofLight);
    },
  },
  {
    name: "roof_edge",
    paint: (p) => {
      p.rect(0, 0, 16, 16, C.roof);
      for (const y of [3, 7]) p.rect(0, y, 16, 1, C.roofDark);
      p.rect(0, 10, 16, 3, C.roofDark);
      p.rect(0, 13, 16, 3, C.wallShade);
    },
  },
  {
    name: "sign",
    paint: (p, r) => {
      grassBase(p, r);
      p.rect(7, 9, 2, 6, C.woodDark);
      p.rect(2, 2, 12, 8, C.outline);
      p.rect(3, 3, 10, 6, C.woodLight);
      p.line(4, 5, 11, 5, C.woodDark);
      p.line(4, 7, 9, 7, C.woodDark);
    },
  },
  {
    name: "bridge",
    paint: (p, r) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(r, C.water));
      p.rect(0, 1, 16, 14, C.woodLight);
      for (const y of [1, 5, 9, 13]) p.rect(0, y, 16, 1, C.woodDark);
      p.rect(0, 0, 16, 1, C.wood);
      p.rect(0, 15, 16, 1, C.wood);
    },
  },
  {
    name: "oven",
    paint: (p, r) => {
      grassBase(p, r, C.path);
      p.ellipse(8, 10, 7.5, 6.5, C.stoneDark, C.outline);
      p.ellipse(8, 9, 6.5, 5.5, C.stone);
      p.ellipse(8, 11, 3.5, 3, C.outline);
      p.ellipse(8, 12, 2.2, 1.6, C.fire);
      p.set(8, 11, C.fireLight);
      p.rect(11, 1, 3, 4, C.stoneDark);
    },
  },
  {
    name: "crate",
    paint: (p, r) => {
      grassBase(p, r, C.path);
      p.rect(2, 3, 12, 12, C.outline);
      p.rect(3, 4, 10, 10, C.woodLight);
      p.line(3, 4, 12, 13, C.wood);
      p.line(12, 4, 3, 13, C.wood);
      p.rect(3, 8, 10, 1, C.wood);
    },
  },
  {
    name: "stump",
    paint: (p, r) => {
      grassBase(p, r);
      p.ellipse(8, 11, 5.5, 3.5, C.trunkDark, C.outline);
      p.rect(3, 7, 10, 4, C.trunk);
      p.ellipse(8, 7, 5, 2.5, C.woodLight, C.trunkDark);
      p.set(8, 7, C.wood);
    },
  },
  { name: "forest_floor", paint: (p, r) => grassBase(p, r, C.forestFloor) },
  {
    // Seta no chão: marca uma saída para outro mapa.
    name: "path_arrow",
    paint: (p, r) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pick(r, C.path));
      const arrow = "#f4ead2";
      p.rect(7, 3, 2, 6, arrow);
      for (let i = 0; i < 4; i++) p.rect(4 + i, 8 + i, 8 - 2 * i, 1, arrow);
    },
  },
  {
    name: "stall",
    paint: (p, r) => {
      grassBase(p, r, C.path);
      p.rect(1, 6, 14, 9, C.woodDark);
      p.rect(2, 7, 12, 7, C.wood);
      p.rect(0, 1, 16, 5, "#e8505b");
      for (let x = 0; x < 16; x += 4) p.rect(x, 1, 2, 5, "#f4ead2");
      p.ellipse(5, 8, 1.6, 1.4, "#f5c542");
      p.ellipse(10, 8, 1.6, 1.4, "#e8505b");
      p.ellipse(7.5, 9, 1.6, 1.4, "#6cbf5c");
    },
  },
];

export const EXTERIOR_COLUMNS = 8;

/** Desenha a folha do tileset (8 colunas). */
export function drawExteriorTileset(): Pixels {
  const rows = Math.ceil(EXTERIOR_TILES.length / EXTERIOR_COLUMNS);
  const sheet = new Pixels(EXTERIOR_COLUMNS * 16, rows * 16);
  EXTERIOR_TILES.forEach((tile, i) => {
    const p = new Pixels(16, 16);
    tile.paint(p, rng(1000 + i));
    sheet.blit(p, (i % EXTERIOR_COLUMNS) * 16, Math.floor(i / EXTERIOR_COLUMNS) * 16);
  });
  return sheet;
}

/** Índice do tile pelo nome. */
export function tileIndex(name: string): number {
  const index = EXTERIOR_TILES.findIndex((t) => t.name === name);
  if (index < 0) throw new Error(`tile desconhecido: ${name}`);
  return index;
}
