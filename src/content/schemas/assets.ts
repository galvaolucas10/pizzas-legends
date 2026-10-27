import { z } from "zod";
import { AssetIdSchema } from "./common";

/** Manifesto de assets (ARCHITECTURE 12.1): liga cada AssetId do conteúdo a um arquivo. */

const AssetPathSchema = z
  .string()
  .regex(/^[a-z0-9_/]+\.(png|ogg|mp3|wav)$/, "caminho em snake_case relativo a public/assets");

export const AnimationDefSchema = z.strictObject({
  frames: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(1),
  frameDurationMs: z.number().int().min(1),
  loop: z.boolean(),
});
export type AnimationDef = z.infer<typeof AnimationDefSchema>;

const PointSchema = z.strictObject({ x: z.number().int(), y: z.number().int() });

export const AssetManifestSchema = z.strictObject({
  /** Conjuntos de animação reutilizáveis (ex.: `anim.character_32`, as 4 direções). */
  animationSets: z.record(AssetIdSchema, z.record(z.string(), AnimationDefSchema)),
  images: z.record(
    AssetIdSchema,
    z.strictObject({
      src: AssetPathSchema,
      frame: z.strictObject({ w: z.number().int().min(1), h: z.number().int().min(1) }).optional(),
      /** Deslocamento do desenho em relação ao canto do tile (ex.: personagem 32×32 → 8, 18). */
      origin: PointSchema.optional(),
      animations: AssetIdSchema.optional(),
    }),
  ),
  tilesets: z.record(
    AssetIdSchema,
    z.strictObject({
      src: AssetPathSchema,
      tileSize: z.literal(16),
      columns: z.number().int().min(1),
    }),
  ),
  audio: z.record(
    AssetIdSchema,
    z.strictObject({
      src: AssetPathSchema,
      kind: z.enum(["music", "sfx"]),
      loop: z.boolean().optional(),
    }),
  ),
  bundles: z.record(z.string(), z.array(AssetIdSchema)),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/** Todos os IDs do manifesto, por tipo. */
export function manifestIds(manifest: AssetManifest): Set<string> {
  return new Set([
    ...Object.keys(manifest.images),
    ...Object.keys(manifest.tilesets),
    ...Object.keys(manifest.audio),
  ]);
}
