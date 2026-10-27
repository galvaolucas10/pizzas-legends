import "../styles.css";
import { createGame } from "./createGame";

const container = document.querySelector<HTMLElement>(".game-container");
const canvas = container?.querySelector<HTMLCanvasElement>(".game-canvas");
if (!container || !canvas)
  throw new Error("Elementos .game-container/.game-canvas não encontrados");

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
