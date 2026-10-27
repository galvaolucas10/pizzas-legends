import { ContentError, loadContent } from "../src/content/registry";
import { checkAssetFiles } from "./lib/checkAssetFiles";
import { readContent } from "./lib/readContent";

// npm run validate: a mesma validação da carga do jogo e do teste content.test.ts,
// mais a conferência dos arquivos em public/assets (só possível no Node).
try {
  const content = loadContent(readContent());
  const fileProblems = checkAssetFiles(content.assets);
  if (fileProblems.length > 0) throw new ContentError(fileProblems);
  console.log(
    `Conteúdo válido: ${Object.keys(content.maps).length} mapa(s), ${Object.keys(content.npcs).length} NPC(s), ` +
      `${Object.keys(content.assets.images).length + Object.keys(content.assets.tilesets).length} imagem(ns).`,
  );
} catch (error) {
  if (error instanceof ContentError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
