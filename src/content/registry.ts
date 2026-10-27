import { z } from "zod";
import { AssetManifestSchema, type AssetManifest } from "./schemas/assets";
import { NamedConditionsSchema, type Condition } from "./schemas/conditions";
import { MapDefSchema, NpcSchema, type MapDef, type Npc } from "./schemas/map";
import { validateContent } from "./validate";

/** Conteúdo bruto, como lido dos arquivos JSON (chave = caminho, para as mensagens de erro). */
export interface RawContent {
  npcs: unknown;
  conditions: unknown;
  locale: unknown;
  assets: unknown;
  maps: Record<string, unknown>;
}

/** Registro imutável consultado por ID (DATA_MODELS 2.1). Cresce com as próximas fases. */
export interface ContentRegistry {
  readonly npcs: Readonly<Record<string, Npc>>;
  readonly maps: Readonly<Record<string, MapDef>>;
  readonly conditions: Readonly<Record<string, Condition>>;
  readonly locale: Readonly<Record<string, string>>;
  readonly assets: Readonly<AssetManifest>;
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Conteúdo inválido (${problems.length} problema(s)):\n- ${problems.join("\n- ")}`);
    this.name = "ContentError";
  }
}

const LocaleSchema = z.record(z.string(), z.string());

const EMPTY_MANIFEST: AssetManifest = {
  animationSets: {},
  images: {},
  tilesets: {},
  audio: {},
  bundles: {},
};

/** Valida o formato (Zod), monta o registro e confere a integridade referencial. */
export function loadContent(raw: RawContent): ContentRegistry {
  const problems: string[] = [];

  function parse<T>(schema: z.ZodType<T>, value: unknown, file: string): T | undefined {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    problems.push(`${file}:\n${z.prettifyError(result.error)}`);
    return undefined;
  }

  const npcList = parse(z.array(NpcSchema), raw.npcs, "npcs.json") ?? [];
  const conditions = parse(NamedConditionsSchema, raw.conditions, "conditions.json") ?? {};
  const locale = parse(LocaleSchema, raw.locale, "locales/pt-BR.json") ?? {};
  const assets = parse(AssetManifestSchema, raw.assets, "assets.json") ?? EMPTY_MANIFEST;

  const npcs: Record<string, Npc> = {};
  for (const npc of npcList) {
    if (npcs[npc.id]) problems.push(`npcs.json: ID repetido "${npc.id}"`);
    npcs[npc.id] = npc;
  }

  const maps: Record<string, MapDef> = {};
  for (const [file, value] of Object.entries(raw.maps)) {
    const map = parse(MapDefSchema, value, file);
    if (!map) continue;
    if (maps[map.id]) problems.push(`${file}: ID de mapa repetido "${map.id}"`);
    maps[map.id] = map;
  }

  const registry: ContentRegistry = deepFreeze({ npcs, maps, conditions, locale, assets });
  problems.push(...validateContent(registry));
  if (problems.length > 0) throw new ContentError(problems);
  return registry;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
