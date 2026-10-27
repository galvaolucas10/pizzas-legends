import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRegistry } from "../../src/content/registry";
import type { GameEvent } from "../../src/content/schemas/events";
import type { Talking } from "../../src/content/schemas/map";
import { newGame } from "../../src/core/newGame";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import type { Npc } from "../../src/game/entities/Npc";
import type { BattleOutcome, EventContext } from "../../src/game/events/EventRunner";
import { GameSession } from "../../src/game/GameSession";
import { WorldScene } from "../../src/game/scenes/WorldScene";
import { WorldManager } from "../../src/game/world/WorldManager";
import { content, fakeAssets, stubDom } from "../helpers";

beforeEach(() => vi.stubGlobal("document", stubDom().document));
afterEach(() => vi.unstubAllGlobals());

const MARGHERITA = ["ing.farinha", "ing.molho_tomate", "ing.mussarela"];

async function scene(
  extendContext?: (ctx: EventContext) => EventContext,
  tweak: (c: ContentRegistry) => ContentRegistry = (c) => c,
) {
  const c = tweak(content());
  const session = new GameSession(c, newGame(c, { name: "Nico", seed: 7 }));
  const input = new InputManager();
  const warnings: string[] = [];
  const world = new WorldManager({
    content: c,
    assets: fakeAssets(),
    input: input.reader("world"),
    state: () => session.state,
  });
  const s = new WorldScene({
    world,
    input,
    session,
    extendContext,
    warn: (m) => warnings.push(m),
  });
  await s.loadMap("map.cozinha_mestre", { entrance: "inicio" });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.poll();
      s.update(TICK_MS);
    }
  };
  const play = (events: GameEvent[]) => {
    s.events.runBlocking(events);
    tick();
  };
  return { s, session, play, tick, warnings };
}

