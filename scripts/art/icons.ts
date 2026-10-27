import { Pixels } from "./pixel";

/** Ícones provisórios 16×16 (autorais, gerados por código). */

const O = "#2b1d12"; // contorno

function icon(draw: (p: Pixels) => void): Pixels {
  const p = new Pixels(16, 16);
  draw(p);
  return p;
}

const doughBall = (fill: string, light: string) =>
  icon((p) => {
    p.ellipse(8, 9, 6.5, 5.5, fill, O);
    p.ellipse(6, 7, 2.2, 1.5, light);
  });

const sauceBowl = (sauce: string, light: string) =>
  icon((p) => {
    p.ellipse(8, 8, 6.5, 2.5, sauce, O);
    p.ellipse(7, 7.5, 2, 0.8, light);
    for (let y = 9; y <= 13; y++) {
      const half = 6 - (y - 9);
      p.rect(8 - half, y, half * 2, 1, "#e9e2d0");
      p.set(8 - half - 1, y, O);
      p.set(8 + half, y, O);
    }
    p.rect(4, 14, 8, 1, O);
  });

const cheeseWedge = (fill: string, hole: string) =>
  icon((p) => {
    for (let y = 4; y <= 12; y++) {
      const w = Math.round((y - 4) * 1.4) + 2;
      p.rect(2, y, w, 1, fill);
      p.set(2 + w, y, O);
    }
    p.line(2, 4, 2, 13, O);
    p.line(2, 13, 15, 13, O);
    p.line(2, 4, 4, 4, O);
    p.ellipse(5, 10, 1.2, 1, hole);
    p.ellipse(9, 11, 1, 0.9, hole);
  });

export const INGREDIENT_ICONS: Record<string, Pixels> = {
  farinha: icon((p) => {
    p.rect(4, 4, 8, 10, "#efe6d2");
    p.rect(3, 4, 1, 10, O);
    p.rect(12, 4, 1, 10, O);
    p.rect(3, 14, 10, 1, O);
    p.rect(4, 2, 8, 2, "#d9cdb2");
    p.rect(4, 1, 8, 1, O);
    p.rect(6, 8, 4, 3, "#c9a46c");
  }),
  massa_fermentada: doughBall("#e9cf99", "#f7e7c2"),
  molho_tomate: sauceBowl("#d8402f", "#f07b6c"),
  molho_apimentado: sauceBowl("#a3201a", "#e8505b"),
  mussarela: cheeseWedge("#f7f0d8", "#e0d4a6"),
  queijo_cabra: cheeseWedge("#ffffff", "#d7d7e6"),
  queijo_defumado: cheeseWedge("#d99a4e", "#a86a2c"),
  manjericao: icon((p) => {
    p.ellipse(8, 8, 4.5, 6.5, "#3f9a4a", O);
    p.line(8, 3, 8, 14, "#2a6a32");
    p.line(8, 14, 10, 15, "#2a6a32");
    p.ellipse(6.5, 6, 1.2, 2, "#6cbf5c");
  }),
  cogumelo: icon((p) => {
    p.rect(6, 8, 4, 6, "#efe6d2");
    p.rect(5, 8, 1, 6, O);
    p.rect(10, 8, 1, 6, O);
    p.rect(5, 14, 6, 1, O);
    p.ellipse(8, 7, 6.5, 4, "#8a5a32", O);
    p.ellipse(6, 5.5, 1.5, 1, "#b07a44");
  }),
  linguica: icon((p) => {
    for (const [x, y] of [
      [5, 6],
      [11, 7],
      [7, 11],
    ] as const) {
      p.ellipse(x, y, 3.5, 3.5, "#b04a3a", O);
      p.ellipse(x, y, 2, 2, "#d8796a");
      p.set(x - 1, y, "#f2d0c8");
    }
  }),
  pimenta_dragao: icon((p) => {
    for (let i = 0; i < 9; i++)
      p.ellipse(5 + i, 6 + i * 0.8, 2.6 - i * 0.2, 2.4 - i * 0.2, "#e02a1f");
    p.ellipse(5, 6, 2.6, 2.4, "#e02a1f", O);
    p.line(4, 5, 7, 7, "#ff7a5a");
    p.rect(3, 2, 2, 3, "#3f9a4a");
    p.set(14, 13, O);
  }),
  azeite_dourado: icon((p) => {
    p.rect(7, 1, 2, 2, "#5e3a1d");
    p.rect(6, 3, 4, 3, "#c79a2a");
    p.ellipse(8, 10, 4.5, 5, "#e8b830", O);
    p.ellipse(6.5, 8.5, 1.2, 2, "#fff0a8");
    p.rect(6, 3, 1, 3, O);
    p.rect(9, 3, 1, 3, O);
  }),
};

