import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forEachEvent } from "../../src/content/schemas/events";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import { DEFAULT_HANDLERS, WorldScene } from "../../src/game/scenes/WorldScene";
import { WorldManager } from "../../src/game/world/WorldManager";
import { DialogueBox } from "../../src/ui/components/DialogueBox";
import { content, fakeAssets, stubDom } from "../helpers";

/** DOM mínimo para a DialogueBox (Node não tem document). */
function fakeDocument(): Document {
  const make = () => {
    const node = {
      className: "",
      hidden: false,
      textContent: "",
      attributes: {} as Record<string, string>,
      children: [] as unknown[],
      setAttribute(name: string, value: string) {
        node.attributes[name] = value;
      },
      append(...items: unknown[]) {
        node.children.push(...items);
      },
    };
    return node;
  };
  return { createElement: make } as unknown as Document;
}

beforeEach(() => vi.stubGlobal("document", stubDom().document));
afterEach(() => vi.unstubAllGlobals());

async function scene() {
  const input = new InputManager();
  const dialogue = new DialogueBox(fakeDocument(), 40);
  const world = new WorldManager({
    content: content(),
    assets: fakeAssets(),
    input: input.reader("world"),
    state: () => ({ flags: {} }),
  });
  const s = new WorldScene({ world, input, dialogue });
  await s.loadMap("map.cozinha_mestre", { entrance: "inicio" });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.poll();
      s.update(TICK_MS);
    }
  };
  const tap = (action: "confirm" | "down" | "left") => {
    input.press(action);
    tick();
    input.release(action);
    tick();
  };
  return { s, input, dialogue, tick, tap, world };
}

describe("diálogo com NPC (F0-13)", () => {
  it("falar com o Mestre abre, avança e fecha o diálogo", async () => {
    const { s, input, dialogue, tick, tap, world } = await scene();
    // Herói em (7,8), olhando para baixo, logo acima do Mestre (7,9).
    world.player.mover.place(world.grid!, 7, 8, "down");

    tap("confirm");
    expect(s.events.isBlocking).toBe(true);
    expect(input.activeContext).toBe("dialogue");
    expect((dialogue.element as unknown as { hidden: boolean }).hidden).toBe(false);
    expect(world.entity("mestre")!.mover.direction).toBe("up"); // virou para o jogador

    // Confirmar durante a revelação completa o texto; o segundo confirmar avança.
    expect(dialogue.typing).toBe(true);
    tap("confirm");
    expect(dialogue.typing).toBe(false);
    expect(dialogue.visibleText).toBe("Acordou, aprendiz? O forno não espera!");
    tap("confirm");
    expect(dialogue.visibleText).not.toContain("Acordou"); // segunda fala

    tick(200); // a segunda fala termina de aparecer sozinha
    expect(dialogue.typing).toBe(false);
    tap("confirm");
    expect(s.events.isBlocking).toBe(false);
    expect(input.activeContext).toBe("world");
    expect((dialogue.element as unknown as { hidden: boolean }).hidden).toBe(true);
  });

  it("o jogador não anda com o diálogo aberto", async () => {
    const { s, input, tick, tap, world } = await scene();
    world.player.mover.place(world.grid!, 7, 8, "down");
    tap("confirm");
    input.press("left");
    tick(60);
    expect([world.player.mover.tileX, world.player.mover.tileY]).toEqual([7, 8]);
    expect(s.events.isBlocking).toBe(true);
  });

  it("confirmar olhando para o nada não abre diálogo", async () => {
    const { s, tap } = await scene();
    tap("confirm");
    expect(s.events.isBlocking).toBe(false);
  });

  it("o texto aparece letra a letra no relógio do jogo", () => {
    const box = new DialogueBox(fakeDocument(), 40);
    box.show("Olá!", "Lia");
    expect(box.visibleText).toBe("");
    box.update(25); // 40 letras/s = 1 letra a cada 25 ms
    expect(box.visibleText).toBe("O");
    box.update(50);
    expect(box.visibleText).toBe("Olá");
    box.complete();
    expect(box.visibleText).toBe("Olá!");
    expect(box.typing).toBe(false);
  });
});

describe("conteúdo × handlers", () => {
  it("todo tipo de evento usado no conteúdo tem handler", () => {
    const used = new Set<string>();
    for (const map of Object.values(content().maps)) {
      for (const object of map.objects) {
        const lists =
          object.kind === "npc"
            ? [...object.talking.map((t) => t.events), object.behaviorLoop ?? []]
            : object.kind === "trigger"
              ? [object.events]
              : [];
        lists.forEach((events) => forEachEvent(events, (e) => used.add(e.type)));
      }
    }
    const missing = [...used].filter((type) => !(type in DEFAULT_HANDLERS));
    expect(missing).toEqual([]);
  });
});
