import { loadContent } from "../content/registry";
import { bundledContent } from "../content/sources";
import { newGame, START_ENTRANCE, START_MAP } from "../core/newGame";
import { AssetLoader } from "../engine/assets/AssetLoader";
import { GameLoop } from "../engine/GameLoop";
import { InputManager } from "../engine/input/InputManager";
import { attachKeyboard } from "../engine/input/KeyboardSource";
import { attachScreenScaler, VIEW_H, VIEW_W } from "../engine/render/viewport";
import { SceneStack } from "../engine/SceneStack";
import { GameSession } from "../game/GameSession";
import { WorldScene } from "../game/scenes/WorldScene";
import { WorldManager } from "../game/world/WorldManager";
import { UiRoot } from "../ui/UiRoot";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** Elemento que recebe a escala inteira (contém o canvas e a UI). */
  container: HTMLElement;
}

export interface GameHandle {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  destroy(): void;
}

interface DebugHooks {
  tick(lastUpdateMs: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number, renderMs: number): void;
}

/** API pública do motor (ARCHITECTURE 5.1): a única coisa que a página hospedeira usa. */
export function createGame(options: GameOptions): GameHandle {
  const { canvas, container } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  ctx.imageSmoothingEnabled = false;

  const content = loadContent(bundledContent());
  const assets = new AssetLoader({
    images: { ...content.assets.images, ...content.assets.tilesets },
    baseUrl: `${import.meta.env.BASE_URL}assets/`,
  });
  const input = new InputManager();
  // Durante o fade, a entrada vai para o contexto "transition": o jogador não anda.
  const scenes = new SceneStack({
    onTransitionStart: () => input.pushContext("transition"),
    onTransitionEnd: () => input.popContext("transition"),
  });
  // Até a tela de título (F1-18), todo início é um novo jogo.
  const session = new GameSession(
    content,
    newGame(content, { name: "Nico", seed: Date.now() >>> 0 }),
  );
  const world = new WorldManager({
    content,
    assets,
    input: input.reader("world"),
    state: () => session.state,
  });

  // Ferramentas de depuração: só em dev (carregadas no start; o build de produção não as inclui).
  let debug: DebugHooks | null = null;
  let lastUpdateMs = 0;

  const loop = new GameLoop({
    update: (dt) => {
      const startedAt = performance.now();
      input.poll();
      debug?.tick(lastUpdateMs);
      scenes.update(dt);
      lastUpdateMs = performance.now() - startedAt;
    },
    render: (alpha) => {
      const startedAt = performance.now();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      scenes.render(ctx, alpha);
      debug?.render(ctx, alpha, performance.now() - startedAt);
    },
  });

  const cleanups: (() => void)[] = [];
  let paused = false;
  const onVisibility = () => {
    if (document.hidden) {
      input.releaseAll();
      loop.stop();
    } else if (!paused) {
      loop.start();
    }
  };

  return {
    async start() {
      cleanups.push(attachKeyboard(input), attachScreenScaler(container));
      document.addEventListener("visibilitychange", onVisibility);
      cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

      await assets.loadBundle(content.assets.bundles.boot ?? []);
      const ui = new UiRoot(container);
      cleanups.push(() => ui.destroy());
      const worldScene = new WorldScene({
        world,
        input,
        dialogue: ui.dialogue,
        transition: (work) => scenes.transition(work),
        session,
      });
      await worldScene.loadMap(START_MAP, { entrance: START_ENTRANCE });
      await scenes.push(worldScene);

      if (import.meta.env.DEV) {
        const { DebugTools } = await import("./debug/DebugTools");
        const tools = new DebugTools(worldScene, input, content);
        debug = tools;
        cleanups.push(() => tools.destroy());
      }
      loop.start();
    },
    pause() {
      paused = true;
      input.releaseAll();
      loop.stop();
    },
    resume() {
      paused = false;
      loop.start();
    },
    destroy() {
      loop.stop();
      cleanups.forEach((cleanup) => cleanup());
      cleanups.length = 0;
    },
  };
}
