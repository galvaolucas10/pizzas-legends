import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const doc = readFileSync(join(ROOT, "docs/ASSETS_AND_LICENSES.md"), "utf8");

function files(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path, root)
      : [relative(root, path).replaceAll("\\", "/")];
  });
}

describe("ASSETS_AND_LICENSES.md (F0-15)", () => {
  it("lista todo arquivo de public/assets", () => {
    const base = join(ROOT, "public/assets");
    const missing = files(base).filter((file) => !doc.includes(`\`${file}\``));
    expect(missing).toEqual([]);
  });

  it("lista toda imagem de content/tilesets", () => {
    const base = join(ROOT, "content/tilesets");
    const missing = files(base)
      .filter((file) => file.endsWith(".png"))
      .filter((file) => !doc.includes(`\`tilesets/${file}\``));
    expect(missing).toEqual([]);
  });
});
