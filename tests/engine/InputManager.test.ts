import { describe, expect, it } from "vitest";
import { InputManager } from "../../src/engine/input/InputManager";

describe("InputManager", () => {
  it("usa a direção mantida mais recente, como o DirectionInput antigo", () => {
    const input = new InputManager();
    input.press("right");
    input.press("up");
    input.poll();
    expect(input.direction).toBe("up");
    input.release("up");
    input.poll();
    expect(input.direction).toBe("right");
    input.release("right");
    input.poll();
    expect(input.direction).toBeNull();
  });

  it("wasPressed vale só no tick do pressionamento", () => {
    const input = new InputManager();
    input.press("confirm");
    input.poll();
    expect(input.wasPressed("confirm")).toBe(true);
    input.poll();
    expect(input.wasPressed("confirm")).toBe(false);
    expect(input.isHeld("confirm")).toBe(true);
  });

  it("guarda em buffer um toque que começa e termina entre dois ticks", () => {
    const input = new InputManager();
    input.press("left");
    input.release("left");
    input.poll();
    expect(input.wasPressed("left")).toBe(true);
    expect(input.direction).toBe("left"); // o toque rápido ainda dá um passo
    input.poll();
    expect(input.direction).toBeNull();
  });

  it("ignora a repetição automática do teclado", () => {
    const input = new InputManager();
    input.press("confirm");
    input.poll();
    input.press("confirm"); // keydown repetido com a tecla ainda pressionada
    input.poll();
    expect(input.wasPressed("confirm")).toBe(false);
  });

  it("releaseAll (blur / Alt+Tab) solta todas as teclas", () => {
    const input = new InputManager();
    input.press("down");
    input.poll();
    input.releaseAll(); // o keyup nunca chega quando a janela perde o foco
    input.poll();
    expect(input.direction).toBeNull();
  });

  it("só o contexto ativo lê as ações", () => {
    const input = new InputManager();
    const world = input.reader("world");
    const dialogue = input.reader("dialogue");
    input.press("down");
    input.press("confirm");
    input.poll();
    expect(world.direction).toBe("down");
    expect(dialogue.wasPressed("confirm")).toBe(false);

    input.pushContext("dialogue");
    expect(world.direction).toBeNull();
    expect(world.isHeld("down")).toBe(false);
    expect(dialogue.wasPressed("confirm")).toBe(true);

    input.popContext("dialogue");
    expect(world.direction).toBe("down");
  });

  it("nunca remove o contexto base", () => {
    const input = new InputManager();
    input.popContext("world");
    expect(input.activeContext).toBe("world");
  });
});

describe("consume", () => {
  it("esconde o pressionamento do resto do tick, só no contexto ativo", () => {
    const input = new InputManager();
    const world = input.reader("world");
    const dialogue = input.reader("dialogue");
    input.press("confirm");
    input.poll();
    dialogue.consume("confirm"); // contexto inativo: não faz nada
    expect(world.wasPressed("confirm")).toBe(true);
    world.consume("confirm");
    expect(world.wasPressed("confirm")).toBe(false);
  });
});
