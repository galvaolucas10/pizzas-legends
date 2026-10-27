import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { GameSession } from "../../src/game/GameSession";
import { SaveSystem } from "../../src/game/SaveSystem";
import { LocalSaveRepository, memoryStore } from "../../src/persistence/SaveRepository";
import type { UiInput } from "../../src/ui/components/Menu";
import { BattleScreen } from "../../src/ui/screens/BattleScreen";
import { OvenScreen } from "../../src/ui/screens/OvenScreen";
import { PauseMenu } from "../../src/ui/screens/PauseMenu";
import { content, fakeDocument, FakeUiInput, visibleText } from "../helpers";

const C = content();
const MARGHERITA = ["ing.farinha", "ing.molho_tomate", "ing.mussarela"];

function setup() {
  const session = new GameSession(C, newGame(C, { name: "Nico", seed: 11 }));
  const doc = fakeDocument();
  const root = doc.createElement("div");
  const input = new FakeUiInput();
  return { session, doc, root, input, ui: input as unknown as UiInput };
}

/** Um tick de tela: aperta (opcionalmente) uma ação e atualiza. */
function tick(screen: { update(dt: number): void }, input: FakeUiInput, action?: string) {
  input.clear();
  if (action) input.press(action);
  screen.update(1000 / 60);
}

describe("tela do forno (F1-08)", () => {
  it("prepara uma Margherita pelo menu e a missão avança", () => {
    const { session, doc, root, input, ui } = setup();
    const oven = new OvenScreen({
      doc,
      root,
      session,
      content: C,
      ovenId: "oven.mestre",
      input: ui,
    });
    expect(oven.currentPage).toBe("main");
    tick(oven, input, "confirm"); // Preparar pizza
    expect(oven.currentPage).toBe("recipes");
    expect(visibleText(root)).toContain("Qualidade"); // prévia antes de confirmar
    tick(oven, input, "confirm"); // Margherita
    expect(oven.currentPage).toBe("recipe");
    tick(oven, input, "confirm"); // Preparar!
    expect(session.state.inventory.pizzas).toHaveLength(1);
    expect(session.state.quests["quest.primeiro_desafio"]!.step).toBe(1);
    expect(visibleText(root)).toContain("Margherita pronta");
    // Esc volta às receitas, ao menu principal e fecha.
    tick(oven, input, "cancel");
    tick(oven, input, "cancel");
    tick(oven, input, "cancel");
    expect(oven.done).toBe(true);
  });

  it("receita sem ingredientes fica desabilitada e explica o motivo", () => {
    const { session, doc, root, input, ui } = setup();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    session.dispatch({
      type: "takeIngredients",
      items: [{ ingredientId: "ing.farinha", count: 3 }],
    });
    const oven = new OvenScreen({
      doc,
      root,
      session,
      content: C,
      ovenId: "oven.mestre",
      input: ui,
    });
    tick(oven, input, "confirm");
    tick(oven, input, "confirm"); // tenta a Margherita
    expect(oven.currentPage).toBe("recipes");
    expect(visibleText(root)).toMatch(/Falta/);
  });
});

