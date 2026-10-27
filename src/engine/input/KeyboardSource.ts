import type { Action, InputManager } from "./InputManager";

/** Mapeamento de teclas da demo (GDD 11.1), por `KeyboardEvent.code`. */
export const DEFAULT_KEYMAP: Record<string, Action> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  KeyE: "confirm",
  Enter: "confirm",
  NumpadEnter: "confirm",
  Space: "confirm",
  Escape: "cancel",
  Backspace: "cancel",
  Tab: "menu",
  KeyM: "menu",
  F1: "debug",
};

/** Liga o teclado ao InputManager. Devolve uma função que remove os listeners. */
export function attachKeyboard(
  input: InputManager,
  target: Window = window,
  keymap: Record<string, Action> = DEFAULT_KEYMAP,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = keymap[e.code];
    if (!action || isTyping(e)) return;
    // Evita rolar a página (setas/espaço), trocar o foco (Tab) e abrir a ajuda (F1).
    e.preventDefault();
    input.press(action);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const action = keymap[e.code];
    if (action) input.release(action);
  };
  const onBlur = () => input.releaseAll();

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", onBlur);
  };
}

/** Teclas digitadas em campos de formulário (ex.: painel de depuração) não viram ações. */
function isTyping(e: KeyboardEvent): boolean {
  const el = e.target;
  return (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")
  );
}
