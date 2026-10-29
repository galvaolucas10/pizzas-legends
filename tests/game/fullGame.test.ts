import { describe, expect, it } from "vitest";
import type { Condition } from "../../src/content/schemas/conditions";
import { evaluateCondition } from "../../src/core/conditions";
import { suggestIngredients } from "../../src/core/cooking";
import { newGame } from "../../src/core/newGame";
import { coins } from "../../src/core/shop";
import { activeCharacter, type SaveData } from "../../src/core/types";
import { BattleController } from "../../src/game/battle/BattleController";
import { GameSession } from "../../src/game/GameSession";
import { content } from "../helpers";

const C = content();
const MAIN = "quest.primeiro_desafio";
const CAREER = "quest.carreira";
const LEGEND = "quest.lenda";

/** O que comprar para cada receita (massa = farinha; Quatro Queijos = mussarela + cabra). */
const SHOPPING: Record<string, string[]> = {
  "rec.margherita": ["ing.farinha", "ing.molho_tomate", "ing.mussarela"],
  "rec.quatro_queijos": ["ing.farinha", "ing.mussarela", "ing.queijo_cabra"],
  "rec.brasa": ["ing.farinha", "ing.molho_apimentado", "ing.mussarela"],
  "rec.calabresa": ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.linguica"],
  "rec.funghi": ["ing.farinha", "ing.molho_tomate", "ing.mussarela", "ing.cogumelo"],
  "rec.napolitana": ["ing.farinha", "ing.molho_tomate", "ing.queijo_cabra", "ing.manjericao"],
  "rec.calabresa_picante": ["ing.farinha", "ing.molho_apimentado", "ing.mussarela", "ing.linguica"],
};

const save = (s: GameSession) => s.state as SaveData;
const step = (s: GameSession, quest: string) => s.state.quests[quest]?.step;

/** Faz uma pizza da receita: usa o que tem; se faltar, compra com a Lia e tenta de novo. */
function cook(s: GameSession, recipeId: string): void {
  const tryCook = () =>
    s.dispatch({
      type: "cookPizza",
      recipeId,
      ingredientIds: suggestIngredients(save(s), recipeId, C),
    }).ok;
  if (tryCook()) return;
  for (const ingredientId of SHOPPING[recipeId]!) {
    const r = s.dispatch({ type: "buyIngredient", ingredientId, count: 1 });
    expect(r.ok, `comprar ${ingredientId} (moedas: ${coins(save(s), C)})`).toBe(true);
  }
  expect(tryCook(), `fazer ${recipeId}`).toBe(true);
}

function hasPizza(s: GameSession, recipeId: string): boolean {
  return s.state.inventory.pizzas.some((p) => p.recipeId === recipeId);
}

/** Atende um cliente no salão: entrega a pizza pedida (faz se não tiver) e recebe. */
function serve(s: GameSession, recipeId = "rec.margherita"): void {
  if (!hasPizza(s, recipeId)) cook(s, recipeId);
  const pizza = s.state.inventory.pizzas.find((p) => p.recipeId === recipeId)!;
  s.dispatch({ type: "takePizza", pizzaId: pizza.id });
  s.dispatch({ type: "customerPaid" });
}

/** Luta de verdade contra a Ravena, com a melhor fatia a cada turno. */
function fightRavena(s: GameSession): string {
  for (let i = 0; i < 4; i++) cook(s, "rec.quatro_queijos");
  const basket = s.state.inventory.pizzas
    .filter((p) => p.recipeId === "rec.quatro_queijos")
    .slice(0, 4)
    .map((p) => p.id);
  const c = new BattleController(s, C, "enemy.rival_ravena", basket);
  for (let turn = 0; turn < 80 && !c.finished; turn++) {
    const best = c
      .view()
      .basket.filter((p) => p.slicesLeft > 0)
      .sort((a, b) => b.predictedDamage - a.predictedDamage)[0];
    c.choose(best ? { kind: "slice", pizzaId: best.id } : { kind: "improvise" });
  }
  return c.finish().phase;
}

