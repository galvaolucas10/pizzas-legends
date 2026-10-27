import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertMap, type ConvertOptions, type TiledMap } from "../../scripts/lib/tiled";
import { formatMapJson } from "../../scripts/build-maps";

const FIXTURES = join(import.meta.dirname, "../fixtures/tiled");
const read = (file: string) => JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));

const options: ConvertOptions = {
  file: "exemplo.tmj",
  loadTileset: (source) => read(source),
  loadScript: (ref) =>
    ({
      "dialogues/exemplo.json#vendedor": [
        { events: [{ type: "message", speaker: "npc.vendedor", textKey: "dlg.vendedor.oi" }] },
      ],
    })[ref],
  conditions: { loja_aberta: { flag: "flag.loja_aberta" } },
};

function example(): TiledMap {
  return read("exemplo.tmj");
}

function errorOf(map: TiledMap, opts: ConvertOptions = options): string {
  try {
    convertMap(map, opts);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("esperava erro de conversão");
}

describe("conversor do Tiled", () => {
  it("transforma o .tmj de exemplo num MapDef válido", () => {
    const map = convertMap(example(), options);
    expect(map.id).toBe("map.exemplo");
    expect([map.width, map.height]).toEqual([4, 3]);
    expect(map.tilesets).toEqual([{ assetId: "ts.exemplo", firstGid: 1, columns: 2 }]);
    expect(map.lower).toHaveLength(1);
    expect(map.upper).toHaveLength(1);
    expect(map.collision).toEqual(["####", "#..#", "#.##"]);
    expect(map.entrances).toEqual({ porta: { x: 2, y: 2, direction: "up" } });
    expect(map.objects).toEqual([
      {
        kind: "npc",
        id: "vendedor",
        x: 1,
        y: 1,
        npcId: "npc.vendedor",
        direction: "down",
        talking: [
          { events: [{ type: "message", speaker: "npc.vendedor", textKey: "dlg.vendedor.oi" }] },
        ],
        visibleIf: { flag: "flag.loja_aberta" },
      },
      { kind: "door", id: "saida", x: 1, y: 2, toMap: "map.outro", toEntrance: "porta" },
    ]);
  });

  it("recusa tile diferente de 16 px", () => {
    const map = { ...example(), tilewidth: 32, tileheight: 32 };
    expect(errorOf(map)).toContain("o jogo exige 16×16");
  });

  it("recusa tileset com tile diferente de 16 px", () => {
    const opts = { ...options, loadTileset: () => ({ ...read("exemplo.tsj"), tilewidth: 8 }) };
    expect(errorOf(example(), opts)).toContain("exigido 16×16");
  });

  it("recusa objeto fora da grade", () => {
    const map = example();
    const objects = map.layers.find((l) => l.name === "objects")!.objects!;
    objects[0]!.x = 20;
    expect(errorOf(map)).toContain('objeto "vendedor"');
    expect(errorOf(map)).toContain("fora da grade de 16 px");
  });

  it("recusa objeto fora dos limites do mapa", () => {
    const map = example();
    map.layers.find((l) => l.name === "objects")!.objects![1]!.y = 48;
    expect(errorOf(map)).toContain("fora do mapa 4×3");
  });

  it("aponta roteiro e condição inexistentes", () => {
    const opts = { ...options, loadScript: () => undefined, conditions: {} };
    const message = errorOf(example(), opts);
    expect(message).toContain('roteiro "dialogues/exemplo.json#vendedor" não encontrado');
    expect(message).toContain('condição "loja_aberta" não existe');
  });

  it("exige a camada de colisão e nomes de camada conhecidos", () => {
    const map = example();
    map.layers = map.layers.filter((l) => l.name !== "collision");
    map.layers.push({ type: "tilelayer", name: "chao", data: Array(12).fill(0) });
    const message = errorOf(map);
    expect(message).toContain('falta a camada de tiles "collision"');
    expect(message).toContain('camada de tiles "chao"');
  });

  it("gera JSON com as camadas numa linha só (diff legível)", () => {
    const json = formatMapJson(convertMap(example(), options));
    expect(json).toContain('"#..#"');
    expect(json).toMatch(/\[1, 2, 2, 1, 3, 4, 4, 3, 1, 2, 2, 1\]/);
  });
});
