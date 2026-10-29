import { spawnSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
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

/**
 * No build, escreve `dist/sw.js`: um service worker que guarda todos os arquivos do jogo
 * (para instalar como app e abrir sem internet). A versão muda a cada build.
 */
function serviceWorker(): Plugin {
  return {
    name: "service-worker",
    apply: "build",
    closeBundle() {
      const dist = resolve("dist");
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(dist, full).split(sep).join("/"));
        }
      };
      walk(dist);
      const list = ["./", ...files.filter((f) => f !== "sw.js").map((f) => `./${f}`)];
      const version = Date.now().toString(36);
      writeFileSync(
        join(dist, "sw.js"),
        `// Gerado no build (vite.config.ts). Guarda o jogo para abrir sem internet.
const CACHE = "pizza-legends-${version}";
const FILES = ${JSON.stringify(list)};
self.addEventListener("install", (e) => {
  // Cada arquivo separado: um que falhe não impede a instalação.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(FILES.map((f) => c.add(f))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // A página em si vem sempre da internet (versão mais nova); a cópia guardada só sem internet.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
`,
      );
    },
  };
}

export default defineConfig({
  plugins: [tiledMaps(), serviceWorker()],
  test: {
    include: ["tests/**/*.test.ts"],
    // O cache em disco do Vitest não percebe arquivos novos em import.meta.glob (ex.: um mapa novo).
    fsModuleCache: false,
  },
});
