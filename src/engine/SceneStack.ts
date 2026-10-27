import { VIEW_H, VIEW_W } from "./render/viewport";

/** Cena do jogo (ARCHITECTURE 7). */
export interface Scene {
  enter?(): void | Promise<void>;
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
  /** Overlays como o menu pausam a cena de baixo. */
  readonly blocksUpdateBelow: boolean;
}

/** Duração de cada metade do fade (escurecer / clarear). */
export const FADE_MS = 250;

type Phase = "out" | "loading" | "in";

interface Transition {
  phase: Phase;
  elapsed: number;
  work: () => Promise<void>;
  onDone?: () => void;
}

export interface SceneStackOptions {
  /** Chamados no início e no fim de cada transição (ex.: ignorar a entrada). */
  onTransitionStart?(): void;
  onTransitionEnd?(): void;
}

/**
 * Pilha de cenas: todas são desenhadas; só as de cima (até um bloqueio) atualizam.
 * `transition()` escurece a tela, executa o trabalho (ex.: trocar de mapa) e clareia de novo,
 * tudo no relógio do jogo.
 */
export class SceneStack {
  private readonly scenes: Scene[] = [];
  private transitionState: Transition | null = null;

  constructor(private readonly options: SceneStackOptions = {}) {}

  get top(): Scene | undefined {
    return this.scenes[this.scenes.length - 1];
  }

  get inTransition(): boolean {
    return this.transitionState !== null;
  }

  async push(scene: Scene): Promise<void> {
    this.scenes.push(scene);
    await scene.enter?.();
  }

  pop(): Scene | undefined {
    const scene = this.scenes.pop();
    scene?.exit?.();
    return scene;
  }

  /** Fade out → `work()` → fade in. Ignorado se já houver uma transição em andamento. */
  transition(work: () => Promise<void>, onDone?: () => void): boolean {
    if (this.transitionState) return false;
    this.transitionState = { phase: "out", elapsed: 0, work, onDone };
    this.options.onTransitionStart?.();
    return true;
  }

  update(dt: number): void {
    this.updateTransition(dt);
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const scene = this.scenes[i]!;
      scene.update(dt);
      if (scene.blocksUpdateBelow) break;
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    for (const scene of this.scenes) scene.render(ctx, alpha);
    const opacity = this.fadeOpacity();
    if (opacity > 0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }

  /** Opacidade do preto (0 = sem fade, 1 = tela preta). */
  fadeOpacity(): number {
    const t = this.transitionState;
    if (!t) return 0;
    if (t.phase === "loading") return 1;
    const progress = Math.min(t.elapsed / FADE_MS, 1);
    return t.phase === "out" ? progress : 1 - progress;
  }

  private updateTransition(dt: number): void {
    const t = this.transitionState;
    if (!t || t.phase === "loading") return;
    t.elapsed += dt;
    if (t.elapsed < FADE_MS) return;
    if (t.phase === "out") {
      t.phase = "loading";
      t.work()
        .catch((error: unknown) => console.error("[transição]", error))
        .finally(() => {
          t.phase = "in";
          t.elapsed = 0;
        });
    } else {
      this.transitionState = null;
      this.options.onTransitionEnd?.();
      t.onDone?.();
    }
  }
}
