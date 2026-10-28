import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapObject } from "../../src/content/schemas/map";
import { newGame } from "../../src/core/newGame";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import { EnemyActor } from "../../src/game/entities/EnemyActor";
import type { BattleOutcome, BattleRequest } from "../../src/game/events/EventRunner";
import { GameSession } from "../../src/game/GameSession";
import { WorldScene } from "../../src/game/scenes/WorldScene";
import { WorldManager } from "../../src/game/world/WorldManager";
import { loadContent } from "../../src/content/registry";
import { bundledContent } from "../../src/content/sources";
import { fakeAssets, stubDom } from "../helpers";

beforeEach(() => vi.stubGlobal("document", stubDom().document));
afterEach(() => vi.unstubAllGlobals());

const MARGHERITA = ["ing.farinha", "ing.molho_tomate", "ing.mussarela"];

/**
 * O jogo não tem mais lutas no mapa, mas o sistema de inimigos continua no motor: estes testes
 * colocam os dois ratos antigos (fixture) na despensa só para o teste.
 */
function contentWithRats() {
  const raw = structuredClone(bundledContent());
  const rats = JSON.parse(
    readFileSync(join(__dirname, "../fixtures/ratos-despensa.json"), "utf8"),
  ) as MapObject[];
  const maps = raw.maps as Record<string, { id: string; objects: MapObject[] }>;
  const despensa = Object.values(maps).find((m) => m.id === "map.despensa")!;
  despensa.objects.push(...rats);
  return loadContent(raw);
}

async function despensa(options: { afterStep1?: boolean } = {}) {
  const c = contentWithRats();
  const session = new GameSession(c, newGame(c, { name: "Nico", seed: 3 }));
  if (options.afterStep1 ?? true)
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
  const input = new InputManager();
  const world = new WorldManager({
    content: c,
    assets: fakeAssets(),
    input: input.reader("world"),
    state: () => session.state,
  });
  const battles: { request: BattleRequest; end: (o: BattleOutcome) => void }[] = [];
  const s = new WorldScene({
    world,
    input,
    session,
    warn: () => {},
    startBattle: (request, end) => battles.push({ request, end }),
  });
  await s.loadMap("map.despensa", { entrance: "fundos" });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.poll();
      s.update(TICK_MS);
    }
  };
  const rat = (id: string) => s.world.entity(id) as EnemyActor | undefined;
  /** Põe o jogador ao lado do rato (parado), à esquerda dele. */
  const touch = (id: string) => {
    const r = rat(id)!;
    const before = battles.length;
    // Quando o rato estiver parado, o jogador encosta nele pela esquerda.
    for (let i = 0; i < 300 && battles.length === before; i++) {
      tick();
      const p = s.world.player.mover;
      const beside = p.tileX === r.mover.tileX - 1 && p.tileY === r.mover.tileY;
      if (!r.mover.moving && !beside)
        p.place(s.world.grid!, r.mover.tileX - 1, r.mover.tileY, "right");
    }
  };
  return { s, session, battles, tick, rat, touch };
}

describe("inimigos no mapa (F1-12)", () => {
  it("os ratos só aparecem depois da etapa 1", async () => {
    const before = await despensa({ afterStep1: false });
    expect(before.rat("rato1")).toBeUndefined();
    const after = await despensa();
    expect(after.rat("rato1")).toBeInstanceOf(EnemyActor);
    expect(after.rat("rato2")).toBeInstanceOf(EnemyActor);
  });

  it("encostar começa a batalha com o ID global do inimigo", async () => {
    const { battles, touch } = await despensa();
    touch("rato1");
    expect(battles).toHaveLength(1);
    expect(battles[0]!.request).toMatchObject({
      enemyId: "enemy.rato_despensa",
      source: "rato1",
      enemyGlobalId: "map.despensa/rato1",
    });
  });

  it("vitória: o rato some, conta para a missão e não reaparece ao voltar", async () => {
    const { s, session, battles, tick, rat, touch } = await despensa();
    touch("rato1");
    // A tela de batalha gravaria o resultado; aqui simulamos o registro da derrota.
    session.dispatch({
      type: "applyBattleResult",
      battle: {
        phase: "victory",
        basket: [],
        slicesUsedByProfile: {},
        defendUsed: 0,
        improviseUsed: 0,
        enemyId: "enemy.rato_despensa",
      } as never,
      enemyGlobalId: "map.despensa/rato1",
    });
    battles[0]!.end("victory");
    tick(2);
    expect(rat("rato1")).toBeUndefined();
    expect(session.state.flags["flag.ratos_derrotados"]).toBe(1);
    await s.loadMap("map.despensa", { entrance: "fundos" });
    expect(rat("rato1")).toBeUndefined();
    expect(rat("rato2")).toBeDefined();
    // Descansar no forno traz os inimigos de volta.
    session.dispatch({ type: "rest", ovenId: "oven.mestre" });
    await s.loadMap("map.despensa", { entrance: "fundos" });
    expect(rat("rato1")).toBeDefined();
  });

  it("fuga: o rato fica atordoado por 3 s e só depois pode encostar de novo", async () => {
    const { battles, tick, rat, touch } = await despensa();
    touch("rato1");
    battles[0]!.end("fled");
    tick(2);
    expect(rat("rato1")!.stunned).toBe(true);
    tick(60);
    expect(battles).toHaveLength(1);
    tick(Math.ceil(3000 / TICK_MS));
    expect(rat("rato1")!.stunned).toBe(false);
  });

  it("derrota: o jogador volta para diante do último forno", async () => {
    const { s, battles, touch } = await despensa();
    touch("rato1");
    battles[0]!.end("defeat");
    await s.loading;
    expect(s.world.map?.id).toBe("map.cozinha_mestre");
    const p = s.world.player.mover;
    expect([p.tileX, p.tileY, p.direction]).toEqual([6, 6, "right"]); // forno na mesa (7,6)
  });
});
