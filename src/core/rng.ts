/**
 * Gerador pseudoaleatório mulberry32 (DATA_MODELS 4.7), em forma pura:
 * o estado entra e sai explícito, para ser salvo e para os testes serem reprodutíveis.
 */
export interface RngState {
  seed: number;
  state: number;
}

export function createRng(seed: number): RngState {
  const s = seed >>> 0;
  return { seed: s, state: s };
}

/** Próximo número em [0, 1) e o novo estado. */
export function nextRandom(rng: RngState): { value: number; rng: RngState } {
  const state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { seed: rng.seed, state } };
}

/** Sorteia vários números de uma vez. */
export function randoms(rng: RngState, count: number): { values: number[]; rng: RngState } {
  const values: number[] = [];
  let current = rng;
  for (let i = 0; i < count; i++) {
    const r = nextRandom(current);
    values.push(r.value);
    current = r.rng;
  }
  return { values, rng: current };
}