export const BRANCH_ICONS: Record<string, Pixels> = {
  massa: doughBall("#e9cf99", "#f7e7c2"),
  forno: icon((p) => {
    p.ellipse(8, 10, 5, 5, "#f08a24", O);
    p.ellipse(8, 6, 3, 4, "#f08a24");
    p.ellipse(8, 11, 2.5, 2.5, "#ffd04a");
    p.set(8, 2, "#f08a24");
  }),
  coberturas: INGREDIENT_ICONS.manjericao!,
};

export const INTENT_ICONS: Record<string, Pixels> = {
  ataque: icon((p) => {
    p.line(3, 13, 12, 4, "#d8d8e0");
    p.line(4, 13, 13, 4, "#a8a8b8");
    p.line(2, 11, 6, 15, "#8a5a32");
    p.set(13, 3, "#ffffff");
  }),
  status: icon((p) => {
    p.ellipse(8, 8, 6, 6, "#7a4fb0", O);
    p.ellipse(8, 8, 3.5, 3.5, "#a77ad8");
    p.ellipse(8, 8, 1.5, 1.5, "#4a2a78");
  }),
  preparar: icon((p) => {
    for (let i = 0; i < 6; i++) p.rect(8 - i, 3 + i, i * 2 + 1, 1, "#f5c542");
    p.rect(6, 9, 5, 5, "#f5c542");
    p.rect(6, 14, 5, 1, O);
  }),
  cura: icon((p) => {
    p.rect(6, 2, 4, 12, "#3fae55");
    p.rect(2, 6, 12, 4, "#3fae55");
    p.rect(7, 3, 2, 10, "#7fe08c");
  }),
  especial: icon((p) => {
    p.ellipse(8, 8, 3, 3, "#f08a24");
    for (const [x, y] of [
      [8, 1],
      [8, 15],
      [1, 8],
      [15, 8],
      [3, 3],
      [13, 13],
      [3, 13],
      [13, 3],
    ] as const)
      p.line(8, 8, x, y, "#f5c542");
    p.ellipse(8, 8, 2, 2, "#fff0a8");
  }),
};

/** Sprite de inimigo 32×32 repetido na grade 4×4 de `anim.character_32` (com um leve balanço). */
export function enemySheet(draw: (p: Pixels) => void): Pixels {
  const base = new Pixels(32, 32);
  draw(base);
  const left = base.flipped();
  const sheet = new Pixels(128, 128);
  // Linhas da grade: 0 baixo, 1 direita, 2 cima, 3 esquerda; colunas 1 e 3 são passos.
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const sprite = row === 3 ? left : base;
      const bob = col === 1 || col === 3 ? -1 : 0;
      sheet.blit(sprite, col * 32, row * 32 + bob);
    }
  }
  return sheet;
}

export const ENEMY_SPRITES: Record<string, Pixels> = {
  rato: enemySheet((p) => {
    p.ellipse(16, 27, 7, 2, "#00000040");
    p.line(22, 25, 28, 21, "#d89a9a");
    p.ellipse(16, 22, 7, 5, "#8a8a96", O);
    p.ellipse(10, 18, 4, 3.5, "#9a9aa6", O);
    p.ellipse(9, 14.5, 2, 2, "#d89a9a", O);
    p.ellipse(13, 15, 2, 2, "#d89a9a", O);
    p.set(9, 18, O);
    p.set(6, 19, "#e86a7a");
    p.ellipse(15, 20, 3, 2, "#b0b0bc");
  }),
  vespa: enemySheet((p) => {
    p.ellipse(16, 28, 6, 1.6, "#00000040");
    p.ellipse(11, 12, 4, 6, "#dff1ffcc", O);
    p.ellipse(21, 12, 4, 6, "#dff1ffcc", O);
    p.ellipse(16, 19, 6, 5, "#f5c542", O);
    p.rect(11, 18, 10, 2, O);
    p.rect(12, 21, 8, 1, O);
    p.ellipse(16, 13, 3.5, 3, "#3a2a1a", O);
    p.set(15, 13, "#ff5a3a");
    p.set(17, 13, "#ff5a3a");
    p.line(16, 24, 16, 26, O);
  }),
  fungo: enemySheet((p) => {
    p.ellipse(16, 28, 7, 2, "#00000040");
    p.rect(12, 17, 8, 10, "#efe6d2");
    p.rect(11, 17, 1, 10, O);
    p.rect(20, 17, 1, 10, O);
    p.rect(11, 27, 10, 1, O);
    p.ellipse(16, 15, 10, 6.5, "#c0392b", O);
    for (const [x, y] of [
      [11, 13],
      [18, 11],
      [21, 15],
      [14, 17],
    ] as const)
      p.ellipse(x, y, 1.4, 1.2, "#f4ead2");
    p.rect(13, 21, 2, 2, O);
    p.rect(17, 21, 2, 2, O);
    p.line(13, 25, 18, 24, O);
  }),
};
