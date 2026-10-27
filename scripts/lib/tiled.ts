import { z } from "zod";
import type { Condition } from "../../src/content/schemas/conditions";
import { MapDefSchema, type MapDef } from "../../src/content/schemas/map";

/**
 * Conversor Tiled (.tmj/.tsj) → MapDef (ARCHITECTURE 17.1, ADR-007).
 * Função pura: quem chama fornece a leitura de tilesets e roteiros, o que facilita os testes.
 */

export const TILE_SIZE = 16;

/** Bits de espelhamento/rotação do Tiled (não suportados nos mapas do jogo). */
const FLIP_FLAGS = 0xe0000000;

interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}

interface TiledObject {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  gid?: number;
  properties?: TiledProperty[];
}

interface TiledLayer {
  type: string;
  name: string;
  data?: number[] | string;
  encoding?: string;
  compression?: string;
  objects?: TiledObject[];
}

interface TiledTileset {
  firstgid?: number;
  source?: string;
  tilewidth?: number;
  tileheight?: number;
  columns?: number;
  properties?: TiledProperty[];
  name?: string;
}

export interface TiledMap {
  type?: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  orientation?: string;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
}

export interface ConvertOptions {
  /** Nome do arquivo, para as mensagens de erro. */
  file: string;
  /** Lê um tileset externo (`source`, relativo ao .tmj). */
  loadTileset(source: string): TiledTileset;
  /** Resolve `dialogues/<arquivo>.json#<chave>` (relativo a src/data). */
  loadScript(ref: string): unknown;
  /** Condições nomeadas de src/data/conditions.json. */
  conditions: Record<string, Condition>;
}

export class TiledError extends Error {
  constructor(file: string, problems: string[]) {
    super(`${file}:\n- ${problems.join("\n- ")}`);
    this.name = "TiledError";
  }
}

function props(list: TiledProperty[] | undefined): Record<string, unknown> {
  return Object.fromEntries((list ?? []).map((p) => [p.name, p.value]));
}

/** Propriedades com tratamento especial; as demais viram campos do objeto. */
const SPECIAL_PROPS = new Set(["script", "behaviorLoop", "visibleIf"]);

export function convertMap(tmj: TiledMap, options: ConvertOptions): MapDef {
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);

  if (tmj.orientation && tmj.orientation !== "orthogonal") fail("o mapa deve ser ortogonal");
  if (tmj.infinite) fail("mapas infinitos não são suportados");
  if (tmj.tilewidth !== TILE_SIZE || tmj.tileheight !== TILE_SIZE) {
    fail(`tile de ${tmj.tilewidth}×${tmj.tileheight} px; o jogo exige ${TILE_SIZE}×${TILE_SIZE}`);
  }

  const mapProps = props(tmj.properties);
  const { width, height } = tmj;

  // Tilesets
  const tilesets: MapDef["tilesets"] = [];
  for (const ref of tmj.tilesets) {
    const tileset = ref.source
      ? { ...options.loadTileset(ref.source), firstgid: ref.firstgid }
      : ref;
    const label = ref.source ?? tileset.name ?? "tileset embutido";
    if (tileset.tilewidth !== TILE_SIZE || tileset.tileheight !== TILE_SIZE) {
      fail(
        `tileset "${label}": tile de ${tileset.tilewidth}×${tileset.tileheight} px; exigido ${TILE_SIZE}×${TILE_SIZE}`,
      );
    }
    const assetId = props(tileset.properties).assetId;
    if (typeof assetId !== "string") fail(`tileset "${label}": falta a propriedade "assetId"`);
    tilesets.push({
      assetId: String(assetId),
      firstGid: tileset.firstgid ?? 1,
      columns: tileset.columns ?? 0,
    });
  }

  // Camadas
  const lower: number[][] = [];
  const upper: number[][] = [];
  let collision: string[] | null = null;
  const entrances: MapDef["entrances"] = {};
  const objects: unknown[] = [];

  const toTile = (object: TiledObject, layer: string): { x: number; y: number } | null => {
    const label = `objeto "${object.name || object.id}" (camada ${layer})`;
    if (object.gid) {
      fail(`${label}: objetos de tile não são suportados; use retângulo ou ponto`);
      return null;
    }
    const isPoint = object.point || (!object.width && !object.height);
    if (!isPoint && (object.width !== TILE_SIZE || object.height !== TILE_SIZE)) {
      fail(
        `${label}: retângulo de ${object.width}×${object.height} px; use ${TILE_SIZE}×${TILE_SIZE}`,
      );
      return null;
    }
    if (object.x % TILE_SIZE !== 0 || object.y % TILE_SIZE !== 0) {
      fail(
        `${label}: posição (${object.x}, ${object.y}) fora da grade de ${TILE_SIZE} px (ative "Snap to Grid")`,
      );
      return null;
    }
    const x = object.x / TILE_SIZE;
    const y = object.y / TILE_SIZE;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      fail(`${label}: tile (${x},${y}) fora do mapa ${width}×${height}`);
      return null;
    }
    return { x, y };
  };

  for (const layer of tmj.layers) {
    if (layer.type === "tilelayer") {
      const data = tileData(layer, width * height, fail);
      if (!data) continue;
      if (layer.name === "collision") collision = toCollision(data, width);
      else if (layer.name.startsWith("ground")) lower.push(data);
      else if (layer.name.startsWith("over")) upper.push(data);
      else
        fail(
          `camada de tiles "${layer.name}": use o prefixo "ground", "over" ou o nome "collision"`,
        );
    } else if (layer.type === "objectgroup" && layer.name === "entrances") {
      for (const object of layer.objects ?? []) {
        const tile = toTile(object, layer.name);
        if (!tile) continue;
        if (!object.name) fail(`entrada sem nome em (${tile.x},${tile.y})`);
        entrances[object.name] = {
          ...tile,
          direction: props(object.properties).direction as "down",
        };
      }
    } else if (layer.type === "objectgroup" && layer.name === "objects") {
      for (const object of layer.objects ?? []) {
        const tile = toTile(object, layer.name);
        if (!tile) continue;
        const kind = object.class || object.type;
        if (!kind) fail(`objeto "${object.name}": defina a classe (npc, door, chest...)`);
        objects.push(convertObject(object, String(kind), tile, options, fail));
      }
    } else {
      fail(`camada "${layer.name}" (${layer.type}) não é reconhecida`);
    }
  }

  if (!collision) fail('falta a camada de tiles "collision"');

  const draft = {
    id: mapProps.id,
    width,
    height,
    tilesets,
    lower,
    upper,
    collision: collision ?? [],
    ...(mapProps.music !== undefined ? { music: mapProps.music } : {}),
    entrances,
    objects,
  };

  if (problems.length === 0) {
    const result = MapDefSchema.safeParse(draft);
    if (result.success) return result.data;
    problems.push(z.prettifyError(result.error));
  }
  throw new TiledError(options.file, problems);
}

