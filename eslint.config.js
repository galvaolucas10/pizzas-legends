import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Proíbe imports de outras camadas (ARCHITECTURE 3). */
function layer(files, forbidden) {
  return {
    files: [files],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: forbidden.map((name) => ({
            regex: `(^|/)${name}(/|$)`,
            message: `A camada "${files.split("/")[1]}" não pode importar "${name}" (ARCHITECTURE 3).`,
          })),
        },
      ],
    },
  };
}

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  { files: ["scripts/**", "*.config.*"], languageOptions: { globals: globals.node } },
  layer("src/content/**", ["core", "engine", "game", "ui", "persistence", "app"]),
  layer("src/core/**", ["engine", "game", "ui", "persistence", "app"]),
  layer("src/persistence/**", ["engine", "game", "ui", "app"]),
  layer("src/engine/**", ["core", "game", "ui", "content", "app"]),
  layer("src/game/**", ["ui", "app"]),
  layer("src/ui/**", ["engine", "core", "app"]),
  prettier,
);