type Ev = {
  type: string;
  textKey?: string;
  flag?: string;
  questId?: string;
  toStep?: number;
  condition?: Condition;
  then?: Ev[];
  else?: Ev[];
};
type Talk = { condition?: Condition; events: Ev[] };

/** Conversa com o Mestre: roda a fala (setFlag, advanceQuest, if) e devolve as frases ditas. */
function talkToMestre(s: GameSession): string[] {
  const said: string[] = [];
  const run = (events: Ev[]) => {
    for (const e of events) {
      if (e.type === "message") said.push(e.textKey!);
      else if (e.type === "setFlag") s.dispatch({ type: "setFlag", flag: e.flag!, value: true });
      else if (e.type === "advanceQuest")
        s.dispatch({ type: "advanceQuest", questId: e.questId!, toStep: e.toStep! });
      else if (e.type === "if")
        run(evaluateCondition(e.condition!, s.state as SaveData, C) ? e.then! : (e.else ?? []));
    }
  };
  run(mestreSays(s));
  return said;
}

/** Fala do Mestre Basílio para o estado atual (a primeira condição verdadeira vence). */
function mestreSays(s: GameSession) {
  const mestre = C.maps["map.cozinha_mestre"]!.objects.find(
    (o) => o.id === "mestre",
  ) as unknown as {
    talking: Talk[];
  };
  return mestre.talking.find(
    (t) => !t.condition || evaluateCondition(t.condition, s.state as SaveData, C),
  )!.events;
}

