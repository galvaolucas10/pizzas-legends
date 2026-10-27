import type { RawContent } from "./registry";
import npcs from "../data/npcs.json";
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
  return { npcs, conditions, locale, assets, maps };
}
