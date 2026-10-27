import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RawContent } from "../../src/content/registry";

/** Lê o conteúdo de src/data direto do disco (scripts de Node, sem Vite). */
export function readContent(dataDir = join(import.meta.dirname, "../../src/data")): RawContent {
  const read = (file: string): unknown => JSON.parse(readFileSync(join(dataDir, file), "utf8"));
  const maps: Record<string, unknown> = {};
  for (const file of readdirSync(join(dataDir, "maps")).filter((f) => f.endsWith(".json"))) {
    maps[`maps/${file}`] = read(join("maps", file));
  }
  return {
    balance: read("balance.json"),
    ingredients: read("ingredients.json"),
    recipes: read("recipes.json"),
    conversions: read("conversions.json"),
    skills: read("skills.json"),
    statuses: read("statuses.json"),
    actions: read("actions.json"),
    enemies: read("enemies.json"),
    rewards: read("rewards.json"),
    quests: read("quests.json"),
    characters: read("characters.json"),
    npcs: read("npcs.json"),
    conditions: read("conditions.json"),
    locale: read("locales/pt-BR.json"),
    assets: read("assets.json"),
    maps,
  };
}
