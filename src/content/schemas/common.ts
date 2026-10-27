import { z } from "zod";

/** Direção usada no conteúdo e no save (DATA_MODELS 3.1). */
export const DirectionSchema = z.enum(["up", "down", "left", "right"]);
export type Direction = z.infer<typeof DirectionSchema>;

/** ID estável `<prefixo>.<slug>` com slug em snake_case ASCII (DATA_MODELS 1.3). */
export function idOf<P extends string>(prefix: P) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix.replace(".", "\\.")}\\.[a-z0-9]+(?:_[a-z0-9]+)*$`),
      `ID deve ter o formato "${prefix}.<slug_em_snake_case>"`,
    );
}

export const MapIdSchema = idOf("map");
export const NpcIdSchema = idOf("npc");
export const FlagIdSchema = idOf("flag");
export const QuestIdSchema = idOf("quest");
export const RewardIdSchema = idOf("rew");
export const IngredientIdSchema = idOf("ing");
export const RecipeIdSchema = idOf("rec");
export const SkillIdSchema = idOf("skill");
export const EnemyIdSchema = idOf("enemy");
export const OvenIdSchema = idOf("oven");

/** ID de asset do manifesto (ex.: `img.hero`, `ts.cozinha_mestre_lower`). */
export const AssetIdSchema = z
  .string()
  .regex(/^[a-z]+\.[a-z0-9]+(?:_[a-z0-9]+)*$/, 'AssetId deve ter o formato "<tipo>.<slug>"');

/** ID local de um objeto dentro do mapa (ex.: `vespa_1`). */
export const LocalIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "ID local deve estar em snake_case");

/** Referência a objeto no mapa atual: "player" ou um ID local. */
export const ObjectRefSchema = z.union([z.literal("player"), LocalIdSchema]);

/** Chave de texto no arquivo de idioma (ex.: `dlg.mestre_basilio.oi.1`). */
export const TextKeySchema = z.string().regex(/^[a-z0-9_.]+$/, "textKey inválida");

/** Coordenada em tiles. */
export const TileSchema = z.number().int().min(0);

export type MapId = z.infer<typeof MapIdSchema>;
export type NpcId = z.infer<typeof NpcIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
