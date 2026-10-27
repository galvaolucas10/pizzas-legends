import { describe, expect, it } from "vitest";
import {
  cookPizza,
  getAvailableRecipes,
  previewPizza,
  suggestIngredients,
} from "../../src/core/cooking";
import { evaluateCondition, questStatus } from "../../src/core/conditions";
import { newGame } from "../../src/core/newGame";
import { grantXp, maxHpFor } from "../../src/core/progression";
import { advanceQuest, currentObjective, updateQuests } from "../../src/core/quests";
import { claimReward } from "../../src/core/rewards";
import { createRng, nextRandom, randoms } from "../../src/core/rng";
import {
  activeCharacter,
  withCharacter,
  type PizzaInstance,
  type SaveData,
} from "../../src/core/types";
import { addIngredients } from "../../src/core/inventory";
import { content } from "../helpers";

const C = content();
const fresh = () => newGame(C, { name: "Nico", seed: 42 });
const withStock = (save: SaveData, items: Record<string, number>) =>
  addIngredients(
    save,
    Object.entries(items).map(([ingredientId, count]) => ({ ingredientId, count })),
    C,
  );
const learn = (save: SaveData, ...skills: string[]) =>
  withCharacter(save, (c) => ({ ...c, skills: [...c.skills, ...skills] }));

describe("rng (F1-02)", () => {
  it("mesma semente → mesma sequência; sementes diferentes divergem", () => {
    expect(randoms(createRng(7), 5).values).toEqual(randoms(createRng(7), 5).values);
    expect(randoms(createRng(7), 5).values).not.toEqual(randoms(createRng(8), 5).values);
  });

  it("o estado avança e pode ser retomado (save/load)", () => {
    const a = nextRandom(createRng(99));
    const b = nextRandom(a.rng);
    expect(nextRandom(a.rng).value).toBe(b.value);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
  });
});

describe("novo jogo (F1-02)", () => {
  it("começa no nível 1 com a Margherita, ingredientes iniciais e a missão principal ativa", () => {
    const save = fresh();
    const char = activeCharacter(save);
    expect([char.name, char.level, char.xp, char.knownRecipes]).toEqual([
      "Nico",
      1,
      0,
      ["rec.margherita"],
    ]);
    expect(save.inventory.ingredients).toEqual({
      "ing.farinha": 1,
      "ing.molho_tomate": 1,
      "ing.mussarela": 1,
    });
    expect(save.quests["quest.primeiro_desafio"]).toEqual({ status: "active", step: 0 });
    expect(save.world).toMatchObject({ mapId: "map.cozinha_mestre", position: { x: 5, y: 6 } });
  });

  it("limita o nome a 12 caracteres e usa Nico se vazio", () => {
    expect(activeCharacter(newGame(C, { name: "Bartolomeu de Gusmão", seed: 1 })).name).toBe(
      "Bartolomeu d",
    );
    expect(activeCharacter(newGame(C, { name: "   ", seed: 1 })).name).toBe("Nico");
  });
});

describe("XP e nível (F1-04, GDD 3.3)", () => {
  it("segue a curva 0/60/150/280/450 e dá 1 ponto por nível", () => {
    let save = fresh();
    save = grantXp(save, 59, C).save;
    expect(activeCharacter(save).level).toBe(1);
    const up = grantXp(save, 1, C);
    expect([
      activeCharacter(up.save).level,
      up.levelsGained,
      activeCharacter(up.save).skillPoints,
    ]).toEqual([2, 1, 1]);
    const big = grantXp(fresh(), 1000, C);
    expect([activeCharacter(big.save).level, big.levelsGained]).toEqual([5, 4]); // teto maxLevel
  });

  it("PV máximo: 40 + 8 por nível", () => {
    expect([1, 2, 5].map((l) => maxHpFor(l, C))).toEqual([40, 48, 72]);
  });
});

describe("recompensas (F1-04)", () => {
  it("nunca duplicam", () => {
    const first = claimReward(fresh(), "rew.primeiro_desafio_etapa2", C);
    expect(first.granted).toBe(true);
    expect(first.save.inventory.ingredients["ing.queijo_cabra"]).toBe(3);
    expect(activeCharacter(first.save).knownRecipes).toContain("rec.quatro_queijos");
    expect(activeCharacter(first.save).xp).toBe(40);
    const again = claimReward(first.save, "rew.primeiro_desafio_etapa2", C);
    expect(again.granted).toBe(false);
    expect(again.save).toBe(first.save);
  });

  it("grava flags e pontos de habilidade", () => {
    const save = claimReward(fresh(), "rew.primeiro_desafio_etapa3", C).save;
    expect(save.flags["flag.ponte_aberta"]).toBe(true);
    // +1 da recompensa e +1 do nível 2 (os 60 XP sobem de nível).
    expect(activeCharacter(claimReward(fresh(), "rew.pedido_lenhador", C).save).skillPoints).toBe(
      2,
    );
  });
});

