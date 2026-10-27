/**
 * Migrações do save (DATA_MODELS 7.3). Cada mudança de formato incrementa a versão e
 * acrescenta a migração N → N+1. Migrações nunca são removidas.
 */
export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (data: unknown) => unknown;

const migrations: Record<number, Migration> = {
  // 1: (v1) => v2,
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
