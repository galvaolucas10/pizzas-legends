import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NamedConditionsSchema } from "../src/content/schemas/conditions";
import type { MapDef } from "../src/content/schemas/map";
import { convertMap, type TiledMap } from "./lib/tiled";

const ROOT = resolve(import.meta.dirname, "..");
export const MAPS_SRC = join(ROOT, "content/maps");
export const DATA_DIR = join(ROOT, "src/data");
const MAPS_OUT = join(DATA_DIR, "maps");

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** JSON legível no diff: arrays de números (camadas) ficam numa linha só. */
export function formatMapJson(value: unknown): string {
  return (
    JSON.stringify(value, null, 2).replace(
      /\[\s+(-?\d+(?:,\s+-?\d+)*)\s+\]/g,
      (_, nums: string) => `[${nums.split(/,\s+/).join(", ")}]`,
    ) + "\n"
  );
}

/** Converte content/maps/*.tmj em MapDef, sem gravar nada. Chave = nome do arquivo de saída. */
export function convertAllMaps(): Record<string, MapDef> {
  const conditions = NamedConditionsSchema.parse(readJson(join(DATA_DIR, "conditions.json")));
  const sources = existsSync(MAPS_SRC)
    ? readdirSync(MAPS_SRC).filter((f) => f.endsWith(".tmj"))
    : [];
  const result: Record<string, MapDef> = {};
  for (const file of sources) {
    const path = join(MAPS_SRC, file);
    const map = convertMap(readJson(path) as TiledMap, {
      file: `content/maps/${file}`,
      loadTileset: (source) => readJson(resolve(dirname(path), source)) as never,
      loadScript: (ref) => {
        const [scriptFile = "", key = ""] = ref.split("#");
        return (readJson(join(DATA_DIR, scriptFile)) as Record<string, unknown>)[key];
      },
      conditions,
    });
    result[`${map.id.replace(/^map./, "")}.json`] = map;
  }
  return result;
}

/** Converte content/maps/*.tmj em src/data/maps/*.json. Devolve os arquivos gerados. */
export function buildAllMaps(): string[] {
  const maps = convertAllMaps();
  mkdirSync(MAPS_OUT, { recursive: true });
  const written = Object.keys(maps);
  for (const [out, map] of Object.entries(maps))
    writeFileSync(join(MAPS_OUT, out), formatMapJson(map));

  // Remove mapas gerados cuja fonte .tmj não existe mais.
  for (const old of readdirSync(MAPS_OUT).filter((f) => f.endsWith(".json"))) {
    if (!written.includes(old)) rmSync(join(MAPS_OUT, old));
  }
  return written;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const files = buildAllMaps();
    console.log(`Mapas gerados: ${files.map((f) => basename(f)).join(", ") || "(nenhum)"}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
