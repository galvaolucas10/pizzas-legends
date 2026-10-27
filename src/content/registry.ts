import { z } from "zod";
import { AssetManifestSchema, type AssetManifest } from "./schemas/assets";
import { NamedConditionsSchema, type Condition } from "./schemas/conditions";
import {
  BalanceSchema,
  BattleActionDefSchema,
  CharacterDefSchema,
  ConversionSchema,
  EnemySchema,
  IngredientSchema,
  QuestSchema,
  RecipeSchema,
  RewardSchema,
  SkillsFileSchema,
  StatusDefSchema,
  type Balance,
  type BattleActionDef,
  type CharacterDef,
  type Conversion,
  type Enemy,
  type Ingredient,
  type Quest,
  type Recipe,
  type Reward,
  type Skill,
  type SkillBranch,
  type StatusDef,
} from "./schemas/gameplay";
import { MapDefSchema, NpcSchema, type MapDef, type Npc } from "./schemas/map";
import { validateContent } from "./validate";

/** Conteúdo bruto, como lido dos arquivos JSON (DATA_MODELS 2). */
export interface RawContent {
  balance: unknown;
  ingredients: unknown;
  recipes: unknown;
  conversions: unknown;
  skills: unknown;
  statuses: unknown;
  actions: unknown;
  enemies: unknown;
  rewards: unknown;
  quests: unknown;
  characters: unknown;
  npcs: unknown;
  conditions: unknown;
  locale: unknown;
  assets: unknown;
  /** Chave = caminho do arquivo (para as mensagens de erro). */
  maps: Record<string, unknown>;
}

type Table<T> = Readonly<Record<string, T>>;

/** Registro imutável consultado por ID (DATA_MODELS 2.1). */
export interface ContentRegistry {
  readonly balance: Readonly<Balance>;
  readonly ingredients: Table<Ingredient>;
  readonly recipes: Table<Recipe>;
  readonly conversions: Table<Conversion>;
  readonly branches: Table<SkillBranch>;
  readonly skills: Table<Skill>;
  readonly statuses: Table<StatusDef>;
  readonly actions: Table<BattleActionDef>;
  readonly enemies: Table<Enemy>;
  readonly rewards: Table<Reward>;
  readonly quests: Table<Quest>;
  readonly characters: Table<CharacterDef>;
  readonly npcs: Table<Npc>;
  readonly maps: Table<MapDef>;
  readonly conditions: Table<Condition>;
  readonly locale: Table<string>;
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

/** Valida o formato (Zod), monta o registro e confere a integridade referencial (DATA_MODELS 7.1). */
export function loadContent(raw: RawContent): ContentRegistry {
  const problems: string[] = [];

  function parse<T>(schema: z.ZodType<T>, value: unknown, file: string): T | undefined {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    problems.push(`${file}:\n${z.prettifyError(result.error)}`);
    return undefined;
  }

  /** Lista já validada → tabela por ID, acusando IDs repetidos. */
  function index<T extends { id: string }>(list: readonly T[], file: string): Record<string, T> {
    const out: Record<string, T> = {};
    for (const item of list) {
      if (out[item.id]) problems.push(`${file}: ID repetido "${item.id}"`);
      out[item.id] = item;
    }
    return out;
  }

  function table<T extends { id: string }>(schema: z.ZodType<T>, value: unknown, file: string) {
    return index(parse(z.array(schema), value, file) ?? [], file);
  }

  const skillsFile = parse(SkillsFileSchema, raw.skills, "skills.json");
  const branches = index(skillsFile?.branches ?? [], "skills.json (branches)");
  const skills: Record<string, Skill> = index(skillsFile?.skills ?? [], "skills.json (skills)");

  const maps: Record<string, MapDef> = {};
  for (const [file, value] of Object.entries(raw.maps)) {
    const map = parse(MapDefSchema, value, file);
    if (!map) continue;
    if (maps[map.id]) problems.push(`${file}: ID de mapa repetido "${map.id}"`);
    maps[map.id] = map;
  }

  const registry: ContentRegistry = deepFreeze({
    balance: parse(BalanceSchema, raw.balance, "balance.json") ?? FALLBACK_BALANCE,
    ingredients: table(IngredientSchema, raw.ingredients, "ingredients.json"),
    recipes: table(RecipeSchema, raw.recipes, "recipes.json"),
    conversions: table(ConversionSchema, raw.conversions, "conversions.json"),
    branches,
    skills,
    statuses: table(StatusDefSchema, raw.statuses, "statuses.json"),
    actions: table(BattleActionDefSchema, raw.actions, "actions.json"),
    enemies: table(EnemySchema, raw.enemies, "enemies.json"),
    rewards: table(RewardSchema, raw.rewards, "rewards.json"),
    quests: table(QuestSchema, raw.quests, "quests.json"),
    characters: table(CharacterDefSchema, raw.characters, "characters.json"),
    npcs: table(NpcSchema, raw.npcs, "npcs.json"),
    maps,
    conditions: parse(NamedConditionsSchema, raw.conditions, "conditions.json") ?? {},
    locale: parse(LocaleSchema, raw.locale, "locales/pt-BR.json") ?? {},
    assets: parse(AssetManifestSchema, raw.assets, "assets.json") ?? EMPTY_MANIFEST,
  });

  // A integridade só faz sentido sobre um formato válido: evita uma cascata de erros repetidos.
  if (problems.length === 0) problems.push(...validateContent(registry));
  if (problems.length > 0) throw new ContentError(problems);
  return registry;
}

/** Usado só quando balance.json é inválido (o erro de formato já foi registrado). */
const FALLBACK_BALANCE = {} as Balance;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
