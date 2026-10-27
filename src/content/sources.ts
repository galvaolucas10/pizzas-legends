import type { RawContent } from "./registry";
import actions from "../data/actions.json";
import balance from "../data/balance.json";
import characters from "../data/characters.json";
import conversions from "../data/conversions.json";
import enemies from "../data/enemies.json";
import ingredients from "../data/ingredients.json";
import npcs from "../data/npcs.json";
import quests from "../data/quests.json";
import recipes from "../data/recipes.json";
import rewards from "../data/rewards.json";
import skills from "../data/skills.json";
import statuses from "../data/statuses.json";
import conditions from "../data/conditions.json";
import locale from "../data/locales/pt-BR.json";
import assets from "../data/assets.json";

/** Conteúdo empacotado pelo Vite (navegador e testes). Scripts de Node usam scripts/lib/readContent.ts. */
export function bundledContent(): RawContent {
  const modules = import.meta.glob<{ default: unknown }>("../data/maps/*.json", { eager: true });
  const maps: Record<string, unknown> = {};
  for (const [path, module] of Object.entries(modules)) {
    maps[path.replace("../data/", "")] = module.default;
  }
  return {
    balance,
    ingredients,
    recipes,
    conversions,
    skills,
    statuses,
    actions,
    enemies,
    rewards,
    quests,
    characters,
    npcs,
    conditions,
    locale,
    assets,
    maps,
  };
}