describe("condições (F1-04): todas as variantes", () => {
  const save = (() => {
    let s = withStock(fresh(), { "ing.manjericao": 2 });
    s = { ...s, flags: { "flag.a": true, "flag.n": 3, "flag.zero": 0 } };
    s = learn(s, "skill.defumacao");
    s = {
      ...s,
      inventory: {
        ...s.inventory,
        pizzas: [{ recipeId: "rec.margherita", quality: 3, slicesLeft: 2 } as PizzaInstance],
      },
    };
    return s;
  })();
  const t = (c: Parameters<typeof evaluateCondition>[0]) => evaluateCondition(c, save, C);

  it("flags e contadores", () => {
    expect([t({ flag: "flag.a" }), t({ flag: "flag.zero" }), t({ flag: "flag.x" })]).toEqual([
      true,
      false,
      false,
    ]);
    expect([t({ flag: "flag.n", atLeast: 3 }), t({ flag: "flag.n", atLeast: 4 })]).toEqual([
      true,
      false,
    ]);
  });

  it("missões", () => {
    expect(t({ quest: "quest.primeiro_desafio", status: "active" })).toBe(true);
    expect(t({ quest: "quest.primeiro_desafio", stepAtLeast: 0 })).toBe(true);
    expect(t({ quest: "quest.primeiro_desafio", stepAtLeast: 1 })).toBe(false);
    expect(questStatus(save, "quest.pedido_lenhador", C)).toBe("unavailable");
  });

  it("ingrediente, pizza, habilidade, receita e nível", () => {
    expect([
      t({ hasIngredient: "ing.manjericao", count: 2 }),
      t({ hasIngredient: "ing.manjericao", count: 3 }),
    ]).toEqual([true, false]);
    expect([
      t({ hasPizza: { minQuality: 3 } }),
      t({ hasPizza: { minQuality: 4 } }),
      t({ hasPizza: { recipeId: "rec.brasa" } }),
    ]).toEqual([true, false, false]);
    expect(t({ hasSkill: "skill.defumacao" })).toBe(true);
    expect(t({ knowsRecipe: "rec.defumada" })).toBe(true); // liberada pela habilidade
    expect([t({ minLevel: 1 }), t({ minLevel: 2 })]).toEqual([true, false]);
  });

  it("all, any e not", () => {
    expect(t({ all: [{ flag: "flag.a" }, { minLevel: 1 }] })).toBe(true);
    expect(t({ any: [{ flag: "flag.x" }, { flag: "flag.a" }] })).toBe(true);
    expect(t({ not: { flag: "flag.a" } })).toBe(false);
  });
});

describe("missões (F1-05)", () => {
  it("etapa não avança sem a condição; com ela, avança e dá a recompensa uma vez", () => {
    let save = fresh();
    expect(updateQuests(save, C).events).toEqual([]);
    save = cookOrThrow(save, "rec.margherita", [
      "ing.farinha",
      "ing.molho_tomate",
      "ing.mussarela",
    ]);
    const result = updateQuests(save, C);
    expect(result.save.quests["quest.primeiro_desafio"]).toEqual({ status: "active", step: 1 });
    expect(result.save.inventory.ingredients["ing.farinha"]).toBe(3);
    expect(result.events.map((e) => e.type)).toContain("questStepCompleted");
    expect(currentObjective(result.save, C)).toBe("quest.primeiro_desafio.etapa2");
    // Rodar de novo não entrega nada a mais.
    expect(updateQuests(result.save, C).save).toEqual(result.save);
  });

  it("não pula etapas mesmo com condições futuras já cumpridas", () => {
    const save = { ...fresh(), flags: { "flag.ratos_derrotados": 5 } };
    expect(updateQuests(save, C).save.quests["quest.primeiro_desafio"]!.step).toBe(0);
  });

  it("advanceQuest começa missões e nunca volta", () => {
    const started = advanceQuest(fresh(), "quest.pedido_lenhador", 0);
    expect(started.save.quests["quest.pedido_lenhador"]).toEqual({ status: "active", step: 0 });
    expect(advanceQuest(fresh(), "quest.primeiro_desafio", 0).events).toEqual([]);
  });
});

function cookOrThrow(save: SaveData, recipeId: string, ingredients: string[]): SaveData {
  const result = cookPizza(save, recipeId, ingredients, C);
  if ("kind" in result) throw new Error(JSON.stringify(result));
  return result.save;
}

