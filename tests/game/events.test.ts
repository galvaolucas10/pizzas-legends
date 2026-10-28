import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "../../src/content/schemas/events";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import { WorldScene } from "../../src/game/scenes/WorldScene";
import { WorldManager } from "../../src/game/world/WorldManager";
import { content, fakeAssets, stubDom } from "../helpers";

beforeEach(() => vi.stubGlobal("document", stubDom().document));
afterEach(() => vi.unstubAllGlobals());

async function scene(mapId = "map.cozinha_mestre", entrance = "inicio") {
  const input = new InputManager();
  const warnings: string[] = [];
  const world = new WorldManager({
    content: content(),
    assets: fakeAssets(),
    input: input.reader("world"),
    state: () => ({ flags: {} }),
  });
  const s = new WorldScene({ world, input, warn: (m) => warnings.push(m) });
  await s.loadMap(mapId, { entrance });
  /** Relógio simulado: avança `ms` em ticks de 1/60 s. */
  const run = (ms: number) => {
    for (let t = 0; t < Math.round(ms / TICK_MS); t++) {
      input.poll();
      s.update(TICK_MS);
    }
  };
  const tile = (id: string) => {
    const e = s.world.entity(id)!;
    return [e.mover.tileX, e.mover.tileY];
  };
  return { s, input, run, tile, warnings };
}

describe("behaviorLoop (F0-11)", () => {
  it("o Mestre começa parado e depois anda pela cozinha, voltando ao lugar", async () => {
    const { s, run, tile, warnings } = await scene();
    const mestre = s.world.entity("mestre")!;
    run(100);
    expect(tile("mestre")).toEqual([7, 9]); // 0–1500 ms parado, olhando para a esquerda
    expect(mestre.mover.direction).toBe("left");
    const seen = new Set<string>();
    for (let t = 0; t < 120; t++) {
      run(100);
      seen.add(tile("mestre").join(","));
    }
    expect(warnings).toEqual([]);
    // Anda 2 tiles para a direita e volta, sempre na mesma linha.
    expect(seen).toEqual(new Set(["7,9", "8,9", "9,9"]));
  });

  it("o Bento patrulha na praça e volta ao início, sem interrupções", async () => {
    const { run, tile, warnings } = await scene("map.praca", "vila");
    expect(tile("bento")).toEqual([11, 12]);
    // 4 passos de 16 ticks + 2,7 s parado ≈ 3,8 s por volta.
    const seen = new Set<string>();
    for (let t = 0; t < 120; t++) {
      run(100);
      seen.add(tile("bento").join(","));
    }
    expect(warnings).toEqual([]);
    // Anda 2 tiles para a direita e volta, sempre na mesma linha.
    expect(seen).toEqual(new Set(["11,12", "12,12", "13,12"]));
  });

  it("walk bloqueado espera e tenta de novo (segundo plano não desiste)", async () => {
    const { s, run, tile } = await scene("map.praca", "vila");
    // O herói fica no caminho do Bento: (12,12) é o primeiro passo dele (para a direita).
    s.world.player.mover.place(s.world.grid!, 12, 12);
    run(3000);
    expect(tile("bento")).toEqual([11, 12]);
    s.world.player.mover.place(s.world.grid!, 7, 15);
    run(100); // liberado: o passo começa no tick seguinte
    expect(tile("bento")).toEqual([12, 12]);
  });

  it("cenas bloqueantes pausam as rotinas e tomam o contexto de entrada", async () => {
    const { s, input, run, tile } = await scene();
    s.events.runBlocking([{ type: "wait", time: 2000 }]);
    expect(input.activeContext).toBe("dialogue");
    run(1900);
    expect(tile("mestre")).toEqual([7, 9]); // rotina pausada: não saiu do lugar
    run(200);
    expect(s.events.isBlocking).toBe(false);
    expect(input.activeContext).toBe("world");
    run(2000);
    expect(tile("mestre")).not.toEqual([7, 9]); // rotina retomada: começou a andar
  });

  it("walk numa cena bloqueante tem tempo-limite de 3 s", async () => {
    const { s, run, warnings } = await scene();
    s.events.runBlocking([{ type: "walk", who: "player", direction: "up" }]);
    s.world.grid!.reserve("obstaculo", 5, 5);
    run(1000);
    expect(s.events.isBlocking).toBe(true);
    run(2100);
    expect(s.events.isBlocking).toBe(false);
    expect(warnings[0]).toContain("bloqueado por 3 s");
  });

  it("face 'player' vira o NPC para o jogador", async () => {
    const { s, run } = await scene();
    s.world.player.mover.place(s.world.grid!, 7, 8); // logo acima do Mestre (7,9)
    s.events.runBlocking([
      { type: "face", who: "mestre", towards: "player" },
      { type: "wait", time: 100 },
    ]);
    run(20);
    expect(s.world.entity("mestre")!.mover.direction).toBe("up");
  });

  it("trocar de mapa cancela os roteiros do mapa anterior", async () => {
    const { s, run, input } = await scene();
    s.events.runBlocking([{ type: "wait", time: 10_000 }]);
    await s.loadMap("map.vila", { entrance: "salao" });
    expect(s.events.isBlocking).toBe(false);
    expect(input.activeContext).toBe("world");
    expect([...s.events.backgroundRunners.keys()].sort()).toEqual(["erio", "rita"]);
    run(100);
    expect(s.world.entity("mestre")).toBeUndefined();
  });

  it("eventos instantâneos encadeiam no mesmo tick", async () => {
    const { s } = await scene();
    const events: GameEvent[] = [
      { type: "face", who: "mestre", towards: "up" },
      { type: "face", who: "mestre", towards: "right" },
    ];
    s.events.runBlocking(events);
    s.update(TICK_MS);
    expect(s.events.isBlocking).toBe(false);
    expect(s.world.entity("mestre")!.mover.direction).toBe("right");
  });
});
