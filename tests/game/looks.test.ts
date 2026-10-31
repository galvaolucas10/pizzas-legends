import { describe, expect, it } from "vitest";
import { APRONS, apronFor, avatarOf } from "../../src/game/looks";

describe("avatar e aventais", () => {
  it("save novo usa o avatar escolhido; save antigo vira avatar pelo personagem pronto", () => {
    expect(avatarOf({ avatar: { skin: 2, hair: 4, face: 1 } })).toEqual({
      skin: 2,
      hair: 4,
      face: 1,
    });
    expect(avatarOf({ look: 3 })).toEqual({ skin: 1, hair: 3, face: 0 });
    expect(avatarOf(undefined)).toEqual({ skin: 0, hair: 0, face: 0 });
    expect(avatarOf({ avatar: { skin: 99, hair: -1, face: 0 } })).toEqual({
      skin: 0,
      hair: 0,
      face: 0,
    });
  });

  it("cada nível tem um avental, e o último continua depois do nível máximo", () => {
    expect(apronFor(1).name).toBe("Branco");
    expect(apronFor(2).name).toBe("Azul");
    expect(apronFor(APRONS.length).name).toBe("Dourado");
    expect(apronFor(99).name).toBe("Dourado");
  });
});
