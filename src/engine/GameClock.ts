/** Relógio do jogo: só avança com ticks simulados, nunca enquanto o jogo está pausado. */
export class GameClock {
  private elapsed = 0;

  get elapsedMs(): number {
    return this.elapsed;
  }

  advance(dt: number): void {
    this.elapsed += dt;
  }
}
