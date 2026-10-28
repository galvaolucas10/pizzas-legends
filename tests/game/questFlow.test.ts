import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestIngredients } from "../../src/core/cooking";
import { newGame } from "../../src/core/newGame";
import type { SaveData } from "../../src/core/types";
import { TICK_MS } from "../../src/engine/GameLoop";
import { InputManager } from "../../src/engine/input/InputManager";
import { BattleController, defaultBasket } from "../../src/game/battle/BattleController";
import { Npc } from "../../src/game/entities/Npc";
import type { BattleOutcome, BattleRequest } from "../../src/game/events/EventRunner";
import { GameSession } from "../../src/game/GameSession";
import { OvenController } from "../../src/game/oven/OvenController";
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
  let shopsOpened = 0;
  const s = new WorldScene({
    world,
    input,
    session,
    warn: (m) => {
      if (!m.startsWith("message")) warnings.push(m);
    },
    startBattle: (request, end) => battles.push({ request, end }),
    random: () => 0, // pedido, cadeira e aparência sempre os primeiros da lista
    openShop: (onClose) => {
      shopsOpened++;
      onClose();
    },
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
  /** Garante uma pizza da receita: prepara, comprando na loja o que faltar. */
  /** Garante uma pizza da receita como o balcão faz: prepara, comprando o que faltar. */
  const prepare = (recipeId: string) => {
    if (session.state.inventory.pizzas.some((p) => p.recipeId === recipeId)) return;
    new OvenController(session, c, "oven.balcao").buyMissingAndCook(recipeId);
  };
  /** Compra a bebida que o cliente pediu, se faltar (como o jogador faria na loja). */
  const buyDrink = (drinkId: string | null) => {
    if (drinkId && (session.state.inventory.ingredients[drinkId] ?? 0) < 1)
      session.dispatch({ type: "buyIngredient", ingredientId: drinkId, count: 1 });
  };
  const giveNinaDayOff = () =>
    session.dispatch({
      type: "setFlag",
      flag: c.balance.restaurant!.employee!.offFlag,
      value: true,
    });
  /**
   * Atende `n` clientes no salão como um jogador: espera chegarem e sentarem, anota o
   * pedido, prepara a pizza, entrega, espera comerem e recebe o pagamento.
   */
  const serveCustomers = async (n: number) => {
    giveNinaDayOff(); // aqui quem atende é o jogador
    await go("map.salao", "cozinha");
    const restaurant = s.restaurant!;
    let paid = 0;
    for (let guard = 0; paid < n && guard < 400; guard++) {
      tick(10);
      for (const c of [...restaurant.customers]) {
        if (c.state === "ordering" || c.state === "paying") {
          const paying = c.state === "paying";
          if (!interactWith(c.id)) continue;
          tick(2);
          if (paying) paid++;
        } else if (c.state === "waiting") {
          prepare(c.recipeId!);
          buyDrink(c.drinkId);
          interactWith(c.id);
          tick(2);
        }
      }
    }
    return paid;
  };
  const step = () => session.state.quests[Q]?.step;

  return {
    c,
    s,
    session,
    warnings,
    battles,
    tick,
    go,
    resolveBattle,
    interactWith,
    cook,
    prepare,
    serveCustomers,
    giveNinaDayOff,
    buyDrink,
    shopsOpened: () => shopsOpened,
    step,
  };
}

describe("missão principal pelo mundo (sem atalhos)", () => {
  it("dá para jogar do novo jogo até o fim falando, cozinhando e atendendo (sem lutas)", async () => {
    const g = await game();
    const { session } = g;
    await g.go("map.cozinha_mestre", "inicio");

    // Etapa 1: preparar a primeira Margherita.
    g.cook("rec.margherita", 4);
    expect(g.step()).toBe(1);

    // Etapa 2: os dois primeiros clientes do salão.
    expect(await g.serveCustomers(2)).toBe(2);
    expect(session.state.flags["flag.clientes_a"]).toBe(2);
    expect(g.step()).toBe(2);

    // Etapa 3 (Nível 3): Quatro Queijos e Brasa no balcão.
    g.prepare("rec.quatro_queijos");
    g.prepare("rec.brasa");
    g.tick(2);
    expect(g.step()).toBe(3);

    // Etapa 4: mais dois clientes. Libera a Brasa e a ponte.
    expect(await g.serveCustomers(2)).toBe(2);
    expect(g.step()).toBe(4);
    expect(session.state.flags["flag.ponte_aberta"]).toBe(true);

    // Etapa 5: falar com o Mestre.
    await g.go("map.cozinha_mestre", "porta");
    expect(g.interactWith("mestre")).toBe(true);
    expect(g.step()).toBe(5);

    // Etapa 6: últimos clientes.
    expect(await g.serveCustomers(2)).toBe(2);
    expect(g.step()).toBe(6);

    // Etapa 7 (Nível 7): a Ravena prova uma pizza (sem duelo).
    g.prepare("rec.margherita");
    await g.go("map.estufa", "rua");
    expect(g.interactWith("ravena")).toBe(true);
    g.tick(5);
    expect(g.battles).toHaveLength(0);
    expect(g.step()).toBe(7);

    // Etapa 8: voltar ao Mestre.
    await g.go("map.cozinha_mestre", "porta");
    expect(g.interactWith("mestre")).toBe(true);
    expect(session.questStatus(Q)).toMatch(/completed|rewarded/);
    expect(g.warnings).toEqual([]);
  });
});

describe("restaurante do salão", () => {
  it("cliente chega, senta, pede, come, paga e vai embora; outro chega depois", async () => {
    const g = await game();
    const { session } = g;
    await g.go("map.cozinha_mestre", "inicio");
    g.cook("rec.margherita", 1); // etapa 1 feita: a etapa de clientes conta
    g.giveNinaDayOff(); // o jogador atende
    await g.go("map.salao", "cozinha");
    const restaurant = g.s.restaurant!;
    for (let t = 0; t < 2000 && restaurant.customers[0]?.state !== "ordering"; t++) g.tick();
    const first = restaurant.customers[0]!;
    expect(first.state).toBe("ordering");
    const seat = session.content.balance.restaurant!.seats[first.seat]!;
    const npc = g.s.world.entity(first.id)!;
    expect([npc.mover.tileX, npc.mover.tileY, npc.mover.direction]).toEqual([
      seat.x,
      seat.y,
      seat.direction,
    ]); // sentado na cadeira, virado para a mesa

    expect(g.interactWith(first.id)).toBe(true);
    expect(first.state).toBe("waiting");
    expect(first.recipeId).toBe("rec.margherita");
    expect(first.drinkId).toBe("ing.refrigerante"); // sorteio fixo: pede refri junto
    expect(g.interactWith(first.id)).toBe(true); // sem o refri: o cliente avisa e espera
    expect(first.state).toBe("waiting");
    g.buyDrink(first.drinkId);
    expect(g.interactWith(first.id)).toBe(true); // pizza + refri entregues
    expect(first.state).toBe("eating");
    const coins = session.coins;
    g.tick(Math.ceil(session.content.balance.restaurant!.eatMs / 16) + 5);
    expect(first.state).toBe("paying");
    expect(g.interactWith(first.id)).toBe(true);
    expect(session.coins).toBe(
      coins +
        session.content.balance.restaurant!.payCoins +
        (session.content.balance.restaurant!.drinkCoins ?? 0),
    );
    expect(session.state.flags["flag.clientes_a"]).toBe(1);
    g.tick(400);
    expect(restaurant.customers.some((c) => c.id === first.id)).toBe(false); // foi embora
    expect(g.s.world.entity(first.id)).toBeUndefined();
    expect(restaurant.customers.length).toBeGreaterThan(0); // e outros chegaram
    expect(g.warnings).toEqual([]);
  });
});

describe("funcionária do salão (Nina)", () => {
  it("a Nina já começa trabalhando; atende sozinha, no salão e longe; falar com ela dá folga", async () => {
    const g = await game();
    const { session } = g;
    const cfg = session.content.balance.restaurant!;
    const employee = cfg.employee!;
    await g.go("map.cozinha_mestre", "inicio");
    g.cook("rec.margherita", 1); // etapa de clientes ativa
    await g.go("map.salao", "cozinha");

    expect(g.s.restaurant!.employeeWorking).toBe(true); // sem precisar falar com ela
    const xp = session.state.characters[0]!.xp;
    const coins = session.coins;

    // No salão: ela anota, busca a pizza na cozinha, entrega e recebe sozinha.
    for (let t = 0; t < 6000 && Number(session.state.flags["flag.clientes_total"] ?? 0) < 1; t++)
      g.tick();
    expect(session.state.flags["flag.clientes_total"]).toBe(1);
    expect(session.coins).toBe(coins + cfg.payCoins - employee.cut + (cfg.drinkCoins ?? 0));
    expect(session.state.characters[0]!.xp).toBe(xp); // XP só para quem atende

    // Longe do salão o restaurante continua: o dinheiro entra enquanto o jogador faz desafios.
    await g.go("map.vila", "salao");
    const before = Number(session.state.flags["flag.clientes_total"]);
    for (
      let t = 0;
      t < 8000 && Number(session.state.flags["flag.clientes_total"]) < before + 2;
      t++
    )
      g.tick();
    expect(Number(session.state.flags["flag.clientes_total"])).toBeGreaterThanOrEqual(before + 2);

    // De volta ao salão, falar com ela dá folga (o jogador atende); de novo, ela volta.
    await g.go("map.salao", "cozinha");
    expect(g.interactWith(employee.id)).toBe(true);
    g.tick(3);
    expect(session.state.flags[employee.offFlag]).toBe(true);
    expect(g.s.restaurant!.employeeWorking).toBe(false);
    expect(g.interactWith(employee.id)).toBe(true);
    g.tick(3);
    expect(g.s.restaurant!.employeeWorking).toBe(true);
    expect(g.warnings).toEqual([]);
  });
});

describe("avenida: motoboy e pedidos online", () => {
  it("pedido chega; o garçom faz a pizza, o motoboy entrega e o dinheiro cai no saldo", async () => {
    const g = await game();
    const { session } = g;
    const cfg = session.content.balance.avenue!;
    const notices: string[] = [];
    session.signals.on("notice", (m) => notices.push(m));
    await g.go("map.cozinha_mestre", "inicio");
    g.cook("rec.margherita", 1); // depois da 1ª pizza os pedidos online começam
    g.giveNinaDayOff(); // só o dinheiro do motoboy entra neste teste
    session.dispatch({ type: "setFlag", flag: "flag.leo_folga", value: true });
    await g.go("map.vila", "salao");
    const avenue = g.s.avenue!;
    const coins = session.coins;
    g.tick(Math.ceil(cfg.firstOrderMs / 16) + 5);
    expect(notices.some((n) => n.includes("Pedido online"))).toBe(true);
    expect(avenue.helperCooking).not.toBeNull(); // o Beto já está fazendo
    g.tick(Math.ceil(cfg.helper!.cookMs / 16) + 5);
    expect(avenue.riding).toBe(true); // a moto saiu
    expect((g.s.world.entity(cfg.motoboy) as Npc).hidden).toBe(true);
    g.tick(Math.ceil(cfg.rideMs / 16) + 5);
    expect(avenue.riding).toBe(false);
    expect(session.coins).toBe(coins + cfg.pay - cfg.helper!.cut);
    expect(notices.some((n) => n.includes("O motoboy entregou"))).toBe(true);
    expect(g.warnings).toEqual([]);
  });
});

describe("cozinha verde (estufa) também tem clientes", () => {
  it("cliente chega, senta num banco, pede e paga; sem chaminé desenhada", async () => {
    const g = await game();
    const { session } = g;
    await g.go("map.cozinha_mestre", "inicio");
    g.cook("rec.margherita", 1);
    session.dispatch({ type: "setFlag", flag: "flag.leo_folga", value: true }); // quem atende é o jogador
    await g.go("map.estufa", "rua");
    g.s.world.player.mover.place(g.s.world.grid!, 1, 8, "down"); // sai da porta: o cliente entra
    const estufa = g.s.restaurants.find((r) => r.here)!;
    expect(estufa).not.toBe(g.s.restaurant); // é outro salão
    expect(session.content.maps["map.estufa"]!.objects.some((o) => "draw" in o && o.draw)).toBe(
      false,
    );
    for (let t = 0; t < 3000 && estufa.customers[0]?.state !== "ordering"; t++) g.tick();
    const c = estufa.customers[0]!;
    expect(c.id.startsWith("estufa_")).toBe(true);
    expect(g.interactWith(c.id)).toBe(true); // anota o pedido
    g.prepare(c.recipeId!);
    g.buyDrink(c.drinkId);
    expect(g.interactWith(c.id)).toBe(true); // entrega
    expect(c.state).toBe("eating");
    const coins = session.coins;
    g.tick(Math.ceil(session.content.balance.restaurant!.eatMs / 16) + 5);
    expect(g.interactWith(c.id)).toBe(true); // recebe
    expect(session.coins).toBe(
      coins +
        session.content.balance.restaurant!.payCoins +
        (session.content.balance.restaurant!.drinkCoins ?? 0),
    );
    expect(g.warnings).toEqual([]);
  });
});

describe("Horta Neon (praça)", () => {
  it("fala com o Seu Tito, colhe 3 vezes (as plantas voltam a cada visita) e leva uma pizza", async () => {
    const g = await game();
    const { s, session } = g;
    const QH = "quest.horta_neon";
    await g.go("map.cozinha_mestre", "inicio");
    g.cook("rec.margherita", 1); // a horta abre depois da 1ª pizza
    await g.go("map.praca", "vila");
    expect(g.interactWith("tito")).toBe(true);
    g.tick(5);
    expect(session.state.quests[QH]?.step).toBe(1);

    // Colhe no canteiro da esquerda (1,9) de frente para ele, a partir de (2,9).
    const pick = (x: number, y: number, fromX: number) => {
      s.world.player.mover.place(s.world.grid!, fromX, y, fromX > x ? "left" : "right");
      expect(s.interact(x, y)).toBe(true);
      g.tick(3);
    };
    pick(1, 9, 2);
    pick(1, 9, 2); // já colhido: não conta de novo
    expect(session.state.flags["flag.colheitas_neon"]).toBe(1);
    pick(1, 12, 2);
    expect(session.state.inventory.ingredients["ing.cogumelo"]).toBe(1);
    await g.go("map.vila", "praca");
    await g.go("map.praca", "vila"); // voltou: as plantas cresceram de novo
    pick(1, 9, 2);
    expect(session.state.flags["flag.colheitas_neon"]).toBe(3);
    expect(session.state.quests[QH]?.step).toBe(2);

    // Leva uma pizza para o Seu Tito.
    g.prepare("rec.margherita");
    expect(g.interactWith("tito")).toBe(true);
    g.tick(5);
    expect(session.questStatus(QH)).toMatch(/completed|rewarded/);
    expect(g.warnings).toEqual([]);
  });
});

describe("garçom Léo na cozinha verde", () => {
  it("atende sozinho: o dinheiro cai no saldo (menos a parte dele)", async () => {
    const g = await game();
    const { session } = g;
    const cfg = session.content.balance;
    await g.go("map.cozinha_mestre", "inicio");
    g.cook("rec.margherita", 1);
    g.giveNinaDayOff();
    await g.go("map.estufa", "rua");
    g.s.world.player.mover.place(g.s.world.grid!, 1, 8, "down");
    const served = () => Number(session.state.flags["flag.clientes_total"] ?? 0);
    for (let t = 0; t < 8000 && served() === 0; t++) g.tick();
    expect(served()).toBe(1); // o Léo atendeu um cliente sozinho
    expect(cfg.extraRestaurants![0]!.employee!.cut).toBeLessThan(cfg.restaurant!.payCoins);
  });
});

describe("mercadinho da Lia", () => {
  it("falar com a Lia abre a loja para comprar com o dinheiro", async () => {
    const g = await game();
    await g.go("map.loja", "rua");
    expect(g.interactWith("lia")).toBe(true);
    g.tick(10);
    expect(g.shopsOpened()).toBe(1);
    expect(g.warnings).toEqual([]);
  });
});