describe("preparo (F1-07, GDD 5.4)", () => {
  it("Margherita inicial: qualidade 2, 4 fatias, P 8", () => {
    const preview = previewPizza(
      "rec.margherita",
      ["ing.farinha", "ing.molho_tomate", "ing.mussarela"],
      activeCharacter(fresh()),
      C,
    );
    expect(preview).toMatchObject({ quality: 2, maxSlices: 4, potency: 8 });
    expect(preview).toMatchObject({ action: { damage: 5, heal: 4, cleanseNegative: 1 } });
  });

  it("Margherita + Manjericão com Sova Firme: 5 fatias e +2 de cura", () => {
    const char = activeCharacter(learn(fresh(), "skill.sova_firme"));
    const preview = previewPizza(
      "rec.margherita",
      ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.manjericao"],
      char,
      C,
    );
    expect(preview).toMatchObject({ quality: 2, maxSlices: 5, potency: 8, action: { heal: 6 } });
  });

  it("Brasa caprichada com Fogo Controlado: qualidade 4, P 12, Queimadura reforçada", () => {
    const save = learn(
      claimReward(fresh(), "rew.primeiro_desafio_etapa3", C).save,
      "skill.fogo_controlado",
    );
    const preview = previewPizza(
      "rec.brasa",
      ["ing.massa_fermentada", "ing.molho_apimentado", "ing.mussarela", "ing.pimenta_dragao"],
      activeCharacter(save),
      C,
    );
    expect(preview).toMatchObject({ quality: 4, potency: 12, action: { damage: 12 } });
    expect(preview).toMatchObject({
      action: { applyStatus: [{ status: "status.queimadura", duration: 3, bonusDamage: 1 }] },
    });
  });

  it("Quatro Queijos exige dois queijos diferentes", () => {
    const char = activeCharacter(claimReward(fresh(), "rew.primeiro_desafio_etapa2", C).save);
    expect(
      previewPizza(
        "rec.quatro_queijos",
        ["ing.farinha", "ing.mussarela", "ing.mussarela"],
        char,
        C,
      ),
    ).toEqual({
      kind: "missingIngredient",
      category: "queijo",
    });
    expect(
      previewPizza(
        "rec.quatro_queijos",
        ["ing.farinha", "ing.mussarela", "ing.queijo_cabra"],
        char,
        C,
      ),
    ).toMatchObject({ quality: 3 });
  });

  it("todos os erros de preparo", () => {
    const save = fresh();
    const char = activeCharacter(save);
    expect(previewPizza("rec.brasa", [], char, C)).toEqual({
      kind: "recipeUnknown",
      recipeId: "rec.brasa",
    });
    expect(previewPizza("rec.margherita", ["ing.farinha", "ing.mussarela"], char, C)).toEqual({
      kind: "missingIngredient",
      ingredientId: "ing.molho_tomate",
    });
    expect(
      previewPizza(
        "rec.margherita",
        ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.queijo_cabra"],
        char,
        C,
      ),
    ).toEqual({ kind: "invalidIngredient", ingredientId: "ing.queijo_cabra" });
    expect(
      previewPizza(
        "rec.margherita",
        ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.manjericao", "ing.cogumelo"],
        char,
        C,
      ),
    ).toEqual({ kind: "tooManyToppings", max: 1 });
    expect(
      cookPizza(
        save,
        "rec.margherita",
        ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.manjericao"],
        C,
      ),
    ).toEqual({ kind: "notEnoughStock", ingredientId: "ing.manjericao" });
    const full = {
      ...save,
      inventory: { ...save.inventory, pizzas: Array(12).fill({}) as PizzaInstance[] },
    };
    expect(
      cookPizza(full, "rec.margherita", ["ing.farinha", "ing.molho_tomate", "ing.mussarela"], C),
    ).toEqual({ kind: "inventoryFull", max: 12 });
  });

  it("consome ingredientes, cria pz_<n> e dá XP só no primeiro preparo", () => {
    let save = withStock(fresh(), { "ing.farinha": 1, "ing.molho_tomate": 1, "ing.mussarela": 1 });
    const first = cookPizza(
      save,
      "rec.margherita",
      ["ing.farinha", "ing.molho_tomate", "ing.mussarela"],
      C,
    );
    if ("kind" in first) throw new Error();
    expect([first.pizza.id, first.firstTime, activeCharacter(first.save).xp]).toEqual([
      "pz_1",
      true,
      10,
    ]);
    expect(first.save.inventory.ingredients["ing.farinha"]).toBe(1);
    save = first.save;
    const second = cookPizza(
      save,
      "rec.margherita",
      ["ing.farinha", "ing.molho_tomate", "ing.mussarela"],
      C,
    );
    if ("kind" in second) throw new Error();
    expect([second.pizza.id, second.firstTime, activeCharacter(second.save).xp]).toEqual([
      "pz_2",
      false,
      10,
    ]);
    expect(second.save.inventory.ingredients).toEqual({});
  });

  it("receitas por habilidade e sugestão de ingredientes", () => {
    expect(getAvailableRecipes(activeCharacter(learn(fresh(), "skill.defumacao")), C)).toContain(
      "rec.defumada",
    );
    expect(suggestIngredients(fresh(), "rec.margherita", C).sort()).toEqual([
      "ing.farinha",
      "ing.molho_tomate",
      "ing.mussarela",
    ]);
  });
});
