import "../styles.css";
import { createGame } from "./createGame";

const container = document.querySelector<HTMLElement>(".game-container");
const canvas = container?.querySelector<HTMLCanvasElement>(".game-canvas");
if (!container || !canvas)
  throw new Error("Elementos .game-container/.game-canvas não encontrados");

// Jogo instalável (PWA): o service worker guarda os arquivos para abrir sem internet.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
    console.warn("[pwa] service worker não registrado", error);
  });
}

createGame({ canvas, container })
  .start()
  .catch((error: unknown) => {
    // Em dev, mostra o erro (ex.: conteúdo inválido) na própria página.
    console.error(error);
    if (import.meta.env.DEV) {
      const pre = document.createElement("pre");
      pre.className = "fatal-error";
      pre.textContent = error instanceof Error ? error.message : String(error);
      document.body.append(pre);
    }
  });
