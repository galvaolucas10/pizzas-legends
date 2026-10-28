import { describe, expect, it } from "vitest";
import {
  cookPizza,
  getAvailableRecipes,
  previewPizza,
  suggestIngredients,
} from "../../src/core/cooking";
import { evaluateCondition, questStatus } from "../../src/core/conditions";
import { newGame } from "../../src/core/newGame";
import { grantXp, learnSkill, maxHpFor, skillBlocker } from "../../src/core/progression";
import {
  advanceQuest,
  currentObjective,
  objectiveProgress,
  updateQuests,
} from "../../src/core/quests";
import { restAtOven } from "../../src/core/battle";
import { convertIngredients, harvest, maxConversions } from "../../src/core/gathering";

const MARGHERITA_IDS = ["ing.farinha", "ing.molho_tomate", "ing.mussarela"];
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
  it("começa no nível 1 com 3 receitas, ingredientes iniciais e a missão principal ativa", () => {
    const save = fresh();
    const char = activeCharacter(save);
    expect([char.name, char.level, char.xp, char.knownRecipes]).toEqual([
      "Nico",
      1,
      0,
      ["rec.margherita", "rec.quatro_queijos", "rec.brasa"],
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
  it("começa no nível 1, segue a curva 0/60/150/280/450 e dá 1 ponto por nível", () => {
    let save = fresh();
    expect(activeCharacter(save).level).toBe(1);
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

  it("PV máximo: 50 no nível 1, +10 por nível", () => {
    expect([1, 2, 5].map((l) => maxHpFor(l, C))).toEqual([50, 60, 90]);
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
    expect(currentObjective(result.save, C)).toBe("quest.primeiro_desafio.clientes_a");
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
    expect(previewPizza("rec.defumada", [], char, C)).toEqual({
      kind: "recipeUnknown",
      recipeId: "rec.defumada",
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

describe("aprender habilidades (F2-01, DATA_MODELS 6)", () => {
  const withPoints = (save: SaveData, skillPoints: number, level = 1) =>
    withCharacter(save, (c) => ({ ...c, skillPoints, level }));

  it("gasta os pontos e adiciona a habilidade", () => {
    const save = learnSkill(withPoints(fresh(), 2), "skill.sova_firme", C);
    if ("kind" in save) throw new Error(save.kind);
    expect(activeCharacter(save).skills).toEqual(["skill.sova_firme"]);
    expect(activeCharacter(save).skillPoints).toBe(1);
  });

  it("recusa sem pontos, sem pré-requisito, abaixo do nível mínimo e repetida", () => {
    expect(learnSkill(fresh(), "skill.sova_firme", C)).toEqual({
      kind: "notEnoughPoints",
      need: 1,
      have: 0,
    });
    expect(learnSkill(withPoints(fresh(), 3), "skill.fermentacao", C)).toEqual({
      kind: "missingRequirement",
      skillId: "skill.sova_firme",
    });
    const tier2 = learn(withPoints(fresh(), 3), "skill.sova_firme", "skill.fermentacao");
    expect(learnSkill(tier2, "skill.borda_recheada", C)).toEqual({
      kind: "levelTooLow",
      minLevel: 4,
    });
    expect(learnSkill(tier2, "skill.sova_firme", C)).toEqual({
      kind: "alreadyLearned",
      skillId: "skill.sova_firme",
    });
    expect(learnSkill(fresh(), "skill.nao_existe", C)).toMatchObject({ kind: "unknownSkill" });
  });

  it("nível 3 da árvore custa 2 pontos e exige o nível 4", () => {
    const save = learn(withPoints(fresh(), 1, 4), "skill.mao_generosa", "skill.harmonia");
    expect(skillBlocker(save, "skill.toque_final", C)).toEqual({
      kind: "notEnoughPoints",
      need: 2,
      have: 1,
    });
    const ok = learnSkill(withPoints(save, 2, 4), "skill.toque_final", C);
    expect("kind" in ok).toBe(false);
  });

  it("Defumação libera a receita Defumada", () => {
    const save = learnSkill(
      learn(withPoints(fresh(), 1), "skill.fogo_controlado"),
      "skill.defumacao",
      C,
    );
    if ("kind" in save) throw new Error(save.kind);
    expect(getAvailableRecipes(activeCharacter(save), C)).toContain("rec.defumada");
  });
});

describe("nunca travar sem ingredientes", () => {
  it("descansar sem pizzas e sem ingredientes dá o kit para uma Margherita", () => {
    const empty: SaveData = {
      ...fresh(),
      inventory: { ingredients: {}, pizzas: [], lastBasket: [] },
    };
    const rested = restAtOven(empty, "oven.mestre", C);
    expect(rested.inventory.ingredients).toEqual({
      "ing.farinha": 1,
      "ing.molho_tomate": 1,
      "ing.mussarela": 1,
    });
    expect("pizza" in cookPizza(rested, "rec.margherita", MARGHERITA_IDS, C)).toBe(true);
  });

  it("com pizza na mochila ou ingredientes suficientes, nada é dado", () => {
    const save = fresh();
    expect(restAtOven(save, "oven.mestre", C).inventory.ingredients).toEqual(
      save.inventory.ingredients,
    );
  });
});

describe("contagem do objetivo", () => {
  it("mostra quantos clientes faltam na etapa 2", () => {
    let save = advanceQuest(fresh(), "quest.primeiro_desafio", 1).save;
    expect(objectiveProgress(save, C)).toEqual({ done: 0, total: 2 });
    save = { ...save, flags: { ...save.flags, "flag.clientes_a": 1 } };
    expect(objectiveProgress(save, C)).toEqual({ done: 1, total: 2 });
    expect(objectiveProgress(fresh(), C)).toBeNull(); // etapa 1 não tem contagem
  });
});

describe("ingredientes: transformar, colher e baús (F2-02, F2-06)", () => {
  const stock = (save: SaveData) => save.inventory.ingredients;

  it("Fermentação troca 2 Farinha por 1 Massa Fermentada e exige a habilidade", () => {
    const save = withStock(fresh(), { "ing.farinha": 5 });
    expect(convertIngredients(save, "conv.fermentacao", 1, C)).toEqual({
      kind: "missingSkill",
      skillId: "skill.fermentacao",
    });
    const skilled = learn(save, "skill.sova_firme", "skill.fermentacao");
    expect(maxConversions(skilled, "conv.fermentacao", C)).toBe(3);
    const done = convertIngredients(skilled, "conv.fermentacao", 2, C);
    if ("kind" in done) throw new Error(done.kind);
    expect(stock(done)["ing.farinha"]).toBe(2);
    expect(stock(done)["ing.massa_fermentada"]).toBe(2);
    expect(convertIngredients(skilled, "conv.fermentacao", 4, C)).toMatchObject({
      kind: "notEnoughIngredients",
    });
  });

  it("Defumação faz Queijo Defumado e a pizza Defumada fica possível", () => {
    const skilled = learn(fresh(), "skill.fogo_controlado", "skill.defumacao");
    const smoked = convertIngredients(skilled, "conv.defumacao", 1, C);
    if ("kind" in smoked) throw new Error(smoked.kind);
    const cooked = cookPizza(
      smoked,
      "rec.defumada",
      ["ing.farinha", "ing.molho_tomate", "ing.queijo_defumado"],
      C,
    );
    expect("pizza" in cooked).toBe(true);
  });

  it("coleta renovável: uma vez até descansar; coleta única nunca se repete", () => {
    const herb = {
      globalId: "map.bosque/manjericao1",
      ingredientId: "ing.manjericao",
      count: 2,
      renew: "rest" as const,
    };
    const once = harvest(fresh(), herb, C)!;
    expect(stock(once)["ing.manjericao"]).toBe(2);
    expect(harvest(once, herb, C)).toBeNull();
    const rested = restAtOven(once, "oven.mestre", C);
    expect(stock(harvest(rested, herb, C)!)["ing.manjericao"]).toBe(4);

    const secret = {
      globalId: "map.bosque/pimenta_secreta",
      ingredientId: "ing.pimenta_dragao",
      count: 1,
      renew: "never" as const,
      rewardId: "rew.segredo_pimenta",
    };
    const found = harvest(fresh(), secret, C)!;
    expect(stock(found)["ing.pimenta_dragao"]).toBe(1); // vem só da recompensa, sem dobrar
    expect(activeCharacter(found).xp).toBe(15);
    expect(harvest(restAtOven(found, "oven.mestre", C), secret, C)).toBeNull();
  });

  it("Cogumelo e Pimenta-Dragão funcionam em qualquer pizza", () => {
    const char = activeCharacter(fresh());
    const withMushroom = previewPizza(
      "rec.margherita",
      [...MARGHERITA_IDS, "ing.cogumelo"],
      char,
      C,
    );
    if ("kind" in withMushroom) throw new Error(withMushroom.kind);
    expect(withMushroom.action.applyStatus).toContainEqual({
      status: "status.enfraquecido",
      target: "opponent",
      duration: 1,
    });
    const withPepper = previewPizza(
      "rec.margherita",
      [...MARGHERITA_IDS, "ing.pimenta_dragao"],
      char,
      C,
    );
    if ("kind" in withPepper) throw new Error(withPepper.kind);
    expect(withPepper.action.applyStatus).toContainEqual({
      status: "status.queimadura",
      target: "opponent",
      duration: 1,
      bonusDamage: 1,
    });
  });
});