describe("eventos de progresso (F1-05)", () => {
  it("setFlag, incrementFlag e claimReward viram comandos da sessão", async () => {
    const { session, play, warnings } = await scene();
    play([
      { type: "setFlag", flag: "flag.teste" },
      { type: "incrementFlag", flag: "flag.contador" },
      { type: "incrementFlag", flag: "flag.contador", by: 2 },
      { type: "claimReward", rewardId: "rew.primeiro_desafio_etapa4" },
      { type: "claimReward", rewardId: "rew.primeiro_desafio_etapa4" },
    ]);
    expect(warnings).toEqual([]);
    expect(session.state.flags["flag.teste"]).toBe(true);
    expect(session.state.flags["flag.contador"]).toBe(3);
    // A recompensa só é entregue uma vez.
    expect(session.state.characters[0]!.skillPoints).toBe(1);
  });

  it("missão avança pelos eventos e o objetivo muda", async () => {
    const { session, play } = await scene();
    const objectives: (string | null)[] = [];
    session.signals.on("objectiveChanged", (key) => objectives.push(key));
    session.dispatch({
      type: "cookPizza",
      recipeId: "rec.margherita",
      ingredientIds: MARGHERITA,
    });
    play([{ type: "incrementFlag", flag: "flag.ratos_derrotados", by: 2 }]);
    expect(session.state.quests["quest.primeiro_desafio"]!.step).toBe(2);
    expect(objectives.at(-1)).toBe("quest.primeiro_desafio.etapa3");
  });

  it("if escolhe o ramo pela condição e roda os aninhados no mesmo tick", async () => {
    const { session, play } = await scene();
    const branch = (): GameEvent => ({
      type: "if",
      condition: { flag: "flag.porta" },
      then: [{ type: "incrementFlag", flag: "flag.then" }],
      else: [
        { type: "incrementFlag", flag: "flag.else" },
        { type: "setFlag", flag: "flag.porta" },
      ],
    });
    play([branch(), branch()]);
    expect(session.state.flags["flag.else"]).toBe(1);
    expect(session.state.flags["flag.then"]).toBe(1);
  });

  it("takeIngredients e takePizza tiram do inventário; falta vira aviso", async () => {
    const { session, play, warnings } = await scene();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    const flour = session.state.inventory.ingredients["ing.farinha"] ?? 0;
    play([
      { type: "takeIngredients", items: [{ ingredientId: "ing.farinha", count: 1 }] },
      { type: "takePizza", filter: { recipeId: "rec.margherita" } },
      { type: "takePizza", filter: {} },
      { type: "takeIngredients", items: [{ ingredientId: "ing.farinha", count: 999 }] },
    ]);
    expect(session.state.inventory.ingredients["ing.farinha"] ?? 0).toBe(flour - 1);
    expect(session.state.inventory.pizzas).toEqual([]);
    expect(warnings).toEqual([
      "takePizza: nenhuma pizza atende ao filtro",
      "takeIngredients falhou: notEnoughIngredients",
    ]);
  });

  it("startBattle espera a batalha fechar e segue por onWin/onLose", async () => {
    let finish: ((outcome: BattleOutcome) => void) | null = null;
    const { s, session, play, tick } = await scene((ctx) => ({
      ...ctx,
      startBattle: (_request, onEnd) => (finish = onEnd),
    }));
    play([
      {
        type: "startBattle",
        enemyId: "enemy.rato_despensa",
        onWin: [{ type: "setFlag", flag: "flag.venceu" }],
        onLose: [{ type: "setFlag", flag: "flag.perdeu" }],
      },
      { type: "setFlag", flag: "flag.depois" },
    ]);
    tick(10);
    expect(s.events.isBlocking).toBe(true);
    expect(session.state.flags["flag.depois"]).toBeUndefined();
    finish!("victory");
    tick();
    expect(session.state.flags["flag.venceu"]).toBe(true);
    expect(session.state.flags["flag.perdeu"]).toBeUndefined();
    expect(session.state.flags["flag.depois"]).toBe(true);
    expect(s.events.isBlocking).toBe(false);
  });

  it("openOven espera a tela do forno fechar", async () => {
    let close: (() => void) | null = null;
    let opened = "";
    const { s, play, tick } = await scene((ctx) => ({
      ...ctx,
      openOven: (ovenId, onClose) => {
        opened = ovenId;
        close = onClose;
      },
    }));
    play([{ type: "openOven", ovenId: "oven.mestre" }]);
    tick(5);
    expect(opened).toBe("oven.mestre");
    expect(s.events.isBlocking).toBe(true);
    close!();
    tick();
    expect(s.events.isBlocking).toBe(false);
  });

  it("sem tela de batalha ou forno, o roteiro avisa e segue", async () => {
    const { session, play, warnings } = await scene();
    play([
      { type: "startBattle", enemyId: "enemy.rato_despensa" },
      { type: "openOven", ovenId: "oven.mestre" },
      { type: "autosave" },
      { type: "setFlag", flag: "flag.depois" },
    ]);
    expect(session.state.flags["flag.depois"]).toBe(true);
    expect(warnings).toHaveLength(2);
  });
});

describe("falas condicionais (F1-06)", () => {
  it("o NPC usa a primeira fala cuja condição vale no estado atual", async () => {
    const after: Talking = {
      condition: { quest: "quest.primeiro_desafio", stepAtLeast: 1 },
      events: [{ type: "incrementFlag", flag: "flag.depois_etapa1" }],
    };
    // O conteúdo é congelado: monta uma cópia do mapa com a fala condicional na frente.
    const { s, session, tick } = await scene(undefined, (c) => {
      const map = c.maps["map.cozinha_mestre"]!;
      const objects = map.objects.map((o) =>
        o.kind === "npc" && o.id === "mestre" ? { ...o, talking: [after, ...o.talking] } : o,
      );
      return { ...c, maps: { ...c.maps, [map.id]: { ...map, objects } } };
    });
    const mestre = s.world.entity("mestre") as Npc;
    const talk = () => {
      s.interact(mestre.mover.tileX, mestre.mover.tileY);
      tick(2);
    };
    talk();
    expect(session.state.flags["flag.depois_etapa1"]).toBeUndefined();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    talk();
    expect(session.state.flags["flag.depois_etapa1"]).toBe(1);
  });
});
