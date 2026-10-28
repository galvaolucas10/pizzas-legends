import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { GameSession } from "../../src/game/GameSession";
import { firstDoorTowards, guidePath } from "../../src/game/world/guidePath";
import { content } from "../helpers";

describe("seta no chão (guia da missão)", () => {
  const c = content();
  const maps = c.maps;

  it("a primeira etapa aponta para o balcão das 3 pizzas (cozinha dos fundos)", () => {
    const session = new GameSession(c, newGame(c, { name: "Nico", seed: 1 }));
    expect(session.guide).toEqual({ mapId: "map.despensa", targets: ["balcao2"] });
  });

  it("na cozinha, o caminho termina ao lado do forno, sem atravessar paredes", () => {
    const map = maps["map.cozinha_mestre"]!;
    const start = map.entrances["inicio"]!;
    const forno = map.objects.find((o) => o.id === "forno")!;
    const path = guidePath(
      map,
      maps,
      start,
      { mapId: map.id, targets: ["forno"] },
      () => undefined,
    )!;
    expect(path.length).toBeGreaterThan(0);
    const end = path.at(-1)!;
    expect(Math.abs(end.x - forno.x) + Math.abs(end.y - forno.y)).toBe(1);
    let prev = { x: start.x, y: start.y };
    for (const at of path) {
      expect(Math.abs(at.x - prev.x) + Math.abs(at.y - prev.y)).toBe(1);
      expect(map.collision[at.y]![at.x]).toBe(".");
      prev = at;
    }
  });

  it("em outro mapa, leva à porta do caminho mais curto", () => {
    const vila = maps["map.vila"]!;
    const door = firstDoorTowards(maps, "map.vila", "map.despensa")!;
    const object = vila.objects.find((o) => o.kind === "door" && o.x === door.x && o.y === door.y);
    expect(object && "toMap" in object && object.toMap).toBe("map.salao");
    const start = vila.entrances["loja"]!;
    const path = guidePath(
      vila,
      maps,
      start,
      { mapId: "map.despensa", targets: ["rato1"] },
      () => undefined,
    )!;
    expect(path.at(-1)).toEqual(door);
  });

  it("sem alvo vivo (inimigos vencidos), não há seta", () => {
    const map = maps["map.despensa"]!;
    const start = map.entrances["fundos"]!;
    expect(
      guidePath(map, maps, start, { mapId: map.id, targets: ["rato1", "rato2"] }, () => null),
    ).toBeNull();
  });
});

describe("foco da seta com a Nina trabalhando", () => {
  const c = content();
  const atCustomersStep = () => {
    const session = new GameSession(c, newGame(c, { name: "Nico", seed: 1 }));
    session.dispatch({
      type: "cookPizza",
      recipeId: "rec.margherita",
      ingredientIds: ["ing.molho_tomate", "ing.mussarela", "ing.farinha"],
    });
    return session;
  };

  it("a etapa de clientes fica com a Nina: a seta leva à atividade da Horta Neon", () => {
    const session = atCustomersStep();
    expect(session.objective).toBe("quest.primeiro_desafio.clientes_a");
    expect(session.customersDelegated).toBe(true);
    expect(session.focus?.objectiveKey).toBe("quest.horta_neon.etapa1");
    expect(session.guide).toMatchObject({ mapId: "map.praca", targets: ["tito"] });
  });

  it("com a Nina de folga, a seta volta para os clientes", () => {
    const session = atCustomersStep();
    session.dispatch({
      type: "setFlag",
      flag: c.balance.restaurant!.employee!.offFlag,
      value: true,
    });
    expect(session.customersDelegated).toBe(false);
    expect(session.guide).toMatchObject({ mapId: "map.salao", targets: ["@clientes"] });
  });
});

describe("sem pizzas, a seta vai primeiro ao forno", () => {
  it("a etapa pede pizzas e a mochila está vazia: guia até o balcão; com pizza, volta à etapa", () => {
    const c = content();
    const session = new GameSession(c, newGame(c, { name: "Nico", seed: 1 }));
    session.dispatch({
      type: "cookPizza",
      recipeId: "rec.margherita",
      ingredientIds: ["ing.molho_tomate", "ing.mussarela", "ing.farinha"],
    });
    // Nina de folga: a etapa é atender clientes (pede pizza).
    session.dispatch({
      type: "setFlag",
      flag: c.balance.restaurant!.employee!.offFlag,
      value: true,
    });
    expect(session.guide?.targets).toEqual(["@clientes"]); // com a pizza na mochila
    const pizza = session.state.inventory.pizzas[0]!;
    session.dispatch({ type: "takePizza", pizzaId: pizza.id });
    expect(session.needsPizzas).toBe(true);
    expect(session.guide).toEqual({
      mapId: "map.despensa",
      targets: ["balcao1", "balcao2", "balcao3"],
    });
  });
});
