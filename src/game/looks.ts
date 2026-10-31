/**
 * Visual do aprendiz: a mesma folha de sprites (img.hero) com cores trocadas.
 * O jogador escolhe pele, cabelo e rostinho; o avental muda sozinho a cada nível.
 */
export interface Avatar {
  skin: number;
  hair: number;
  face: number;
}

export interface Option {
  name: string;
  /** Cores novas, na mesma ordem das cores originais da parte. */
  colors: string[];
}

// Cores da folha original, por parte do corpo.
const HAIR = ["#b77150", "#8f563b", "#7f462b", "#6e402b", "#693116", "#4a1e09"];
const SKIN = ["#ffeed9", "#ffd4b8", "#f3d9b8", "#ffc2aa", "#d5ab90"];
const EYES = "#08275e";
const BLUSH = ["#ffc6d2", "#de96aa"];
const MOUTH = "#f27a96";
/** Avental: branco, azul-claro, cinza-azulado e o contorno escuro (só do pescoço para baixo). */
const APRON = ["#ffffff", "#cbdbfc", "#bfc4e2", "#303559"];
/** Linha do quadro (32 px) a partir da qual começa o corpo: acima fica o chapéu branco. */
const BODY_ROW = 23;

export const SKINS: readonly Option[] = [
  { name: "Clara", colors: SKIN },
  { name: "Média", colors: ["#f0caa0", "#e2b48a", "#dcb08a", "#cf9a78", "#b88264"] },
  { name: "Morena", colors: ["#c98f62", "#b47a50", "#ae764e", "#9c6642", "#7f5034"] },
  { name: "Escura", colors: ["#8e5c3a", "#7c4e31", "#774b2f", "#694128", "#4f2e1b"] },
];

export const HAIRS: readonly Option[] = [
  { name: "Castanho", colors: HAIR },
  { name: "Preto", colors: ["#3a2a20", "#2a1d16", "#22170f", "#1c130c", "#170f09", "#100a06"] },
  { name: "Loiro", colors: ["#f6d36b", "#e6b84a", "#cf9c35", "#b5832a", "#a07322", "#7a561a"] },
  { name: "Ruivo", colors: ["#e8643a", "#c84a26", "#b03c1e", "#992f17", "#8a2a14", "#5e1c0d"] },
  { name: "Rosa", colors: ["#ff9ad5", "#f07cc0", "#e066aa", "#c85494", "#b04682", "#7a2c58"] },
  { name: "Azul", colors: ["#7ab8ff", "#5a9ae8", "#4886d6", "#3a72bd", "#3062a6", "#1f3f70"] },
];

/** Rostinho: cor dos olhos, bochechas e boca. */
export interface Face {
  name: string;
  eyes: string;
  blush: boolean;
  mouth: string;
}

export const FACES: readonly Face[] = [
  { name: "Bochechas rosadas", eyes: EYES, blush: true, mouth: MOUTH },
  { name: "Olhos verdes", eyes: "#1f6b3a", blush: true, mouth: MOUTH },
  { name: "Olhos castanhos", eyes: "#5a3214", blush: false, mouth: "#d9607a" },
  { name: "Olhos azuis", eyes: "#2a6fd6", blush: false, mouth: MOUTH },
  { name: "Sorriso vermelho", eyes: EYES, blush: true, mouth: "#d22d4a" },
];

/** Um avental por nível (nível 1 = o branco original). */
export const APRONS: readonly Option[] = [
  { name: "Branco", colors: APRON },
  { name: "Azul", colors: ["#a9d2ff", "#7ab4f2", "#6aa2e4", "#1d3f7a"] },
  { name: "Verde", colors: ["#b4ef94", "#86d468", "#74c257", "#1f5a24"] },
  { name: "Vermelho", colors: ["#ff9e8f", "#f06a58", "#e05846", "#6a1414"] },
  { name: "Dourado", colors: ["#fff0a0", "#f5cf4a", "#e6bb30", "#7a5410"] },
];

export const DEFAULT_AVATAR: Avatar = { skin: 0, hair: 0, face: 0 };

/** Nome do avental de um nível. */
export function apronFor(level: number): Option {
  return APRONS[Math.max(0, Math.min(APRONS.length - 1, level - 1))]!;
}

function clamp(value: number | undefined, size: number): number {
  return value !== undefined && value >= 0 && value < size ? Math.floor(value) : 0;
}

/** Avatar do save (aceita saves antigos, que só tinham um dos 5 personagens prontos). */
export function avatarOf(char: { avatar?: Partial<Avatar>; look?: number } | undefined): Avatar {
  if (char?.avatar) {
    return {
      skin: clamp(char.avatar.skin, SKINS.length),
      hair: clamp(char.avatar.hair, HAIRS.length),
      face: clamp(char.avatar.face, FACES.length),
    };
  }
  // Personagens antigos: Clássico, Manjericão, Oceano, Pimenta, Brasa.
  const legacy: Avatar[] = [
    DEFAULT_AVATAR,
    { skin: 0, hair: 1, face: 0 },
    { skin: 0, hair: 2, face: 0 },
    { skin: 1, hair: 3, face: 0 },
    { skin: 2, hair: 1, face: 0 },
  ];
  return legacy[clamp(char?.look, legacy.length)]!;
}

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const key = ([r, g, b]: Rgb) => (r << 16) | (g << 8) | b;

/** Tabela "cor original → cor nova" para a cabeça (vale no quadro inteiro). */
function headSwaps(avatar: Avatar): Map<number, Rgb> {
  const map = new Map<number, Rgb>();
  const put = (from: string[], to: string[]) =>
    from.forEach((c, i) => map.set(key(parse(c)), parse(to[Math.min(i, to.length - 1)]!)));
  const skin = SKINS[avatar.skin]!.colors;
  const face = FACES[avatar.face]!;
  put(HAIR, HAIRS[avatar.hair]!.colors);
  put(SKIN, skin);
  put([EYES], [face.eyes]);
  put([MOUTH], [face.mouth]);
  // Sem bochecha rosada: a bochecha fica da cor da pele.
  if (!face.blush) put(BLUSH, [skin[0]!, skin[1]!]);
  else if (avatar.skin > 1) put(BLUSH, ["#e88a8a", "#c46a6a"]); // rosado que aparece na pele escura
  return map;
}

/** Folha de sprites do aprendiz com o avatar escolhido e o avental do nível. */
export function buildSheet(
  doc: Document,
  image: CanvasImageSource & { width: number; height: number },
  avatar: Avatar,
  level: number,
): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);
  const head = headSwaps(avatar);
  const apron = new Map<number, Rgb>();
  const apronColors = apronFor(level).colors;
  APRON.forEach((c, i) => apron.set(key(parse(c)), parse(apronColors[i]!)));
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const color = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
    const y = Math.floor(i / 4 / canvas.width);
    const to = (y % 32 >= BODY_ROW ? apron.get(color) : undefined) ?? head.get(color);
    if (to) [d[i], d[i + 1], d[i + 2]] = to;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** Close no aprendiz (quadro de frente, sem a sobra transparente), para montar o avatar. */
export function closeUp(doc: Document, sheet: HTMLCanvasElement, scale = 4): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = 16 * scale;
  canvas.height = 21 * scale;
  const ctx = canvas.getContext?.("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, 8, 10, 16, 21, 0, 0, 16 * scale, 21 * scale);
  }
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
