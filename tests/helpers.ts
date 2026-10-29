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
  consume(action: Action): void {
    this.pressed.delete(action);
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
    // Transformações (zoom do mundo) e desenhos extras: não fazem nada no teste.
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    strokeRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
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

/** Elemento DOM falso, com o mínimo que as telas usam. */
export interface FakeElement {
  tagName: string;
  className: string;
  hidden: boolean;
  textContent: string;
  children: FakeElement[];
  parent: FakeElement | null;
  dataset: Record<string, string>;
  style: Record<string, string>;
  attributes: Record<string, string>;
  [key: string]: unknown;
}

/** Document falso para testar as telas em Node (sem jsdom). */
export function fakeDocument(): Document {
  const make = (tag: string): FakeElement => {
    const node: FakeElement = {
      tagName: tag.toUpperCase(),
      className: "",
      hidden: false,
      children: [],
      parent: null,
      dataset: {},
      style: {},
      attributes: {},
      value: "",
      get textContent(): string {
        return (
          (this._text as string | undefined) ?? node.children.map((c) => c.textContent).join("")
        );
      },
      set textContent(v: string) {
        this._text = v;
        node.children = [];
      },
      get childElementCount() {
        return node.children.length;
      },
      classList: {
        add: (...names: string[]) =>
          (node.className = `${node.className} ${names.join(" ")}`.trim()),
        toggle: (name: string, on?: boolean) => {
          const set = new Set(node.className.split(" ").filter(Boolean));
          if (on ?? !set.has(name)) set.add(name);
          else set.delete(name);
          node.className = [...set].join(" ");
        },
        contains: (name: string) => node.className.split(" ").includes(name),
      },
      setAttribute: (k: string, v: string) => (node.attributes[k] = v),
      append: (...items: (FakeElement | string)[]) => {
        for (const item of items) {
          const child = typeof item === "string" ? text(item) : item;
          child.parent = node;
          node.children.push(child);
        }
      },
      prepend: (...items: FakeElement[]) => {
        for (const child of items.reverse()) {
          child.parent = node;
          node.children.unshift(child);
        }
      },
      replaceChildren: (...items: FakeElement[]) => {
        node._text = undefined;
        node.children = [];
        (node.append as (...i: FakeElement[]) => void)(...items);
      },
      remove: () => {
        if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node);
        node.parent = null;
      },
      querySelector: () => null,
      addEventListener: () => {},
      focus: () => {},
      select: () => {},
    };
    return node;
  };
  const text = (value: string): FakeElement => {
    const node = make("#text");
    node.textContent = value;
    return node;
  };
  return {
    createElement: make,
    createTextNode: text,
  } as unknown as Document;
}

/** Junta o texto visível (não escondido) de um elemento falso. */
export function visibleText(element: unknown): string {
  const node = element as FakeElement;
  if (node.hidden) return "";
  if (node._text !== undefined) return node._text as string;
  return node.children.map(visibleText).join(" ");
}

/** Entrada de UI controlada pelo teste: `press` vale para o próximo `handle`. */
export class FakeUiInput {
  active = true;
  pressed = new Set<string>();
  press(action: string): void {
    this.pressed.add(action);
  }
  wasPressed(action: string): boolean {
    return this.pressed.has(action);
  }
  consume(action: string): void {
    this.pressed.delete(action);
  }
  clear(): void {
    this.pressed.clear();
  }
}
