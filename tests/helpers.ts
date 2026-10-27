import type { Action, ActionReader, Direction } from "../src/engine/input/InputManager";
import type { SpriteDef } from "../src/game/entities/Entity";
import { loadContent } from "../src/content/registry";
import { bundledContent } from "../src/content/sources";
import assetsJson from "../src/data/assets.json";

/** Entrada controlada pelo teste. */
export class FakeInput implements ActionReader {
  active = true;
  direction: Direction | null = null;
  pressed = new Set<Action>();
  isHeld(action: Action): boolean {
    return this.direction === action;
  }
  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }
}

export const testSprite: SpriteDef = {
  imageId: "img.hero",
  frame: { w: 32, h: 32 },
  origin: { x: 8, y: 18 },
  clips: assetsJson.animationSets["anim.character_32"] as unknown as SpriteDef["clips"],
};

/** Registro real do jogo. */
export const content = () => loadContent(bundledContent());

/** Canvas/contexto falsos que registram os drawImage (os testes rodam em Node, sem DOM). */
export function stubDom() {
  const calls: { image: unknown; args: number[] }[] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage: (image: unknown, ...args: number[]) => calls.push({ image, args }),
    fillRect: () => {},
    fillStyle: "",
  };
  const document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, document };
}

/** AssetLoader falso: toda imagem "carrega" e é identificada pelo ID. */
export function fakeAssets() {
  return {
    loadBundle: async () => {},
    image: (id: string) => ({ id }),
    isLoaded: () => true,
  } as never;
}
