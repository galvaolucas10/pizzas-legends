/**
 * Migrações do save (DATA_MODELS 7.3). Cada mudança de formato incrementa a versão e
 * acrescenta a migração N → N+1. Migrações nunca são removidas.
 */
export const CURRENT_SCHEMA_VERSION = 3;

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
