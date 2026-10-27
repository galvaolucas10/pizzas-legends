import { loadContent } from "../content/registry";
import { bundledContent } from "../content/sources";
import { MAX_NAME_LENGTH, newGame } from "../core/newGame";
import type { SaveData } from "../core/types";
import { AssetLoader } from "../engine/assets/AssetLoader";
import { GameLoop } from "../engine/GameLoop";
import { InputManager } from "../engine/input/InputManager";
import { attachKeyboard } from "../engine/input/KeyboardSource";
import { attachScreenScaler, VIEW_H, VIEW_W } from "../engine/render/viewport";
import { SceneStack } from "../engine/SceneStack";
import type { BattleOutcome, BattleRequest } from "../game/events/EventRunner";
import { GameSession } from "../game/GameSession";
import { SaveSystem } from "../game/SaveSystem";
import { BattleScene } from "../game/scenes/BattleScene";
import { WorldScene } from "../game/scenes/WorldScene";
import { PLAYER_SPRITE_ID, WorldManager } from "../game/world/WorldManager";
import { browserStore, LocalSaveRepository, memoryStore } from "../persistence/SaveRepository";
import { Hud } from "../ui/components/Hud";
import { BattleScreen } from "../ui/screens/BattleScreen";
import { OvenScreen } from "../ui/screens/OvenScreen";
import { PauseMenu } from "../ui/screens/PauseMenu";
import { TitleScreen } from "../ui/screens/TitleScreen";
import { UiRoot } from "../ui/UiRoot";
import { pushOverlay } from "./overlay";

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
  const assetBase = `${import.meta.env.BASE_URL}assets/`;
  const assets = new AssetLoader({
    images: { ...content.assets.images, ...content.assets.tilesets },
    baseUrl: assetBase,
  });
  const iconUrl = (id: string) => {
    const src = content.assets.images[id]?.src;
    return src ? `${assetBase}${src}` : null;
  };
  const input = new InputManager();
  // Durante o fade, a entrada vai para o contexto "transition": o jogador não anda.
  const scenes = new SceneStack({
    onTransitionStart: () => input.pushContext("transition"),
    onTransitionEnd: () => input.popContext("transition"),
  });
  // Partida provisória até a tela de título escolher "Novo jogo" ou "Continuar".
  const session = new GameSession(content, newGame(content, { name: "Nico", seed: 1 }));
  const world = new WorldManager({
    content,
    assets,
    input: input.reader("world"),
    state: () => session.state,
  });

  // Tempo de jogo: acumulado a cada tick e passado à sessão antes de gravar.
  let unsavedPlayMs = 0;
  let playing = false;
  const repo = new LocalSaveRepository(browserStore() ?? memoryStore(), content);
  let hud: Hud | null = null;
  const saves = new SaveSystem({
    repo,
    session,
    beforeSave() {
      const map = world.map;
      if (map) {
        const p = world.player.mover;
        session.dispatch({
          type: "setPosition",
          mapId: map.id,
          x: p.tileX,
          y: p.tileY,
          direction: p.direction,
        });
      }
      if (unsavedPlayMs > 0) {
        session.dispatch({ type: "addPlayTime", ms: Math.round(unsavedPlayMs) });
        unsavedPlayMs = 0;
      }
    },
    onSaving: (work) => hud?.saving(work),
    warn: (m) => console.warn(`[save] ${m}`),
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
      if (playing) unsavedPlayMs += dt;
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
      const doc = container.ownerDocument;
      hud = new Hud(doc, session);
      ui.element.prepend(hud.element);
      cleanups.push(() => hud?.destroy());

      // ---------- Batalha (F1-13): fade → cena de batalha → fade → volta ao mapa ----------
      const startBattle = (request: BattleRequest, onEnd: (o: BattleOutcome) => void) => {
        const enemy = content.enemies[request.enemyId];
        scenes.transition(async () => {
          await assets.loadBundle(enemy ? [enemy.sprite] : []);
          const screen = new BattleScreen({
            doc,
            root: ui.element,
            session,
            content,
            request,
            input: input.reader("battle"),
            iconUrl,
          });
          hud!.visible = false;
          await scenes.push(
            new BattleScene({
              content,
              assets,
              input,
              enemyId: request.enemyId,
              heroSprite: PLAYER_SPRITE_ID,
              screen,
              onClose: (outcome) => {
                scenes.transition(
                  async () => {
                    scenes.pop();
                    hud!.visible = true;
                  },
                  () => {
                    onEnd(outcome);
                    void saves.autosave();
                  },
                );
              },
            }),
          );
        });
      };

      const worldScene = new WorldScene({
        world,
        input,
        dialogue: ui.dialogue,
        transition: (work) => scenes.transition(work),
        session,
        startBattle,
        openOven: (ovenId, onClose) =>
          pushOverlay(
            scenes,
            input,
            "menu",
            () =>
              new OvenScreen({
                doc,
                root: ui.element,
                session,
                content,
                ovenId,
                input: input.reader("menu"),
                save: () => {
                  const work = saves.saveManual();
                  hud?.saving(work);
                  return work;
                },
              }),
            onClose,
          ),
        autosave: () => void saves.autosave(),
        openMenu: () =>
          pushOverlay(scenes, input, "menu", () => {
            const menu = new PauseMenu({
              doc,
              root: ui.element,
              session,
              content,
              input: input.reader("menu"),
              iconUrl,
            });
            return menu;
          }),
        onMapLoaded: () => void saves.autosave(),
      });

      // ---------- Título (F1-18): Novo jogo / Continuar ----------
      let worldOnStack = false;
      const begin = (save: SaveData, fresh: boolean) => {
        scenes.transition(async () => {
          session.load(save);
          const { mapId, position } = session.state.world;
          await worldScene.loadMap(mapId, position);
          if (!worldOnStack) {
            await scenes.push(worldScene);
            worldOnStack = true;
          }
          hud!.visible = true;
          playing = true;
          saves.start();
          if (fresh) {
            void saves.autosave();
            worldScene.events.runBlocking(
              ["intro.1", "intro.2", "intro.3"].map((textKey) => ({ type: "message", textKey })),
            );
          }
        });
      };
      const latest = await saves.latest();
      pushOverlay(scenes, input, "menu", () => {
        const char = latest?.data.characters[0];
        return new TitleScreen({
          doc,
          root: ui.element,
          input: input.reader("menu"),
          maxNameLength: MAX_NAME_LENGTH,
          save:
            latest && char
              ? {
                  name: char.name,
                  level: char.level,
                  playTimeMs: latest.data.stats.playTimeMs,
                  objective: latest.summary.objectiveKey
                    ? (content.locale[latest.summary.objectiveKey] ?? null)
                    : null,
                }
              : null,
          onNewGame: (name) => begin(newGame(content, { name, seed: Date.now() >>> 0 }), true),
          onContinue: () => latest && begin(latest.data, false),
        });
      });

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