describe("tela da batalha (F1-13/F1-14)", () => {
  function battleWithPizzas() {
    const s = setup();
    s.session.dispatch({ type: "claimReward", rewardId: "rew.primeiro_desafio_etapa1" });
    for (let i = 0; i < 3; i++) {
      s.session.dispatch({
        type: "cookPizza",
        recipeId: "rec.margherita",
        ingredientIds: MARGHERITA,
      });
    }
    return s;
  }

  it("cesta → turnos → resumo: a vitória grava XP e fatias na sessão", () => {
    const { session, doc, root, input, ui } = battleWithPizzas();
    const slicesBefore = session.state.inventory.pizzas.reduce((n, p) => n + p.slicesLeft, 0);
    const screen = new BattleScreen({
      doc,
      root,
      session,
      content: C,
      request: { enemyId: "enemy.rato_despensa", enemyGlobalId: "map.despensa/rato1" },
      input: ui,
      iconUrl: () => null,
    });
    expect(visibleText(root)).toContain("Monte a cesta");
    for (let i = 0; i < 3000 && !screen.outcome; i++) tick(screen, input, "confirm");
    expect(screen.outcome).toBe("victory");
    expect(screen.enemyDown).toBe(true);
    expect(screen.hits.enemy).toBeGreaterThan(0);
    expect(session.state.characters[0]!.xp).toBeGreaterThan(0);
    expect(session.state.world.defeatedEnemies).toContain("map.despensa/rato1");
    const slicesAfter = session.state.inventory.pizzas.reduce((n, p) => n + p.slicesLeft, 0);
    expect(slicesAfter).toBeLessThan(slicesBefore);
  });

  it("fugir encerra sem resumo", () => {
    const { session, doc, root, input, ui } = battleWithPizzas();
    const screen = new BattleScreen({
      doc,
      root,
      session,
      content: C,
      request: { enemyId: "enemy.rato_despensa" },
      input: ui,
      iconUrl: () => null,
    });
    tick(screen, input, "confirm"); // Lutar!
    // Passa as mensagens de abertura até o menu.
    for (let i = 0; i < 400 && !visibleText(root).includes("O que você vai fazer?"); i++)
      tick(screen, input, "confirm");
    tick(screen, input, "down");
    tick(screen, input, "down"); // Fugir
    tick(screen, input, "confirm");
    for (let i = 0; i < 400 && !screen.outcome; i++) tick(screen, input, "confirm");
    expect(screen.outcome).toBe("fled");
    expect(session.state.stats.fled).toBe(1);
  });

  it("sem pizzas, a luta começa direto e só dá para improvisar", () => {
    const { session, doc, root, input, ui } = setup();
    const screen = new BattleScreen({
      doc,
      root,
      session,
      content: C,
      request: { enemyId: "enemy.rato_despensa" },
      input: ui,
      iconUrl: () => null,
    });
    expect(visibleText(root)).not.toContain("Monte a cesta");
    for (let i = 0; i < 400 && !visibleText(root).includes("O que você vai fazer?"); i++)
      tick(screen, input, "confirm");
    expect(visibleText(root)).toContain("Improvisar");
  });
});

describe("menu de pausa (F1-09)", () => {
  it("mostra pizzas, ingredientes, missões e status; Tab fecha", () => {
    const { session, doc, root, input, ui } = setup();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    const menu = new PauseMenu({ doc, root, session, content: C, input: ui, iconUrl: () => null });
    expect(visibleText(root)).toContain("Margherita");
    tick(menu, input, "down");
    expect(visibleText(root)).toMatch(/×\d/);
    tick(menu, input, "down");
    expect(visibleText(root)).toContain("O Primeiro Desafio");
    tick(menu, input, "down");
    expect(visibleText(root)).toContain("Nico");
    tick(menu, input, "menu");
    expect(menu.done).toBe(true);
  });
});

describe("SaveSystem (F1-17)", () => {
  it("autosave grava posição e resumo; o mais recente volta no Continuar", async () => {
    const session = new GameSession(C, newGame(C, { name: "Lia", seed: 5 }));
    const repo = new LocalSaveRepository(memoryStore(), C);
    const saves = new SaveSystem({
      repo,
      session,
      beforeSave: () =>
        session.dispatch({
          type: "setPosition",
          mapId: "map.despensa",
          x: 4,
          y: 5,
          direction: "down",
        }),
    });
    expect(await saves.autosave()).toBe(false); // desligado antes de começar a partida
    saves.start();
    expect(await saves.autosave()).toBe(true);
    const latest = await saves.latest();
    expect(latest?.data.world.mapId).toBe("map.despensa");
    expect(latest?.summary.characterName).toBe("Lia");
  });

  it("concluir uma etapa dispara o autosave", async () => {
    const session = new GameSession(C, newGame(C, { name: "Nico", seed: 5 }));
    const repo = new LocalSaveRepository(memoryStore(), C);
    const saves = new SaveSystem({ repo, session });
    saves.start();
    session.dispatch({ type: "cookPizza", recipeId: "rec.margherita", ingredientIds: MARGHERITA });
    await new Promise((r) => setTimeout(r, 0));
    const latest = await saves.latest();
    expect(latest?.data.quests["quest.primeiro_desafio"]!.step).toBe(1);
  });
});
