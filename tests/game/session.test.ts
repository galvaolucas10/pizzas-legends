import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { GameSession } from "../../src/game/GameSession";
import { content } from "../helpers";

const C = content();
const session = () => new GameSession(C, newGame(C, { name: "Nico", seed: 3 }));
const MARGHERITA = ["ing.farinha", "ing.molho_tomate", "ing.mussarela"];

describe("GameSession (F1-03)", () => {
  it("comando inválido não altera o estado e devolve o erro tipado", () => {
    const s = session();
    const before = s.state;
    const result = s.dispatch({ type: "cookPizza", recipeId: "rec.brasa", ingredientIds: [] });
    expect(result).toEqual({ ok: false, error: { kind: "recipeUnknown", recipeId: "rec.brasa" } });
    expect(s.state).toBe(before);
  });

  it("depois de cada comando, as missões avançam e os sinais avisam a interface", () => {
    const s = session();
    const seen: string[] = [];
    s.signals.on("questEvent", (e) => seen.push(e.type));
    s.signals.on("itemsGained", () => seen.push("itemsGained"));
    s.signals.on("objectiveChanged", (key) => seen.push(`objetivo:${key}`));
    const result = s.dispatch({
      type: "cookPizza",
      recipeId: "rec.margherita",
      ingredientIds: MARGHERITA,
    });
    expect(result.ok).toBe(true);
    expect(s.state.quests["quest.primeiro_desafio"]!.step).toBe(1);
    expect(seen).toContain("questStepCompleted");
    expect(seen).toContain("itemsGained"); // recompensa da etapa 1
    expect(seen).toContain("objetivo:quest.primeiro_desafio.etapa2");
  });

  it("incrementFlag alimenta contadores das missões (2 ratos → etapa 2)", () => {
    const s = session();
    s.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    s.dispatch({ type: "incrementFlag", flag: "flag.ratos_derrotados", by: 1 });
    expect(s.state.quests["quest.primeiro_desafio"]!.step).toBe(1);
    s.dispatch({ type: "incrementFlag", flag: "flag.ratos_derrotados", by: 1 });
    expect(s.state.quests["quest.primeiro_desafio"]!.step).toBe(2);
    expect(s.state.characters[0]!.knownRecipes).toContain("rec.quatro_queijos");
  });

  it("levelUp é sinalizado", () => {
    const s = session();
    const levels: number[] = [];
    s.signals.on("levelUp", (e) => levels.push(e.level));
    s.dispatch({ type: "claimReward", rewardId: "rew.pedido_lenhador" });
    expect(levels).toEqual([2]);
  });
});