describe("partida completa: do desafio 1 à Lenda do Restaurante", () => {
  it("passa pelos 17 desafios: Mestre Pizzaiolo no 10 e Lenda do Restaurante no 17", () => {
    const s = new GameSession(C, newGame(C, { name: "Nico", seed: 2026, look: 2 }));
    expect(step(s, MAIN)).toBe(0);

    // ---------- Primeiro Desafio: desafios 1 a 8 ----------
    cook(s, "rec.margherita"); // Desafio 1
    expect(step(s, MAIN)).toBe(1);
    serve(s);
    serve(s); // Desafio 2
    expect(step(s, MAIN)).toBe(2);
    cook(s, "rec.quatro_queijos");
    cook(s, "rec.brasa"); // Desafio 3
    expect(step(s, MAIN)).toBe(3);
    serve(s, "rec.quatro_queijos");
    serve(s); // Desafio 4
    expect(step(s, MAIN)).toBe(4);
    s.dispatch({ type: "setFlag", flag: "flag.mestre_explicou_arvore", value: true }); // Desafio 5
    expect(step(s, MAIN)).toBe(5);
    serve(s, "rec.brasa");
    serve(s); // Desafio 6
    expect(step(s, MAIN)).toBe(6);
    expect(fightRavena(s), "batalha contra a Ravena").toBe("victory"); // Desafio 7
    s.dispatch({ type: "setFlag", flag: "flag.ravena_derrotada", value: true });
    expect(step(s, MAIN)).toBe(7);
    s.dispatch({ type: "setFlag", flag: "flag.voltou_vila", value: true }); // Desafio 8
    expect(s.questStatus(MAIN)).toMatch(/completed|rewarded/);
    expect(s.questStatus(CAREER)).toBe("available");

    // ---------- Carreira: desafios 9 e 10 ----------
    s.dispatch({ type: "advanceQuest", questId: CAREER, toStep: 0 }); // o Mestre começa a Carreira
    for (let i = 0; i < 3; i++) serve(s); // Desafio 9
    expect(step(s, CAREER)).toBe(1);
    expect(activeCharacter(save(s)).knownRecipes).toContain("rec.calabresa");
    cook(s, "rec.calabresa"); // Desafio 10: Calabresa + 150 moedas
    for (let i = 0; i < 60 && s.questStatus(CAREER) === "active"; i++) serve(s, "rec.margherita");
    expect(s.questStatus(CAREER)).toMatch(/completed|rewarded/);

    // ---------- Final: Mestre Pizzaiolo no desafio 10 ----------
    expect(s.state.flags["flag.mestre_pizzaiolo"]).toBe(true);
    expect(talkToMestre(s)).toEqual([
      "dlg.mestre_basilio.final.1",
      "dlg.mestre_basilio.final.2",
      "dlg.mestre_basilio.final.3",
      "dlg.mestre_basilio.lenda.inicio",
    ]);
    expect(activeCharacter(save(s)).look).toBe(2);

    // ---------- Lenda do Restaurante: desafios 11 a 17 ----------
    expect(s.questStatus(LEGEND)).toBe("active");
    expect(talkToMestre(s)).toEqual(["dlg.mestre_basilio.lenda.andamento"]);
    for (let i = 0; i < 5; i++) serve(s); // Desafio 11
    expect(step(s, LEGEND)).toBe(1);
    expect(activeCharacter(save(s)).knownRecipes).toContain("rec.napolitana");
    cook(s, "rec.funghi");
    cook(s, "rec.napolitana"); // Desafio 12
    expect(step(s, LEGEND)).toBe(2);
    cook(s, "rec.calabresa_picante"); // Desafio 13
    expect(step(s, LEGEND)).toBe(3);
    for (const id of ["ing.massa_fermentada", "ing.queijo_cabra", "ing.queijo_defumado"])
      s.dispatch({ type: "buyIngredient", ingredientId: id, count: 1 });
    s.dispatch({
      type: "cookPizza",
      recipeId: "rec.quatro_queijos",
      ingredientIds: ["ing.massa_fermentada", "ing.queijo_cabra", "ing.queijo_defumado"],
    }); // Desafio 14: nota 4
    expect(step(s, LEGEND)).toBe(4);
    for (const recipe of Object.keys(SHOPPING)) if (!hasPizza(s, recipe)) cook(s, recipe); // Desafio 15
    expect(step(s, LEGEND)).toBe(5);
    for (let i = 0; i < 8; i++) serve(s); // Desafio 16
    expect(step(s, LEGEND)).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 200 && s.questStatus(LEGEND) === "active"; i++) serve(s); // Desafio 17
    expect(s.questStatus(LEGEND)).toMatch(/completed|rewarded/);
    expect(s.state.flags["flag.lenda_restaurante"]).toBe(true);
    expect(talkToMestre(s)).toEqual([
      "dlg.mestre_basilio.lenda.final.1",
      "dlg.mestre_basilio.lenda.final.2",
      "dlg.mestre_basilio.lenda.final.3",
    ]);
    expect(talkToMestre(s)).toEqual(["dlg.mestre_basilio.lenda.depois.1"]);
    expect(activeCharacter(save(s)).level).toBe(C.balance.maxLevel);
  });

  it("save antigo que estava no meio da Carreira de 14 níveis vira Mestre Pizzaiolo", () => {
    const old = newGame(C, { name: "Nico", seed: 1 });
    old.quests[CAREER] = { status: "active", step: 4 };
    const s = new GameSession(C, old);
    s.dispatch({ type: "setFlag", flag: "flag.qualquer", value: true });
    expect(s.questStatus(CAREER)).toMatch(/completed|rewarded/);
    expect(s.state.flags["flag.mestre_pizzaiolo"]).toBe(true);
  });

  it("quem já tinha visto o final antes da Lenda existir recebe o convite do Mestre", () => {
    const s = new GameSession(C, newGame(C, { name: "Nico", seed: 1 }));
    s.dispatch({ type: "setFlag", flag: "flag.mestre_pizzaiolo", value: true });
    s.dispatch({ type: "setFlag", flag: "flag.final_visto", value: true });
    expect(s.questStatus(LEGEND)).toBe("available");
    expect(talkToMestre(s)).toEqual([
      "dlg.mestre_basilio.final_depois.1",
      "dlg.mestre_basilio.lenda.inicio",
    ]);
    expect(s.questStatus(LEGEND)).toBe("active");
  });
});
