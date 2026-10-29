import type { Action, InputManager } from "../engine/input/InputManager";

/**
 * Controles de toque (modo celular): setas para andar no canto esquerdo e os botões
 * A (falar/escolher) e B (voltar) no canto direito. Segurar a seta mantém o personagem andando.
 */
export function createTouchPad(doc: Document, input: InputManager) {
  const element = doc.createElement("div");
  element.className = "touch-pad";
  const button = (label: string, action: Action, className: string) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = `touch-pad__btn ${className}`;
    b.textContent = label;
    b.setAttribute("aria-label", label);
    const release = () => input.release(action);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture?.(e.pointerId);
      input.press(action);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"] as const)
      b.addEventListener(ev, release);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  };
  const dpad = doc.createElement("div");
  dpad.className = "touch-pad__dpad";
  dpad.append(
    button("▲", "up", "touch-pad__up"),
    button("◀", "left", "touch-pad__left"),
    button("▶", "right", "touch-pad__right"),
    button("▼", "down", "touch-pad__down"),
  );
  const actions = doc.createElement("div");
  actions.className = "touch-pad__actions";
  actions.append(button("B", "cancel", "touch-pad__b"), button("A", "confirm", "touch-pad__a"));
  element.append(dpad, actions);
  return element;
}
