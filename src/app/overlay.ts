import type { InputContext, InputManager } from "../engine/input/InputManager";
import type { Scene, SceneStack } from "../engine/SceneStack";

/** Tela em DOM que vira uma cena (forno, menu, título). */
export interface ScreenLike {
  update(dt: number): void;
  readonly done: boolean;
  destroy(): void;
}

/**
 * Empilha uma tela DOM como cena: pausa o que está embaixo, toma o contexto de entrada e,
 * quando a tela termina, sai da pilha e chama `onClose`.
 */
export function pushOverlay(
  scenes: SceneStack,
  input: InputManager,
  context: InputContext,
  create: () => ScreenLike,
  onClose?: () => void,
): void {
  let screen: ScreenLike | null = null;
  let closed = false;
  const scene: Scene = {
    blocksUpdateBelow: true,
    enter() {
      input.pushContext(context);
      screen = create();
    },
    exit() {
      input.popContext(context);
      screen?.destroy();
    },
    update(dt) {
      if (!screen || closed) return;
      screen.update(dt);
      if (screen.done && scenes.top === scene) {
        closed = true;
        scenes.pop();
        onClose?.();
      }
    },
    render() {},
  };
  void scenes.push(scene);
}
