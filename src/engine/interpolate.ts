/** Posição entre o tick anterior e o atual, arredondada para pixel inteiro (pixel art nítido). */
export function interpolate(previous: number, current: number, alpha: number): number {
  return Math.round(previous + (current - previous) * alpha);
}
