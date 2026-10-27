import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AssetManifest } from "../../src/content/schemas/assets";

export const PUBLIC_ASSETS = join(import.meta.dirname, "../../public/assets");

/** Confere o manifesto contra o disco: todo arquivo citado existe e todo arquivo está no manifesto. */
export function checkAssetFiles(manifest: AssetManifest, dir = PUBLIC_ASSETS): string[] {
  const problems: string[] = [];
  const cited = new Set(
    [manifest.images, manifest.tilesets, manifest.audio].flatMap((group) =>
      Object.values(group).map((asset) => asset.src),
    ),
  );
  for (const src of cited) {
    if (!existsSync(join(dir, src)))
      problems.push(`assets.json: arquivo inexistente "public/assets/${src}"`);
  }
  for (const file of listFiles(dir)) {
    if (!cited.has(file))
      problems.push(`public/assets/${file} não está no manifesto (assets.json)`);
  }
  return problems;
}

function listFiles(dir: string, root = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? listFiles(path, root)
      : [relative(root, path).replaceAll("\\", "/")];
  });
}
