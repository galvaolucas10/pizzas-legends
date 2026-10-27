import { z } from "zod";
import {
  AssetIdSchema,
  DirectionSchema,
  EnemyIdSchema,
  IngredientIdSchema,
  LocalIdSchema,
  MapIdSchema,
  NpcIdSchema,
  OvenIdSchema,
  RewardIdSchema,
  TextKeySchema,
  TileSchema,
} from "./common";
import { ConditionSchema } from "./conditions";
import { GameEventSchema } from "./events";

/** NPC (DATA_MODELS 3.13). Textos ficam no arquivo de idioma (`<id>.name`). */
export const NpcSchema = z.strictObject({
  id: NpcIdSchema,
  sprite: AssetIdSchema,
  portrait: AssetIdSchema.optional(),
});
export type Npc = z.infer<typeof NpcSchema>;

export const TalkingSchema = z.strictObject({
  condition: ConditionSchema.optional(),
  events: z.array(GameEventSchema).min(1),
});
export type Talking = z.infer<typeof TalkingSchema>;

const base = {
  id: LocalIdSchema,
  x: TileSchema,
  y: TileSchema,
  direction: DirectionSchema.optional(),
  visibleIf: ConditionSchema.optional(),
  solid: z.boolean().optional(),
};

export const MapObjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("npc"),
    npcId: NpcIdSchema,
    talking: z.array(TalkingSchema),
    behaviorLoop: z.array(GameEventSchema).optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("enemy"),
    enemyId: EnemyIdSchema,
    respawn: z.enum(["rest", "never"]),
    behaviorLoop: z.array(GameEventSchema).optional(),
    onDefeat: z.array(GameEventSchema).optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("oven"),
    ovenId: OvenIdSchema,
    /** Desenha um forno de tijolos (para mapas cuja arte não tem forno). */
    draw: z.boolean().optional(),
  }),
  z.strictObject({ ...base, kind: z.literal("chest"), rewardId: RewardIdSchema }),
  z.strictObject({
    ...base,
    kind: z.literal("harvest"),
    ingredientId: IngredientIdSchema,
    count: z.number().int().min(1),
    renew: z.enum(["rest", "never"]),
    rewardId: RewardIdSchema.optional(),
  }),
  z.strictObject({ ...base, kind: z.literal("sign"), textKey: TextKeySchema }),
  z.strictObject({
    ...base,
    kind: z.literal("door"),
    toMap: MapIdSchema,
    toEntrance: z.string().min(1),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("trigger"),
    once: z.boolean(),
    events: z.array(GameEventSchema).min(1),
  }),
]);
export type MapObject = z.infer<typeof MapObjectSchema>;
export type MapObjectKind = MapObject["kind"];

/** Tipos sólidos por padrão (DATA_MODELS 3.14). */
export const SOLID_BY_DEFAULT: ReadonlySet<MapObjectKind> = new Set([
  "npc",
  "enemy",
  "oven",
  "chest",
  "sign",
]);

export function isSolid(object: MapObject): boolean {
  return object.solid ?? SOLID_BY_DEFAULT.has(object.kind);
}

export const EntranceSchema = z.strictObject({
  x: TileSchema,
  y: TileSchema,
  direction: DirectionSchema,
});

/** Mapa gerado pelo conversor do Tiled (DATA_MODELS 3.14). */
export const MapDefSchema = z
  .strictObject({
    id: MapIdSchema,
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    tilesets: z.array(
      z.strictObject({
        assetId: AssetIdSchema,
        firstGid: z.number().int().min(1),
        columns: z.number().int().min(1),
      }),
    ),
    lower: z.array(z.array(z.number().int().min(0))),
    upper: z.array(z.array(z.number().int().min(0))),
    collision: z.array(z.string().regex(/^[#.]*$/, 'colisão usa só "#" e "."')),
    music: AssetIdSchema.optional(),
    entrances: z.record(z.string(), EntranceSchema),
    objects: z.array(MapObjectSchema),
  })
  .superRefine((map, ctx) => {
    const cells = map.width * map.height;
    if (map.collision.length !== map.height) {
      ctx.addIssue({
        code: "custom",
        path: ["collision"],
        message: `colisão tem ${map.collision.length} linhas; esperado ${map.height}`,
      });
    }
    map.collision.forEach((row, y) => {
      if (row.length !== map.width) {
        ctx.addIssue({
          code: "custom",
          path: ["collision", y],
          message: `linha ${y} tem ${row.length} colunas; esperado ${map.width}`,
        });
      }
    });
    for (const key of ["lower", "upper"] as const) {
      map[key].forEach((layer, i) => {
        if (layer.length !== cells) {
          ctx.addIssue({
            code: "custom",
            path: [key, i],
            message: `camada tem ${layer.length} tiles; esperado ${cells} (${map.width}×${map.height})`,
          });
        }
      });
    }
  });
export type MapDef = z.infer<typeof MapDefSchema>;
