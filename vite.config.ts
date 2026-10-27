import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** Em dev, converte os mapas do Tiled ao iniciar e sempre que um .tmj/.tsj ou roteiro muda (ARCHITECTURE 17). */
function tiledMaps(): Plugin {
  // Processo separado: a config do Vite não precisa carregar o conversor nem o Zod.
  const run = () =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/build-maps.ts"], { stdio: "inherit" });
  return {
    name: "tiled-maps",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITEST) return; // os testes não regravam arquivos
      run();
      const watched = [resolve("src/data/dialogues"), resolve("src/data/conditions.json")];
      server.watcher.add([resolve("content"), ...watched]);
      server.watcher.on("change", (file) => {
        if (/\.(tmj|tsj)$/.test(file) || watched.some((w) => file.startsWith(w))) run();
      });
    },
  };
}

export default defineConfig({
  plugins: [tiledMaps()],
  test: {
    include: ["tests/**/*.test.ts"],
    // O cache em disco do Vitest não percebe arquivos novos em import.meta.glob (ex.: um mapa novo).
    fsModuleCache: false,
  },
});
