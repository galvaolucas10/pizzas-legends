import { ContentError, loadContent } from "../src/content/registry";
import { readContent } from "./lib/readContent";

// npm run validate: a mesma validação da carga do jogo e do teste content.test.ts.
try {
  const content = loadContent(readContent());
  console.log(
    `Conteúdo válido: ${Object.keys(content.maps).length} mapa(s), ${Object.keys(content.npcs).length} NPC(s).`,
  );
} catch (error) {
  if (error instanceof ContentError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
