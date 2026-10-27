/** Cena do jogo (ARCHITECTURE 7). */
export interface Scene {
  enter?(): void | Promise<void>;
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
  /** Overlays como o menu pausam a cena de baixo. */
  readonly blocksUpdateBelow: boolean;
}

/** Pilha de cenas: todas são desenhadas; só as de cima (até um bloqueio) atualizam. */
export class SceneStack {
  private readonly scenes: Scene[] = [];

  get top(): Scene | undefined {
    return this.scenes[this.scenes.length - 1];
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

  update(dt: number): void {
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const scene = this.scenes[i]!;
      scene.update(dt);
      if (scene.blocksUpdateBelow) break;
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    for (const scene of this.scenes) scene.render(ctx, alpha);
  }
}
