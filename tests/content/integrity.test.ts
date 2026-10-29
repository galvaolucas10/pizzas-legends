import { describe, expect, it } from "vitest";
import { ContentError, loadContent, type RawContent } from "../../src/content/registry";
import { bundledContent } from "../../src/content/sources";

/** Problemas encontrados depois de estragar uma cópia do conteúdo real. */
function problemsAfter(mutate: (raw: Mutable) => void): string {
  const raw = structuredClone(bundledContent()) as unknown as Mutable;
  mutate(raw);
  try {
    loadContent(raw as unknown as RawContent);
    return "";
  } catch (error) {
    if (error instanceof ContentError) return error.problems.join("\n");
    throw error;
  }
}

// O conteúdo bruto é JSON: nos testes, acesso livre para estragá-lo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mutable = Record<string, any>;
const byId = (list: Mutable[], id: string) => list.find((item) => item.id === id)!;

describe("integridade do conteúdo (DATA_MODELS 7.1)", () => {
  it("o conteúdo real é válido", () => {
    expect(problemsAfter(() => {})).toBe("");
  });

  describe("IDs", () => {
    it("prefixo errado", () => {
      expect(
        problemsAfter((raw) => {
          byId(raw.ingredients, "ing.farinha").id = "farinha";
        }),
      ).toContain('"ing.<slug_em_snake_case>"');
    });

    it("ID repetido no mesmo tipo", () => {
      expect(
        problemsAfter((raw) => {
          raw.ingredients.push({ ...byId(raw.ingredients, "ing.farinha") });
        }),
      ).toContain('ingredients.json: ID repetido "ing.farinha"');
    });
  });

  describe("integridade referencial", () => {
    it("receita com ingrediente inexistente", () => {
      expect(
        problemsAfter((raw) => {
          byId(raw.recipes, "rec.margherita").requirements[1].ingredientId = "ing.tomate_azul";
        }),
      ).toContain('rec.margherita: ingrediente inexistente "ing.tomate_azul"');
    });

    it("habilidade em ramo inexistente e pré-requisito inexistente", () => {
      const text = problemsAfter((raw) => {
        byId(raw.skills.skills, "skill.sova_firme").branchId = "branch.molho";
        byId(raw.skills.skills, "skill.harmonia").requires = ["skill.fantasma"];
      });
      expect(text).toContain('skill.sova_firme: ramo inexistente "branch.molho"');
      expect(text).toContain('skill.harmonia: pré-requisito inexistente "skill.fantasma"');
    });

    it("drop, recompensa e personagem com ingrediente inexistente", () => {
      const text = problemsAfter((raw) => {
        byId(raw.enemies, "enemy.rato_despensa").drops[0].ingredientId = "ing.queijo_lunar";
        byId(raw.rewards, "rew.primeiro_desafio_etapa1").ingredients[0].ingredientId =
          "ing.queijo_lunar";
        raw.characters[0].startingIngredients[0].ingredientId = "ing.queijo_lunar";
      });
      expect(text).toContain("enemy.rato_despensa: ingrediente inexistente");
      expect(text).toContain("rew.primeiro_desafio_etapa1: ingrediente inexistente");
      expect(text).toContain("char.aprendiz: ingrediente inexistente");
    });

    it("inimigo com ação inexistente", () => {
      expect(
        problemsAfter((raw) => {
          byId(raw.enemies, "enemy.vespa_pimenta").phases[0].pattern.push("act.voo_rasante");
        }),
      ).toContain('enemy.vespa_pimenta: ação inexistente "act.voo_rasante"');
    });

    it("missão com recompensa e condição inexistentes", () => {
      const text = problemsAfter((raw) => {
        const quest = byId(raw.quests, "quest.pedido_lenhador");
        quest.steps[0].rewardId = "rew.nada";
        quest.availableWhen = { quest: "quest.fantasma", stepAtLeast: 1 };
      });
      expect(text).toContain('recompensa inexistente "rew.nada"');
      expect(text).toContain('missão inexistente "quest.fantasma"');
    });

    it("condição que pede etapa além do fim da missão", () => {
      expect(
        problemsAfter((raw) => {
          byId(raw.quests, "quest.pedido_lenhador").availableWhen = {
            quest: "quest.primeiro_desafio",
            stepAtLeast: 9,
          };
        }),
      ).toContain('"quest.primeiro_desafio" só tem 8 etapa(s)');
    });

    it("eventos de mapa citam recompensa, inimigo, missão e forno inexistentes", () => {
      const text = problemsAfter((raw) => {
        const map = raw.maps["maps/cozinha_mestre.json"];
        map.objects.push({
          kind: "trigger",
          id: "teste",
          x: 5,
          y: 7,
          once: true,
          events: [
            { type: "claimReward", rewardId: "rew.nada" },
            { type: "startBattle", enemyId: "enemy.dragao" },
            { type: "advanceQuest", questId: "quest.primeiro_desafio", toStep: 99 },
            { type: "openOven", ovenId: "oven.lua" },
          ],
        });
      });
      expect(text).toContain('recompensa inexistente "rew.nada"');
      expect(text).toContain('inimigo inexistente "enemy.dragao"');
      expect(text).toContain('"quest.primeiro_desafio" só tem 8 etapa(s)');
      expect(text).toContain('forno inexistente "oven.lua"');
    });

    it("ícone ou sprite fora do manifesto", () => {
      const text = problemsAfter((raw) => {
        byId(raw.ingredients, "ing.farinha").icon = "icon.sumiu";
        byId(raw.enemies, "enemy.rato_despensa").sprite = "img.sumiu";
      });
      expect(text).toContain('ing.farinha: imagem inexistente "icon.sumiu"');
      expect(text).toContain('enemy.rato_despensa: imagem inexistente "img.sumiu"');
    });
  });

  it("porta para mapa ou entrada inexistente", () => {
    const text = problemsAfter((raw) => {
      const door = raw.maps["maps/cozinha_mestre.json"].objects.find(
        (o: Mutable) => o.kind === "door",
      );
      door.toEntrance = "janela";
    });
    expect(text).toMatch(/leva à entrada inexistente "map\.[a-z_]+#janela"/);
  });

  it("objeto fora do mapa ou sobre parede (exceto porta e gatilho)", () => {
    const text = problemsAfter((raw) => {
      const npc = raw.maps["maps/cozinha_mestre.json"].objects.find(
        (o: Mutable) => o.kind === "npc",
      );
      npc.x = 0;
      npc.y = 0;
    });
    expect(text).toContain("está sobre uma parede");
  });

  it("colisão com tamanho diferente do mapa", () => {
    const text = problemsAfter((raw) => {
      raw.maps["maps/despensa.json"].collision.pop();
    });
    expect(text).toContain("linhas; esperado 12");
  });

  it('coleta "never" exige rewardId', () => {
    const text = problemsAfter((raw) => {
      raw.maps["maps/cozinha_mestre.json"].objects.push({
        kind: "harvest",
        id: "erva",
        x: 5,
        y: 7,
        ingredientId: "ing.manjericao",
        count: 1,
        renew: "never",
      });
    });
    expect(text).toContain('coleta "never" exige rewardId');
  });

  it("fases do inimigo com limiares decrescentes terminando em 0", () => {
    const text = problemsAfter((raw) => {
      const ravena = byId(raw.enemies, "enemy.rival_ravena");
      ravena.phases[0].untilHpAtOrBelow = 95; // maior que o PV máximo (80)
      ravena.phases[1].untilHpAtOrBelow = 10; // não termina em 0
    });
    expect(text).toContain("limiar de PV 95 deve ser menor que 80");
    expect(text).toContain("a última fase deve terminar em 0 PV");
  });

  it('toda entidade tem ".name" e toda textKey existe', () => {
    const text = problemsAfter((raw) => {
      delete raw.locale["ing.farinha.name"];
      delete raw.locale["quest.primeiro_desafio.etapa1"];
      delete raw.locale["dlg.mestre_basilio.padrao.1"];
    });
    expect(text).toContain('ing.farinha: falta o texto "ing.farinha.name"');
    expect(text).toContain('texto inexistente "quest.primeiro_desafio.etapa1"');
    expect(text).toContain('texto inexistente "dlg.mestre_basilio.padrao.1"');
  });

  it("habilidade de nível > 1 exige outra do mesmo ramo", () => {
    const text = problemsAfter((raw) => {
      byId(raw.skills.skills, "skill.harmonia").requires = [];
      byId(raw.skills.skills, "skill.defumacao").requires = ["skill.sova_firme"];
    });
    expect(text).toContain("skill.harmonia: nível 2 precisa exigir uma habilidade do mesmo ramo");
    expect(text).toContain('pré-requisito "skill.sova_firme" é de outro ramo');
  });

  describe("regras entre entidades", () => {
    it("desbloqueio de receita coerente com a recompensa/habilidade", () => {
      const text = problemsAfter((raw) => {
        byId(raw.recipes, "rec.quatro_queijos").unlock = {
          kind: "reward",
          rewardId: "rew.primeiro_desafio_etapa2",
        };
        byId(raw.skills.skills, "skill.defumacao").effects = [
          { type: "unlockConversion", conversionId: "conv.defumacao" },
        ];
      });
      expect(text).toContain(
        'rec.quatro_queijos: a recompensa "rew.primeiro_desafio_etapa2" não entrega esta receita',
      );
      expect(text).toContain(
        'rec.defumada: a habilidade "skill.defumacao" não desbloqueia esta receita',
      );
    });

    it("toda receita exige massa (coberturas podem ser obrigatórias, ex.: Calabresa)", () => {
      const text = problemsAfter((raw) => {
        const recipe = byId(raw.recipes, "rec.brasa");
        recipe.requirements = [{ kind: "ingredient", ingredientId: "ing.manjericao", count: 1 }];
      });
      expect(text).not.toContain("é cobertura");
      expect(text).toContain("rec.brasa: toda receita exige massa");
    });

    it("balanceamento coerente", () => {
      const text = problemsAfter((raw) => {
        raw.balance.xpTable = [0, 60, 50];
        raw.balance.profileBeats.fresco = "cremoso";
      });
      expect(text).toContain("xpTable tem 3 níveis; com maxLevel 5 deveria ter 5");
      expect(text).toContain("xpTable deve ser estritamente crescente");
      expect(text).toContain("profileBeats deve formar um ciclo");
    });

    it("pizza da cesta do rival precisa aparecer em alguma fase", () => {
      const text = problemsAfter((raw) => {
        byId(raw.enemies, "enemy.rival_ravena").basket[0].actionId = "act.mordida";
      });
      expect(text).toContain('pizza da cesta usa "act.mordida", que não aparece em nenhuma fase');
    });
  });
});
