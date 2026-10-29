import { describe, expect, it } from "vitest";
import type { Condition } from "../../src/content/schemas/conditions";
import { evaluateCondition } from "../../src/core/conditions";
import { content } from "../helpers";

type Talk = { condition?: Condition; events: { type: string; textKey?: string; flag?: string }[] };

/** Falas que o Mestre diz com estas flags (a primeira condição verdadeira vence). */
function mestreSays(flags: Record<string, boolean>) {
  const c = content();
  const mestre = c.maps["map.cozinha_mestre"]!.objects.find(
    (o) => o.id === "mestre",
  ) as unknown as {
    talking: Talk[];
  };
  const talk = mestre.talking.find(
    (t) => !t.condition || evaluateCondition(t.condition, { flags }),
  );
  return talk!.events;
}

describe("final da Carreira (nível 14)", () => {
  it("o último nível marca o jogador como Mestre Pizzaiolo", () => {
    const quest = content().quests["quest.carreira"]!;
    const last = quest.steps[quest.steps.length - 1]!;
    expect(content().rewards[last.rewardId!]!.setFlags).toContain("flag.mestre_pizzaiolo");
    expect(content().locale["quest.carreira.concluida"]).toBeTruthy();
  });

  it("o Mestre faz o discurso final uma vez e depois só cumprimenta", () => {
    const first = mestreSays({ "flag.mestre_pizzaiolo": true });
    expect(first.map((e) => e.textKey).filter(Boolean)).toEqual([
      "dlg.mestre_basilio.final.1",
      "dlg.mestre_basilio.final.2",
      "dlg.mestre_basilio.final.3",
    ]);
    expect(first).toContainEqual({ type: "setFlag", flag: "flag.final_visto" });

    // Depois do final, a fala do Mestre convida para a Lenda do Restaurante (testado em fullGame).
    const later = mestreSays({ "flag.mestre_pizzaiolo": true, "flag.final_visto": true });
    expect(JSON.stringify(later)).toContain("dlg.mestre_basilio.final_depois.1");
  });
});
