import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestIngredients } from "../../src/core/cooking";
import { newGame } from "../../src/core/newGame";
import type { SaveData } from "../../src/core/types";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import { BattleController, defaultBasket } from "../../src/game/battle/BattleController";
import { EnemyActor } from "../../src/game/entities/EnemyActor";
import type { BattleOutcome, BattleRequest } from "../../src/game/events/EventRunner";
import { GameSession } from "../../src/game/GameSession";
import { WorldScene } from "../../src/game/scenes/WorldScene";
import { WorldManager } from "../../src/game/world/WorldManager";
import { content, fakeAssets, stubDom } from "../helpers";

beforeEach(() => vi.stubGlobal("document", stubDom().document));
afterEach(() => vi.unstubAllGlobals());

const Q = "quest.primeiro_desafio";
const DIRS = [
  [1, 0, "left"],
  [-1, 0, "right"],
  [0, 1, "up"],
  [0, -1, "down"],
] as const;

/**
 * Joga a missão principal pelo mundo de verdade: falas pelos `talking` dos NPCs, inimigos
 * pelo contato e o `onDefeat` do mapa, batalhas pelo BattleController. Nada de flags na mão.
 */
async function game() {
  const c = content();
  const session = new GameSession(c, newGame(c, { name: "Nico", seed: 42 }));
  const input = new InputManager();
  const warnings: string[] = [];
  const battles: { request: BattleRequest; end: (o: BattleOutcome) => void }[] = [];
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
    warn: (m) => {
      if (!m.startsWith("message")) warnings.push(m);
    },
    startBattle: (request, end) => battles.push({ request, end }),
  });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      input.poll();
      s.update(TICK_MS);
    }
  };
  const go = async (mapId: string, entrance: string) => {
    await s.loadMap(mapId, { entrance });
    tick();
  };

  /** Resolve a batalha pendente jogando "bem" e devolve o resultado. */
  const resolveBattle = (basket?: string[]): BattleOutcome => {
    const pending = battles.shift();
    if (!pending) throw new Error("nenhuma batalha começou");
    const ctl = new BattleController(
      session,
      c,
      pending.request.enemyId,
      basket ?? defaultBasket(session, c),
      pending.request.enemyGlobalId,
    );
    for (let turn = 0; turn < 80 && !ctl.finished; turn++) {
      const best = ctl
        .view()
        .basket.filter((p) => p.slicesLeft > 0)
        .sort((a, b) => b.predictedDamage - a.predictedDamage)[0];
      ctl.choose(best ? { kind: "slice", pizzaId: best.id } : { kind: "improvise" });
    }
    const phase = ctl.finish().phase as BattleOutcome;
    pending.end(phase);
    tick(3);
    return phase;
  };

  /** Fica ao lado de uma entidade (NPC ou inimigo), virado para ela, e aperta confirmar. */
  const interactWith = (id: string): boolean => {
    for (let wait = 0; wait < 600; wait++) {
      const target = s.world.entity(id);
      if (!target) throw new Error(`"${id}" não está no mapa`);
      if (!target.mover.moving) {
        const grid = s.world.grid!;
        for (const [dx, dy, dir] of DIRS) {
          const x = target.mover.tileX + dx;
          const y = target.mover.tileY + dy;
          if (grid.isBlocked(x, y) && grid.occupant(x, y) !== "player") continue;
          s.world.player.mover.place(grid, x, y, dir);
          if (s.interact(target.mover.tileX, target.mover.tileY)) {
            tick(5);
            return true;
          }
        }
      }
      tick();
    }
    return false;
  };

  const cook = (recipeId: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const ids = suggestIngredients(session.state as SaveData, recipeId, c);
      if (!session.dispatch({ type: "cookPizza", recipeId, ingredientIds: ids }).ok) return;
    }
  };
  const step = () => session.state.quests[Q]?.step;

  return { c, s, session, warnings, battles, tick, go, resolveBattle, interactWith, cook, step };
}

describe("missão principal pelo mundo (sem atalhos)", () => {
  it("dá para jogar do novo jogo até o fim falando, lutando e cozinhando", async () => {
    const g = await game();
    const { session } = g;
    await g.go("map.cozinha_mestre", "inicio");

    // Etapa 1: preparar a primeira Margherita.
    g.cook("rec.margherita", 4);
    expect(g.step()).toBe(1);

    // Etapa 2: os dois ratos da despensa.
    await g.go("map.despensa", "fundos");
    expect(["rato1", "rato2"].every((id) => g.s.world.entity(id) instanceof EnemyActor)).toBe(true);
    for (const id of ["rato1", "rato2"]) {
      expect(g.interactWith(id), `encostar em ${id}`).toBe(true);
      expect(g.resolveBattle()).toBe("victory");
    }
    expect(session.state.flags["flag.ratos_derrotados"]).toBe(2);
    expect(g.step()).toBe(2);

    // Etapa 3: três vespas no bosque.
    g.cook("rec.margherita", 4);
    g.cook("rec.quatro_queijos", 4);
    await g.go("map.bosque", "vila");
    for (const id of ["vespa1", "vespa2", "vespa3"]) {
      expect(g.interactWith(id), `encostar em ${id}`).toBe(true);
      expect(g.resolveBattle(), id).toBe("victory");
      g.cook("rec.margherita", 2);
    }
    expect(g.step()).toBe(3);

    // Etapa 4: falar com o Mestre.
    await g.go("map.cozinha_mestre", "porta");
    expect(g.interactWith("mestre")).toBe(true);
    expect(g.step()).toBe(4);

    // Etapa 5: duelo com a Ravena.
    g.cook("rec.quatro_queijos", 4);
    g.cook("rec.margherita", 4);
    await g.go("map.clareira", "bosque");
    expect(g.interactWith("ravena")).toBe(true);
    const pick = (r: string, n: number) =>
      session.state.inventory.pizzas
        .filter((p) => p.recipeId === r)
        .slice(0, n)
        .map((p) => p.id);
    expect(g.resolveBattle([...pick("rec.quatro_queijos", 2), ...pick("rec.margherita", 2)])).toBe(
      "victory",
    );
    expect(g.step()).toBe(5);

    // Etapa 6: voltar ao Mestre.
    await g.go("map.cozinha_mestre", "porta");
    expect(g.interactWith("mestre")).toBe(true);
    expect(session.questStatus(Q)).toMatch(/completed|rewarded/);
    expect(g.warnings).toEqual([]);
  });
});

describe("coletas e baús no mapa (F2-06)", () => {
  it("colhe manjericão no bosque uma vez até descansar; baú da vila abre uma vez", async () => {
    const g = await game();
    const { s, session } = g;
    await g.go("map.bosque", "vila");
    const grid = s.world.grid!;
    // Manjericão em (4,12): fica embaixo dele, virado para cima.
    s.world.player.mover.place(grid, 4, 13, "up");
    expect(s.interact(4, 12)).toBe(true);
    g.tick(3);
    expect(session.state.inventory.ingredients["ing.manjericao"]).toBe(2);
    expect(s.interact(4, 12)).toBe(true);
    g.tick(3);
    expect(session.state.inventory.ingredients["ing.manjericao"]).toBe(2);

    await g.go("map.vila", "salao");
    s.world.player.mover.place(s.world.grid!, 4, 11, "up");
    expect(s.interact(4, 10)).toBe(true);
    g.tick(3);
    expect(session.state.inventory.ingredients["ing.farinha"]).toBe(3);
    s.interact(4, 10);
    g.tick(3);
    expect(session.state.inventory.ingredients["ing.farinha"]).toBe(3);
    expect(g.warnings).toEqual([]);
  });
});
