import { describe, expect, it } from "vitest";
import { utils } from "../src/utils";

describe("utils", () => {
  it("converte tiles em pixels", () => {
    expect(utils.withGrid(3)).toBe(48);
    expect(utils.asGridCoord(7, 6)).toBe("112,96");
  });

  it("calcula a posição vizinha em cada direção", () => {
    expect(utils.nextPosition(32, 32, "up")).toEqual({ x: 32, y: 16 });
    expect(utils.nextPosition(32, 32, "down")).toEqual({ x: 32, y: 48 });
    expect(utils.nextPosition(32, 32, "left")).toEqual({ x: 16, y: 32 });
    expect(utils.nextPosition(32, 32, "right")).toEqual({ x: 48, y: 32 });
  });
});
