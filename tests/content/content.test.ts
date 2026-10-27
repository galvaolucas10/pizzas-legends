import { describe, expect, it } from "vitest";
import { ContentError, loadContent, type RawContent } from "../../src/content/registry";
import { bundledContent } from "../../src/content/sources";
import { readContent } from "../../scripts/lib/readContent";

/** Conteúdo mínimo válido, para estragar de propósito em cada teste. */
function sample(): RawContent {
  return {
    npcs: [{ id: "npc.teste", sprite: "img.npc1" }],
    conditions: {},
    locale: {
      "npc.teste.name": "Teste",
      "map.a.name": "A",
      "map.b.name": "B",
      "dlg.oi": "Oi!",
    },
    maps: {
      "maps/a.json": {
        id: "map.a",
        width: 3,
        height: 3,
        tilesets: [],
        lower: [],
        upper: [],
        collision: ["###", "#..", "###"],
        entrances: { porta: { x: 1, y: 1, direction: "right" } },
        objects: [
          {
            kind: "npc",
            id: "teste",
            x: 2,
            y: 1,
            npcId: "npc.teste",
            talking: [{ events: [{ type: "message", textKey: "dlg.oi" }] }],
          },
        ],
      },
      "maps/b.json": {
        id: "map.b",
        width: 2,
        height: 1,
        tilesets: [],
        lower: [],
        upper: [],
        collision: [".."],
        entrances: { porta: { x: 0, y: 0, direction: "down" } },
        objects: [{ kind: "door", id: "saida", x: 1, y: 0, toMap: "map.a", toEntrance: "porta" }],
      },
    },
  };
}

function problemsOf(raw: RawContent): string[] {
  try {
    loadContent(raw);
    return [];
  } catch (error) {
    if (error instanceof ContentError) return error.problems;
    throw error;
  }
}

describe("conteúdo do jogo", () => {
  it("o conteúdo empacotado (src/data) é válido", () => {
    expect(problemsOf(bundledContent())).toEqual([]);
  });

  it("o leitor de disco (npm run validate) vê o mesmo conteúdo", () => {
    expect(readContent()).toEqual(bundledContent());
  });

  it("o exemplo mínimo é válido", () => {
    expect(problemsOf(sample())).toEqual([]);
  });
});

describe("conteúdo inválido de propósito gera erro claro", () => {
  it("ID sem o prefixo correto", () => {
    const raw = sample();
    raw.npcs = [{ id: "teste", sprite: "img.npc1" }];
    expect(problemsOf(raw).join("\n")).toMatch(/npcs\.json[\s\S]*npc\.<slug_em_snake_case>/);
  });

  it("colisão com tamanho diferente do mapa", () => {
    const raw = sample();
    (raw.maps["maps/a.json"] as { collision: string[] }).collision = ["###", "#.."];
    expect(problemsOf(raw).join("\n")).toMatch(/maps\/a\.json[\s\S]*2 linhas; esperado 3/);
  });

  it("evento de tipo desconhecido", () => {
    const raw = sample();
    const map = raw.maps["maps/a.json"] as { objects: { talking: unknown[] }[] };
    map.objects[0]!.talking = [{ events: [{ type: "dançar" }] }];
    expect(problemsOf(raw).join("\n")).toMatch(/maps\/a\.json/);
  });

  it("referências quebradas: NPC, texto, porta e objeto sobre parede", () => {
    const raw = sample();
    raw.npcs = [];
    raw.locale = { "map.a.name": "A", "map.b.name": "B" };
    const b = raw.maps["maps/b.json"] as { objects: { toEntrance: string }[] };
    b.objects[0]!.toEntrance = "janela";
    const a = raw.maps["maps/a.json"] as { objects: { y: number }[] };
    a.objects[0]!.y = 0;
    const text = problemsOf(raw).join("\n");
    expect(text).toContain('NPC inexistente "npc.teste"');
    expect(text).toContain('texto inexistente "dlg.oi"');
    expect(text).toContain('entrada inexistente "map.a#janela"');
    expect(text).toContain('objeto "teste" (2,0) está sobre uma parede');
  });

  it("evento que cita objeto que não existe no mapa", () => {
    const raw = sample();
    const map = raw.maps["maps/a.json"] as { objects: { behaviorLoop?: unknown[] }[] };
    map.objects[0]!.behaviorLoop = [{ type: "walk", who: "fantasma", direction: "up" }];
    expect(problemsOf(raw).join("\n")).toContain('objeto "fantasma" não existe neste mapa');
  });
});

describe("mapas da demo (F0-08)", () => {
  it("os JSON gerados estão iguais à conversão atual dos .tmj", async () => {
    const { convertAllMaps } = await import("../../scripts/build-maps");
    const maps = bundledContent().maps;
    for (const [file, map] of Object.entries(convertAllMaps())) {
      expect(maps[`maps/${file}`], `rode npm run build:maps (${file})`).toEqual(map);
    }
  });

  it("colisão correta nos pontos-chave", () => {
    const { maps } = loadContent(bundledContent());
    const cozinha = maps["map.cozinha_mestre"]!;
    const despensa = maps["map.despensa"]!;
    const wall = (map: typeof cozinha, x: number, y: number) => map.collision[y]![x] === "#";

    // Cozinha: mesa 2×2, estante, parede de cima e a passagem da porta.
    expect([
      wall(cozinha, 7, 6),
      wall(cozinha, 8, 7),
      wall(cozinha, 3, 4),
      wall(cozinha, 5, 3),
    ]).toEqual([true, true, true, true]);
    expect([wall(cozinha, 5, 6), wall(cozinha, 7, 4), wall(cozinha, 5, 10)]).toEqual([
      false,
      false,
      false,
    ]);

    // Despensa: fogões, bancadas, caixas e a porta.
    expect([
      wall(despensa, 6, 4),
      wall(despensa, 6, 7),
      wall(despensa, 1, 9),
      wall(despensa, 9, 9),
    ]).toEqual([true, true, true, true]);
    expect([wall(despensa, 4, 4), wall(despensa, 8, 7), wall(despensa, 5, 10)]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("portas ligam a cozinha e a despensa nos dois sentidos", () => {
    const { maps } = loadContent(bundledContent());
    const door = (id: string) => maps[id]!.objects.find((o) => o.kind === "door");
    expect(door("map.cozinha_mestre")).toMatchObject({
      toMap: "map.despensa",
      toEntrance: "porta",
    });
    expect(door("map.despensa")).toMatchObject({
      toMap: "map.cozinha_mestre",
      toEntrance: "porta",
    });
  });
});