function tileData(layer: TiledLayer, cells: number, fail: (m: string) => void): number[] | null {
  if (layer.encoding && layer.encoding !== "csv") {
    fail(`camada "${layer.name}": use o formato de camada CSV (sem base64/compressão)`);
    return null;
  }
  if (!Array.isArray(layer.data) || layer.data.length !== cells) {
    fail(`camada "${layer.name}": esperado ${cells} tiles`);
    return null;
  }
  if (layer.data.some((gid) => (gid & FLIP_FLAGS) !== 0)) {
    fail(`camada "${layer.name}": tiles espelhados/rotacionados não são suportados`);
    return null;
  }
  return layer.data;
}

function toCollision(data: number[], width: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < data.length; i += width) {
    rows.push(
      data
        .slice(i, i + width)
        .map((gid) => (gid === 0 ? "." : "#"))
        .join(""),
    );
  }
  return rows;
}

function convertObject(
  object: TiledObject,
  kind: string,
  tile: { x: number; y: number },
  options: ConvertOptions,
  fail: (m: string) => void,
): Record<string, unknown> {
  const all = props(object.properties);
  const fields = Object.fromEntries(
    Object.entries(all).filter(([name]) => !SPECIAL_PROPS.has(name)),
  );
  const result: Record<string, unknown> = { kind, id: object.name, ...tile, ...fields };

  const script = all.script;
  if (script !== undefined) {
    const value = resolveScript(String(script), options, fail);
    if (kind === "npc") result.talking = value;
    else if (kind === "trigger") result.events = value;
    else fail(`objeto "${object.name}": "script" só vale para npc e trigger`);
  } else if (kind === "npc") {
    result.talking = [];
  }

  if (all.behaviorLoop !== undefined) {
    result.behaviorLoop = resolveScript(String(all.behaviorLoop), options, fail);
  }

  if (all.visibleIf !== undefined) {
    const condition = options.conditions[String(all.visibleIf)];
    if (!condition)
      fail(`objeto "${object.name}": condição "${all.visibleIf}" não existe em conditions.json`);
    result.visibleIf = condition;
  }
  return result;
}

function resolveScript(ref: string, options: ConvertOptions, fail: (m: string) => void): unknown {
  if (!/^dialogues\/[a-z0-9_]+\.json#[a-z0-9_]+$/.test(ref)) {
    fail(`roteiro "${ref}": use o formato "dialogues/<arquivo>.json#<chave>"`);
    return [];
  }
  try {
    const value = options.loadScript(ref);
    if (value === undefined) fail(`roteiro "${ref}" não encontrado`);
    return value ?? [];
  } catch (error) {
    fail(`roteiro "${ref}": ${(error as Error).message}`);
    return [];
  }
}
