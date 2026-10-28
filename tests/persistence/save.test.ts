import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newGame } from "../../src/core/newGame";
import { fnv1a, stableStringify } from "../../src/persistence/checksum";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/migrations";
import { LocalSaveRepository, memoryStore } from "../../src/persistence/SaveRepository";
import { content } from "../helpers";

const C = content();
const summary = {
  characterName: "Nico",
  level: 1,
  mapId: "map.cozinha_mestre",
  objectiveKey: null,
  playTimeMs: 0,
};

function repo() {
  const store = memoryStore();
  let t = 1_700_000_000_000;
  return { store, repo: new LocalSaveRepository(store, C, () => new Date((t += 1000))) };
}

describe("save local (F1-16, DATA_MODELS 7.2 e 8.2)", () => {
  it("grava e recarrega o mesmo estado; revision incrementa", async () => {
    const { repo: r } = repo();
    const data = newGame(C, { name: "Nico", seed: 5 });
    const first = await r.save("auto", data, summary);
    const second = await r.save("auto", data, summary);
    expect([first.revision, second.revision]).toEqual([1, 2]);
    const loaded = await r.load("auto");
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") expect(loaded.file.data).toEqual(data);
  });

  it("slot vazio", async () => {
    expect((await repo().repo.load("slot1")).status).toBe("empty");
  });

  it("save corrompido vai para backup, libera o slot e não trava", async () => {
    const { store, repo: r } = repo();
    store.setItem("pizzalegends:save:auto", "{ isto não é json");
    const result = await r.load("auto");
    expect(result).toEqual({ status: "corrupted", reason: "JSON inválido" });
    expect(store.keys().some((k) => k.startsWith("pizzalegends:backup:auto:"))).toBe(true);
    expect(store.getItem("pizzalegends:save:auto")).toBeNull();
  });

  it("checksum errado é corrupção; mantém no máximo 3 backups", async () => {
    const { store, repo: r } = repo();
    for (let i = 0; i < 5; i++) {
      const file = await r.save("auto", newGame(C, { name: "Nico", seed: i }), summary);
      store.setItem("pizzalegends:save:auto", JSON.stringify({ ...file, checksum: "00000000" }));
      expect((await r.load("auto")).status).toBe("corrupted");
    }
    expect(store.keys().filter((k) => k.includes(":backup:")).length).toBe(3);
  });

  it("save de versão mais nova não é carregado", async () => {
    const { store, repo: r } = repo();
    const file = await r.save("auto", newGame(C, { name: "Nico", seed: 1 }), summary);
    store.setItem(
      "pizzalegends:save:auto",
      JSON.stringify({ ...file, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    );
    expect(await r.load("auto")).toEqual({
      status: "newerVersion",
      version: CURRENT_SCHEMA_VERSION + 1,
    });
  });

  it("estrutura inválida (ex.: nível 0) é corrupção", async () => {
    const { store, repo: r } = repo();
    const data = newGame(C, { name: "Nico", seed: 1 });
    const bad = { ...data, characters: [{ ...data.characters[0]!, level: 0 }] };
    const file = await r.save("auto", data, summary);
    store.setItem(
      "pizzalegends:save:auto",
      JSON.stringify({ ...file, data: bad, checksum: fnv1a(stableStringify(bad)) }),
    );
    expect((await r.load("auto")).status).toBe("corrupted");
  });

  it("IDs de conteúdo removido são retirados com aviso, sem travar", async () => {
    const { store, repo: r } = repo();
    const data = newGame(C, { name: "Nico", seed: 1 });
    const old = {
      ...data,
      inventory: {
        ...data.inventory,
        ingredients: { ...data.inventory.ingredients, "ing.tomate_lunar": 2 },
      },
    };
    const file = await r.save("auto", data, summary);
    store.setItem(
      "pizzalegends:save:auto",
      JSON.stringify({ ...file, data: old, checksum: fnv1a(stableStringify(old)) }),
    );
    const loaded = await r.load("auto");
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.file.data.inventory.ingredients).not.toHaveProperty("ing.tomate_lunar");
      expect(loaded.warnings[0]).toContain("ing.tomate_lunar");
    }
  });

  it("a fixture v1.json migra até a versão atual e passa na validação (DATA_MODELS 7.3)", async () => {
    const { store, repo: r } = repo();
    const fixture = readFileSync(join(import.meta.dirname, "../fixtures/saves/v1.json"), "utf8");
    store.setItem("pizzalegends:save:slot1", fixture);
    const loaded = await r.load("slot1");
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(loaded.file.data.characters[0]!.name).toBe("Nico");
      // v1 → v2 → v3: o nível desceu para começar em 0 e voltou a começar em 1.
      expect(loaded.file.data.characters[0]!.level).toBe(1);
      expect(loaded.file.summary.level).toBe(1);
    }
  });

  it("save v2 (nível começando em 0) volta a começar em 1 na v3", async () => {
    const { store, repo: r } = repo();
    const data = newGame(C, { name: "Nico", seed: 2 });
    const v2 = { ...data, characters: [{ ...data.characters[0]!, level: 0 }] };
    const file = await r.save("auto", data, summary);
    store.setItem(
      "pizzalegends:save:auto",
      JSON.stringify({
        ...file,
        schemaVersion: 2,
        data: v2,
        checksum: fnv1a(stableStringify(v2)),
      }),
    );
    const loaded = await r.load("auto");
    expect(loaded.status === "ok" && loaded.file.data.characters[0]!.level).toBe(1);
  });
});

describe("migração v4 (clientes no salão, sem vespas)", () => {
  it("renumera a etapa da missão principal", async () => {
    const { migrate } = await import("../../src/persistence/migrations");
    const at = (step: number) =>
      (
        migrate({ quests: { "quest.primeiro_desafio": { status: "active", step } } }, 3) as {
          quests: Record<string, { step: number }>;
        }
      ).quests["quest.primeiro_desafio"]!.step;
    // Antigas: 0 pizza, 1 ratos, 2 vespas, 3 mestre, 4 ravena, 5 voltar.
    expect([0, 1, 2, 3, 4, 5].map(at)).toEqual([0, 2, 3, 4, 6, 7]);
  });
});

describe("migração v5 (sem bosque e clareira)", () => {
  it("quem estava no bosque volta para a cozinha; forno da clareira vira o da estufa", async () => {
    const { migrate } = await import("../../src/persistence/migrations");
    const out = migrate(
      {
        world: {
          mapId: "map.bosque",
          position: { x: 3, y: 3, direction: "up" },
          lastOvenId: "oven.clareira",
          defeatedEnemies: ["map.bosque/fungo1", "map.despensa/rato1"],
          harvested: ["map.bosque/manjericao1"],
        },
      },
      4,
    ) as { world: Record<string, unknown> };
    expect(out.world).toEqual({
      mapId: "map.cozinha_mestre",
      position: { x: 5, y: 6, direction: "down" },
      lastOvenId: "oven.estufa",
      defeatedEnemies: ["map.despensa/rato1"],
      harvested: [],
    });
  });
});

describe("migração v7 (sem o nível do garçom)", () => {
  it("quem estava no nível do Erio (antes o 2º) continua nele (agora o 1º)", async () => {
    const { migrate } = await import("../../src/persistence/migrations");
    const at = (step: number) =>
      (
        migrate({ quests: { "quest.desafios": { status: "active", step } } }, 6) as {
          quests: Record<string, { step: number }>;
        }
      ).quests["quest.desafios"]!.step;
    expect([0, 1, 2, 3].map(at)).toEqual([0, 0, 1, 2]);
  });
});
