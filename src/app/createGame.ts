import { loadContent } from "../content/registry";
import { bundledContent } from "../content/sources";
import { MAX_NAME_LENGTH, newGame } from "../core/newGame";
import type { SaveData } from "../core/types";
import { AssetLoader } from "../engine/assets/AssetLoader";
import { Music } from "../engine/audio/Music";
import { GameLoop } from "../engine/GameLoop";
import { InputManager } from "../engine/input/InputManager";
import { attachKeyboard } from "../engine/input/KeyboardSource";
import { TILE } from "../engine/render/TileLayerCache";
import { attachScreenScaler, VIEW_H, VIEW_W } from "../engine/render/viewport";
import { SceneStack } from "../engine/SceneStack";
import type { BattleOutcome, BattleRequest } from "../game/events/EventRunner";
import { GameSession } from "../game/GameSession";
import { FACES, HAIRS, SKINS, avatarOf, buildSheet, closeUp } from "../game/looks";
import { SaveSystem } from "../game/SaveSystem";
import { BattleScene } from "../game/scenes/BattleScene";
import { WorldScene } from "../game/scenes/WorldScene";
import { PLAYER_SPRITE_ID, WorldManager } from "../game/world/WorldManager";
import { browserStore, LocalSaveRepository, memoryStore } from "../persistence/SaveRepository";
import { Hud } from "../ui/components/Hud";
import { BattleScreen } from "../ui/screens/BattleScreen";
import { OvenScreen } from "../ui/screens/OvenScreen";
import { ControlsScreen, type ControlMode } from "../ui/screens/ControlsScreen";
import { ManualScreen } from "../ui/screens/ManualScreen";
import { OrdersScreen } from "../ui/screens/OrdersScreen";
import { PauseMenu } from "../ui/screens/PauseMenu";
import { TitleScreen } from "../ui/screens/TitleScreen";
import { UiRoot } from "../ui/UiRoot";
import { pushOverlay } from "./overlay";
import { createTouchPad } from "./touchPad";

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
  /** Mostra/esconde os botões de toque (Menu, Pedidos) conforme o que está na tela. */
  let syncTouchButtons: (() => void) | null = null;
  let lastUpdateMs = 0;

  const loop = new GameLoop({
    update: (dt) => {
      const startedAt = performance.now();
      input.poll();
      debug?.tick(lastUpdateMs);
      scenes.update(dt);
      syncTouchButtons?.();
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
      // Saiu da tela (aba fechada, app minimizado): guarda o progresso para o "Continuar".
      if (playing) void saves.autosave();
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

      // Aprendiz: a folha original do herói recolorida com o avatar e o avental do nível.
      const heroBase = assets.image(PLAYER_SPRITE_ID);
      const applyLook = (save: SaveData) => {
        const char = save.characters[0];
        assets.replace(
          PLAYER_SPRITE_ID,
          buildSheet(container.ownerDocument, heroBase, avatarOf(char), char?.level ?? 1),
        );
      };
      // Subiu de nível: avental novo na hora.
      cleanups.push(session.signals.on("levelUp", () => applyLook(session.state)));

      // Música: o navegador só libera o som depois do primeiro toque ou tecla.
      const music = new Music();
      const unlockMusic = () => music.unlock();
      for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
        window.addEventListener(type, unlockMusic, { capture: true });
        cleanups.push(() => window.removeEventListener(type, unlockMusic, { capture: true }));
      }
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
          music.play("battle");
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
                    music.play("town");
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
                orders: () => {
                  // Pedidos do salão (null = a Nina cuida) + pedidos online do motoboy.
                  const salon = worldScene.restaurant ? worldScene.restaurant.pendingOrders() : [];
                  const online = [
                    ...(worldScene.avenue?.pendingOrders() ?? []),
                    ...worldScene.restaurants.slice(1).flatMap((r) => r.pendingOrders() ?? []),
                  ];
                  if (salon === null) return online.length ? online : null;
                  return [...salon, ...online];
                },
                save: () => {
                  const work = saves.saveManual();
                  hud?.saving(work);
                  return work;
                },
              }),
            onClose,
          ),
        autosave: () => void saves.autosave(),
        openShop: (onClose) =>
          pushOverlay(
            scenes,
            input,
            "menu",
            () =>
              new PauseMenu({
                doc,
                root: ui.element,
                session,
                content,
                input: input.reader("menu"),
                iconUrl,
                shopOnly: { title: "Mercadinho da Lia" },
              }),
            onClose,
          ),
        openMenu: () =>
          pushOverlay(scenes, input, "menu", () => {
            const menu = new PauseMenu({
              doc,
              root: ui.element,
              session,
              content,
              input: input.reader("menu"),
              iconUrl,
              openControls: () => openControls(),
              openManual: () => openManual(),
              music: {
                get enabled() {
                  return music.enabled;
                },
                toggle: () => music.setEnabled(!music.enabled),
              },
            });
            return menu;
          }),
        onMapLoaded: (mapId) => {
          const name = content.locale[`${mapId}.name`];
          if (name) hud?.showPlace(name);
          void saves.autosave();
        },
      });
      cleanups.push(attachMouse(container, canvas, input, world, worldScene));
      // Celular: sem teclado, um botão na tela abre o menu (o mesmo do Tab).
      const menuButton = document.createElement("button");
      menuButton.type = "button";
      // Coluna de botões no canto direito do retângulo do jogo (na faixa escura ao lado da sala).
      const sideBar = document.createElement("div");
      sideBar.className = "side-bar";
      container.append(sideBar);
      cleanups.push(() => sideBar.remove());
      menuButton.className = "side-btn";
      sideLabel(menuButton, "☰", "Menu");
      menuButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (input.activeContext !== "world") return;
        input.press("menu");
        input.release("menu");
      });
      menuButton.addEventListener("pointerdown", (e) => e.stopPropagation());
      sideBar.append(menuButton);
      cleanups.push(() => menuButton.remove());
      // Pedidos online (entregas): botão no canto que abre a lista.
      const ordersButton = document.createElement("button");
      ordersButton.type = "button";
      ordersButton.className = "side-btn";
      sideLabel(ordersButton, "📱", "Pedidos");
      ordersButton.addEventListener("pointerdown", (e) => e.stopPropagation());
      ordersButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (input.activeContext !== "world") return;
        pushOverlay(
          scenes,
          input,
          "menu",
          () =>
            new OrdersScreen({
              doc,
              root: ui.element,
              input: input.reader("menu"),
              orders: () => worldScene.avenue?.orderList() ?? [],
            }),
        );
      });
      sideBar.append(ordersButton);
      cleanups.push(() => ordersButton.remove());
      // Controles: computador (teclado e mouse) ou celular (setas e botões A/B na tela).
      const MODE_KEY = "pizza-legends.controles";
      const loadMode = (): ControlMode => {
        try {
          const saved = localStorage.getItem(MODE_KEY);
          if (saved === "computador" || saved === "celular") return saved;
        } catch {
          // sem armazenamento: usa o padrão abaixo
        }
        return window.matchMedia?.("(pointer: coarse)").matches ? "celular" : "computador";
      };
      let controlMode = loadMode();
      const touchPad = createTouchPad(document, input);
      container.append(touchPad);
      cleanups.push(() => touchPad.remove());
      const openControls = (): void =>
        pushOverlay(
          scenes,
          input,
          "menu",
          () =>
            new ControlsScreen({
              doc,
              root: ui.element,
              input: input.reader("menu"),
              current: controlMode,
              choose: (mode) => {
                controlMode = mode;
                try {
                  localStorage.setItem(MODE_KEY, mode);
                } catch {
                  // sem armazenamento: vale só nesta sessão
                }
              },
            }),
        );
      const openManual = (onClose?: () => void): void =>
        pushOverlay(
          scenes,
          input,
          "menu",
          () =>
            new ManualScreen({
              doc,
              root: ui.element,
              input: input.reader("menu"),
              mode: controlMode,
              name: session.state.characters[0]?.name ?? "Nico",
            }),
          onClose,
        );
      // Instalar como app: na tela inicial, um aviso (iPhone: passo a passo do Safari;
      // Android/computador: botão que abre a instalação do navegador).
      const installBox = createInstallHint(document);
      container.append(installBox.element);
      cleanups.push(() => installBox.destroy());
      // Os botões só aparecem andando pelo mapa: com fala, menu ou forno abertos, não cobrem nada.
      syncTouchButtons = () => {
        const hide = !playing || input.activeContext !== "world";
        menuButton.hidden = hide;
        ordersButton.hidden = hide;
        // As setas e A/B do celular servem também nos menus e falas: só somem fora do jogo.
        touchPad.hidden = !playing || controlMode !== "celular";
        installBox.element.hidden = playing || !installBox.useful;
      };
      cleanups.push(() => (syncTouchButtons = null));

      // ---------- Título (F1-18): Novo jogo / Continuar ----------
      let worldOnStack = false;
      const begin = (save: SaveData, fresh: boolean) => {
        scenes.transition(async () => {
          session.load(save);
          applyLook(save);
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
            // Novo jogo: primeiro o manual (como jogar), depois a fala de abertura.
            openManual(() =>
              worldScene.events.runBlocking(
                ["intro.1", "intro.2", "intro.3"].map((textKey) => ({ type: "message", textKey })),
              ),
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
          avatar: {
            parts: [
              { key: "skin", label: "Pele", options: SKINS.map((o) => o.name) },
              { key: "hair", label: "Cabelo", options: HAIRS.map((o) => o.name) },
              { key: "face", label: "Rosto", options: FACES.map((o) => o.name) },
            ],
            portrait: (avatar) => closeUp(doc, buildSheet(doc, heroBase, avatar, 1)),
          },
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
          onNewGame: (name, avatar) =>
            begin(newGame(content, { name, seed: Date.now() >>> 0, avatar }), true),
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

/**
 * Mouse: clique esquerdo no mapa anda (ou vai até quem foi clicado e interage); clique na
 * caixa de diálogo passa a fala; botão direito é "voltar". Os itens de menu tratam o próprio clique.
 */
function attachMouse(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  input: InputManager,
  world: WorldManager,
  scene: WorldScene,
): () => void {
  const tap = (action: "confirm" | "cancel") => {
    input.press(action);
    input.release(action);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest(".menu, input, button, select")) return;
    if (target?.closest(".dialogue") || input.activeContext === "dialogue") {
      tap("confirm");
      return;
    }
    if (input.activeContext !== "world") return;
    const rect = canvas.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const gy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    if (gx < 0 || gy < 0 || gx >= VIEW_W || gy >= VIEW_H) return;
    const camera = world.camera(1);
    const zoom = world.zoom;
    scene.clickTile(
      Math.floor((gx / zoom + camera.x) / TILE),
      Math.floor((gy / zoom + camera.y) / TILE),
    );
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    tap("cancel");
  };
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("contextmenu", onContextMenu);
  return () => {
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("contextmenu", onContextMenu);
  };
}

/** O navegador guarda o pedido de instalação para o botão usar depois (Android/computador). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** Aviso "instalar como app" da tela inicial; some se o jogo já estiver instalado. */
function createInstallHint(doc: Document): {
  element: HTMLElement;
  readonly useful: boolean;
  destroy(): void;
} {
  const element = doc.createElement("div");
  element.className = "install-hint";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  let prompt: InstallPromptEvent | null = null;
  const paint = () => {
    if (ios) {
      element.textContent =
        "📲 Instalar no iPhone: abra no Safari, toque em Compartilhar (quadrado com seta ↑) e depois em “Adicionar à Tela de Início”.";
      return;
    }
    if (prompt) {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = "⬇ Instalar jogo";
      button.addEventListener("pointerdown", (e) => e.stopPropagation());
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        void prompt?.prompt();
      });
      element.replaceChildren(button);
      return;
    }
    element.textContent =
      "📲 Para instalar: menu do navegador → “Instalar app” ou “Adicionar à tela inicial”.";
  };
  const onPrompt = (e: Event) => {
    e.preventDefault();
    prompt = e as InstallPromptEvent;
    paint();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  paint();
  return {
    element,
    get useful() {
      return !standalone;
    },
    destroy() {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      element.remove();
    },
  };
}

/** Botão da coluna lateral: ícone grande e o nome embaixo. */
function sideLabel(button: HTMLButtonElement, icon: string, text: string): void {
  const i = document.createElement("span");
  i.className = "side-btn__icon";
  i.textContent = icon;
  const t = document.createElement("span");
  t.className = "side-btn__text";
  t.textContent = text;
  button.replaceChildren(i, t);
  button.setAttribute("aria-label", text);
}
