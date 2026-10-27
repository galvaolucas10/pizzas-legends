import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { encodePng } from "../lib/png";
import { drawExteriorTileset } from "./exterior";
import { BRANCH_ICONS, ENEMY_SPRITES, INGREDIENT_ICONS, INTENT_ICONS } from "./icons";
import type { Pixels } from "./pixel";

/**
 * Gera a arte provisória autoral (npm run art): tileset externo, ícones e inimigos.
 * Determinístico: rodar de novo produz os mesmos arquivos. Registrado em ASSETS_AND_LICENSES.md.
 */
const OUT = join(import.meta.dirname, "../../public/assets");

function save(path: string, image: Pixels): void {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(image.width, image.height, image.data));
}

save("images/tiles_exterior.png", drawExteriorTileset());
for (const [slug, image] of Object.entries(INGREDIENT_ICONS)) save(`icons/ing_${slug}.png`, image);
for (const [slug, image] of Object.entries(BRANCH_ICONS)) save(`icons/branch_${slug}.png`, image);
for (const [slug, image] of Object.entries(INTENT_ICONS)) save(`icons/intent_${slug}.png`, image);
for (const [slug, image] of Object.entries(ENEMY_SPRITES)) save(`images/enemy_${slug}.png`, image);

console.log("Arte provisória gerada em public/assets.");
