/** Clipe de animação: quadros [coluna, linha] da folha de sprites. */
export interface AnimationClip {
  frames: readonly (readonly [number, number])[];
  frameDurationMs: number;
  loop: boolean;
}

/**
 * Animação por tempo do jogo (ARCHITECTURE 13): `update(dt)` avança o quadro,
 * o desenho só lê `frame`. Trocar para o clipe atual não reinicia a animação.
 */
export class SpriteAnimator {
  private key: string;
  private index = 0;
  private elapsedMs = 0;

  constructor(
    private readonly clips: Readonly<Record<string, AnimationClip>>,
    initial: string,
  ) {
    this.key = initial;
  }

  get current(): string {
    return this.key;
  }

  get frameIndex(): number {
    return this.index;
  }

  get frame(): readonly [number, number] {
    return this.clips[this.key]?.frames[this.index] ?? [0, 0];
  }

  play(key: string): void {
    if (key === this.key) return;
    this.key = key;
    this.index = 0;
    this.elapsedMs = 0;
  }

  update(dt: number): void {
    const clip = this.clips[this.key];
    if (!clip || clip.frames.length <= 1) return;
    this.elapsedMs += dt;
    while (this.elapsedMs >= clip.frameDurationMs) {
      this.elapsedMs -= clip.frameDurationMs;
      if (this.index + 1 < clip.frames.length) this.index += 1;
      else if (clip.loop) this.index = 0;
    }
  }
}
