import { describe, expect, it } from "vitest";
import { ContentError, loadContent, type RawContent } from "../../src/content/registry";
import { bundledContent } from "../../src/content/sources";
import { readContent } from "../../scripts/lib/readContent";
import { checkAssetFiles } from "../../scripts/lib/checkAssetFiles";

/**
 * Conteúdo válido para estragar de propósito em cada teste: o conteúdo real do jogo,
 * com dois mapas pequenos de teste no lugar dos mapas reais.
 */
function sample(): RawContent {
  const raw = structuredClone(bundledContent());
  raw.npcs = [...(raw.npcs as unknown[]), { id: "npc.teste", sprite: "img.npc1" }];
  // Os mapas de verdade são trocados abaixo: os guias (seta no chão) apontariam para eles.
  raw.quests = (raw.quests as { steps: { guide?: unknown }[] }[]).map((q) => ({
    ...q,
    steps: q.steps.map(({ guide: _guide, ...step }) => step),
  }));
  // O salão e a avenida de verdade não estão nesta amostra.
  delete (raw.balance as { restaurant?: unknown }).restaurant;
  delete (raw.balance as { avenue?: unknown }).avenue;
  delete (raw.balance as { extraRestaurants?: unknown }).extraRestaurants;
  raw.locale = {
    ...(raw.locale as Record<string, string>),
    "npc.teste.name": "Teste",
    "map.a.name": "A",
    "map.b.name": "B",
    "dlg.oi": "Oi!",
  };
  raw.maps = {
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
  };
  return raw;
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

  it("todo arquivo do manifesto existe e todo arquivo em public/assets está no manifesto", () => {
    expect(checkAssetFiles(loadContent(bundledContent()).assets)).toEqual([]);
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

  it("asset inexistente no manifesto", () => {
    const raw = sample();
    raw.npcs = [{ id: "npc.teste", sprite: "img.fantasma" }];
    expect(problemsOf(raw).join("\n")).toContain(`imagem inexistente "img.fantasma"`);
  });

  it("arquivo de asset ausente no disco", () => {
    const manifest = loadContent(bundledContent()).assets;
    const broken = {
      ...manifest,
      images: { ...manifest.images, "img.x": { src: "images/nao_existe.png" } },
    };
    expect(checkAssetFiles(broken)).toContain(
      `assets.json: arquivo inexistente "public/assets/images/nao_existe.png"`,
    );
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
    expect([
      wall(despensa, 4, 4),
      wall(despensa, 8, 7),
      wall(despensa, 5, 10),
      wall(despensa, 12, 6),
    ]).toEqual([false, false, false, false]);
  });

  it("as portas ligam os mapas da demo como no GDD 9.1", () => {
    const { maps } = loadContent(bundledContent());
    const links = Object.values(maps).flatMap((map) =>
      map.objects.flatMap((o) =>
        o.kind === "door" ? [`${map.id} → ${o.toMap}#${o.toEntrance}`] : [],
      ),
    );
    expect(links.sort()).toEqual(
      [
        "map.cozinha_mestre → map.salao#cozinha",
        "map.cozinha_mestre → map.despensa#fundos",
        "map.despensa → map.cozinha_mestre#fundos",
        "map.salao → map.cozinha_mestre#porta",
        "map.salao → map.vila#salao",
        "map.vila → map.salao#rua",
        "map.vila → map.loja#rua",
        "map.vila → map.praca#vila",
        "map.loja → map.vila#loja",
        "map.praca → map.estufa#rua",
        "map.praca → map.vila#praca",
        "map.estufa → map.praca#estufa",
      ].sort(),
    );
  });
});
