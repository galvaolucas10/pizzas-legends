/**
 * "Foto" da pizza pronta: desenhada a partir dos ingredientes (molho, queijo e coberturas),
 * para o jogador ver como a pizza tem que ficar antes de fazer.
 */
import type { ContentRegistry } from "../content/registry";

const SIZE = 96;
const C = SIZE / 2;

/** Sorteio fixo por receita: a mesma pizza sempre sai com as coberturas no mesmo lugar. */
function seeded(text: string): () => number {
  let s = 2166136261;
  for (const ch of text) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    return ((s ^= s >>> 16) >>> 0) / 4294967296;
  };
}

/** Pontos espalhados dentro do recheio, sem ficarem grudados. */
function spots(rand: () => number, count: number, radius: number, gap: number) {
  const out: { x: number; y: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const p = { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
    if (out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= gap)) out.push(p);
  }
  return out;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Mancha de queijo derretido (círculo meio torto). */
function blob(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + rand() * 0.45);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

const MASSAS = new Set(["ing.farinha", "ing.massa_fermentada"]);

const SAUCE: Record<string, [string, string]> = {
  "ing.molho_tomate": ["#d8432c", "#b8321f"],
  "ing.molho_apimentado": ["#a81e16", "#e0602a"],
};

const CHEESE: Record<string, [string, string]> = {
  "ing.mussarela": ["#fff0b0", "#ffe07a"],
  "ing.queijo_cabra": ["#fdfdf6", "#e9e6d8"],
  "ing.queijo_defumado": ["#e9b45c", "#c98a3a"],
};

function drawTopping(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  rand: () => number,
) {
  switch (id) {
    case "ing.linguica":
      disc(ctx, x, y, 5.5, "#7a1c22");
      disc(ctx, x, y, 4.5, "#b8323a");
      disc(ctx, x - 1.5, y - 1, 0.9, "#f3a7a7");
      disc(ctx, x + 1.6, y + 0.8, 0.9, "#f3a7a7");
      disc(ctx, x + 0.2, y + 2, 0.7, "#f3a7a7");
      break;
    case "ing.cogumelo":
      ctx.fillStyle = "#efdcb8";
      ctx.fillRect(x - 1.5, y, 3, 4.5);
      ctx.fillStyle = "#8a5a36";
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 3.5, 0, Math.PI, 0);
      ctx.fill();
      break;
    case "ing.manjericao": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = "#2f8a34";
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7cc96a";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "ing.pimenta_dragao": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = "#e0241a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a9a2a";
      ctx.fillRect(4, -1, 2, 2);
      ctx.restore();
      break;
    }
    case "ing.azeite_dourado":
      disc(ctx, x, y, 2.2, "rgba(245, 200, 66, 0.85)");
      break;
    default:
      disc(ctx, x, y, 3, "#6b8e23");
  }
}

/** Ingredientes que aparecem na foto de uma receita (o 1º de cada categoria pedida). */
export function recipeLookIngredients(recipeId: string, content: ContentRegistry): string[] {
  const recipe = content.recipes[recipeId];
  if (!recipe) return [];
  const out: string[] = [];
  const all = Object.values(content.ingredients);
  for (const req of recipe.requirements) {
    if (req.kind === "ingredient") out.push(req.ingredientId);
    else if (req.category !== "massa") {
      out.push(
        ...all
          .filter((i) => i.category === req.category)
          .slice(0, Math.max(req.count, req.category === "queijo" ? 3 : 1))
          .map((i) => i.id),
      );
    }
  }
  return out;
}

/** Desenha a pizza pronta com estes ingredientes. */
export function drawPizza(doc: Document, ingredients: string[], seed: string): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  // Sem canvas de verdade (testes): devolve a foto em branco.
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return canvas;
  const rand = seeded(seed);

  // Tábua, borda e massa.
  disc(ctx, C, C + 1.5, 46, "rgba(0, 0, 0, 0.25)");
  disc(ctx, C, C, 45, "#b9824c");
  disc(ctx, C, C, 42, "#a06a38");
  // Massa fermentada: borda mais alta e tostada.
  const rustic = ingredients.includes("ing.massa_fermentada");
  disc(ctx, C, C, 39, rustic ? "#a65e22" : "#c47a32");
  disc(ctx, C, C, 37, rustic ? "#cf8a3c" : "#e8a852");
  for (const p of spots(rand, 14, 35, 6)) {
    if (Math.hypot(p.x - C, p.y - C) > 31) disc(ctx, p.x, p.y, 1.2, "#b86a28"); // tostadinho
  }

  // Molho (sem molho: base branca de creme, como na Quatro Queijos).
  const sauce = ingredients.find((id) => SAUCE[id]);
  const [sauceColor, sauceDot] = sauce ? SAUCE[sauce]! : ["#f4e2b0", "#e8cf90"];
  disc(ctx, C, C, 31, sauceColor);
  for (const p of spots(rand, 18, 29, 5)) disc(ctx, p.x, p.y, 1.4, sauceDot);

  // Queijo derretido.
  const cheeses = ingredients.filter((id) => CHEESE[id]);
  if (cheeses.length) {
    const patches = spots(rand, 13, 25, 8);
    patches.forEach((p, i) => {
      const [main, shade] = CHEESE[cheeses[i % cheeses.length]!]!;
      blob(ctx, rand, p.x + 0.8, p.y + 0.8, 7, shade);
      blob(ctx, rand, p.x, p.y, 6.5, main);
    });
  }

  // Coberturas.
  const toppings = ingredients.filter((id) => !SAUCE[id] && !CHEESE[id] && !MASSAS.has(id));
  toppings.forEach((id, i) => {
    const count = id === "ing.azeite_dourado" ? 14 : id === "ing.manjericao" ? 6 : 8;
    for (const p of spots(seeded(`${seed}:${i}`), count, 25, 9))
      drawTopping(ctx, id, p.x, p.y, rand);
  });

  // Cortes das fatias.
  ctx.strokeStyle = "rgba(90, 45, 15, 0.45)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI + 0.3;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * 37, C + Math.sin(a) * 37);
    ctx.lineTo(C - Math.cos(a) * 37, C - Math.sin(a) * 37);
    ctx.stroke();
  }
  return canvas;
}

/** Bloco "Como fica" pronto para a tela: a foto e a legenda. */
export function pizzaPhoto(
  doc: Document,
  content: ContentRegistry,
  recipeId: string,
  extra: string[] = [],
): HTMLElement {
  const box = doc.createElement("figure");
  box.className = "pizza-photo";
  const ingredients = [...recipeLookIngredients(recipeId, content), ...extra];
  box.append(drawPizza(doc, ingredients, recipeId + extra.join()));
  const caption = doc.createElement("figcaption");
  caption.textContent = "📷 Assim ela tem que ficar";
  box.append(caption);
  return box;
}
