import { GameClock } from "./GameClock";

/** Simulação a 60 Hz em qualquer monitor (ARCHITECTURE 6.1). */
export const TICK_MS = 1000 / 60;
/** Teto por quadro: evita uma "espiral" de ticks após uma travada. */
export const MAX_FRAME_MS = 250;
/** Tolerância para erros de ponto flutuante (1000/60 não é exato). */
const EPSILON_MS = 1e-6;

export interface GameLoopOptions {
  /** Lógica do jogo; sempre recebe dt = TICK_MS. */
  update(dt: number): void;
  /** Desenho; alpha (0..1) é a fração do próximo tick, usada na interpolação. */
  render(alpha: number): void;
  requestFrame?: (cb: (now: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

export class GameLoop {
  readonly clock = new GameClock();
  private readonly options: GameLoopOptions;
  private readonly requestFrame: (cb: (now: number) => void) => number;
  private readonly cancelFrame: (id: number) => void;
  private accumulator = 0;
  private last: number | null = null;
  private frameId: number | null = null;

  constructor(options: GameLoopOptions) {
    this.options = options;
    this.requestFrame = options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  }

  get running(): boolean {
    return this.frameId !== null;
  }

  start(): void {
    if (this.running) return;
    this.resetTiming();
    const step = (now: number) => {
      this.frame(now);
      if (this.frameId !== null) this.frameId = this.requestFrame(step);
    };
    this.frameId = this.requestFrame(step);
  }

  stop(): void {
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
  }

  /** Descarta o tempo acumulado (ex.: ao voltar de uma aba oculta), sem "salto" de simulação. */
  resetTiming(): void {
    this.last = null;
    this.accumulator = 0;
  }

  /** Processa um quadro. Público para os testes simularem qualquer taxa de atualização. */
  frame(now: number): void {
    if (this.last === null) this.last = now;
    const frameMs = Math.min(now - this.last, MAX_FRAME_MS);
    this.last = now;

    this.accumulator += frameMs;
    while (this.accumulator >= TICK_MS - EPSILON_MS) {
      this.options.update(TICK_MS);
      this.clock.advance(TICK_MS);
      this.accumulator = Math.max(0, this.accumulator - TICK_MS);
    }
    this.options.render(this.accumulator / TICK_MS);
  }
}
