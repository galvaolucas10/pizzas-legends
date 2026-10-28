/**
 * Migrações do save (DATA_MODELS 7.3). Cada mudança de formato incrementa a versão e
 * acrescenta a migração N → N+1. Migrações nunca são removidas.
 */
export const CURRENT_SCHEMA_VERSION = 7;

/**
 * v4: a missão principal ganhou etapas de clientes no salão e perdeu a das vespas.
 * Antigas: 0 pizza, 1 ratos, 2 vespas, 3 mestre, 4 ravena, 5 voltar (6 = fim).
 * Novas: 0 pizza, 1 clientes A, 2 ratos, 3 clientes B, 4 mestre, 5 clientes C, 6 ravena, 7 voltar (8 = fim).
 */
const MAIN_QUEST_STEP_V4: Record<number, number> = { 0: 0, 1: 2, 2: 3, 3: 4, 4: 6, 5: 7, 6: 8 };

type Migration = (data: unknown) => unknown;

const migrations: Record<number, Migration> = {
  /** v2: o nível passou a começar em 0 (antes, 1). Todo nível desce 1; XP e pontos ficam. */
  1: (v1) => {
    const data = v1 as { characters?: { level?: number }[] };
    return {
      ...data,
      characters: (data.characters ?? []).map((c) => ({
        ...c,
        level: Math.max(0, (c.level ?? 1) - 1),
      })),
    };
  },
  /** v3: o nível voltou a começar em 1. Desfaz a v2 (todo nível sobe 1). */
  2: (v2) => {
    const data = v2 as { characters?: { level?: number }[] };
    return {
      ...data,
      characters: (data.characters ?? []).map((c) => ({ ...c, level: (c.level ?? 0) + 1 })),
    };
  },
  /** v4: renumera a etapa da missão principal (clientes no salão, sem vespas). */
  3: (v3) => {
    const data = v3 as { quests?: Record<string, { step?: number }> };
    const main = data.quests?.["quest.primeiro_desafio"];
    if (!main || typeof main.step !== "number") return data;
    const step = MAIN_QUEST_STEP_V4[main.step] ?? main.step;
    return { ...data, quests: { ...data.quests, "quest.primeiro_desafio": { ...main, step } } };
  },
  /**
   * v5: o bosque e a clareira saíram do jogo (a Ravena foi para a estufa, o Bento para a praça).
   * Quem estava lá volta para a cozinha do Mestre; fornos e marcas desses mapas são esquecidos.
   */
  4: (v4) => {
    const data = v4 as {
      world?: {
        mapId?: string;
        position?: unknown;
        lastOvenId?: string;
        defeatedEnemies?: string[];
        harvested?: string[];
      };
    };
    const world = data.world;
    if (!world) return data;
    const gone = (id: string | undefined) => id === "map.bosque" || id === "map.clareira";
    const goneRef = (ref: string) => gone(ref.split("/")[0]);
    return {
      ...data,
      world: {
        ...world,
        ...(gone(world.mapId)
          ? { mapId: "map.cozinha_mestre", position: { x: 5, y: 6, direction: "down" } }
          : {}),
        lastOvenId:
          world.lastOvenId === "oven.acampamento"
            ? "oven.mestre"
            : world.lastOvenId === "oven.clareira"
              ? "oven.estufa"
              : world.lastOvenId,
        defeatedEnemies: (world.defeatedEnemies ?? []).filter((r) => !goneRef(r)),
        harvested: (world.harvested ?? []).filter((r) => !goneRef(r)),
      },
    };
  },
  /** v6: Quatro Queijos e Brasa passaram a vir desde o começo (antes, por recompensa). */
  5: (v5) => {
    const data = v5 as { characters?: { knownRecipes?: string[] }[] };
    const start = ["rec.margherita", "rec.quatro_queijos", "rec.brasa"];
    return {
      ...data,
      characters: (data.characters ?? []).map((c) => ({
        ...c,
        knownRecipes: [...new Set([...(c.knownRecipes ?? []), ...start])],
      })),
    };
  },
  /** v7: o desafio do garçom Beto saiu dos níveis; a missão dos níveis perdeu a 1ª etapa. */
  6: (v6) => {
    const data = v6 as { quests?: Record<string, { status?: string; step?: number }> };
    const levels = data.quests?.["quest.desafios"];
    if (!levels || typeof levels.step !== "number" || levels.status !== "active") return data;
    return {
      ...data,
      quests: {
        ...data.quests,
        "quest.desafios": { ...levels, step: Math.max(0, levels.step - 1) },
      },
    };
  },
};

export function migrate(data: unknown, fromVersion: number): unknown {
  let current = data;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`migração ${v} → ${v + 1} ausente`);
    current = step(current);
  }
  return current;
}
