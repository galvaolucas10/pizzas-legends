import { z } from "zod";
import {
  DirectionSchema,
  EnemyIdSchema,
  FlagIdSchema,
  IngredientIdSchema,
  MapIdSchema,
  NpcIdSchema,
  ObjectRefSchema,
  OvenIdSchema,
  QuestIdSchema,
  RecipeIdSchema,
  RewardIdSchema,
  TextKeySchema,
  type Direction,
} from "./common";
import { ConditionSchema, type Condition } from "./conditions";

/** Roteiros executados pelo EventSystem (DATA_MODELS 3.12). */
export type GameEvent =
  | { type: "walk"; who: string; direction: Direction }
  | { type: "stand"; who: string; direction: Direction; time: number }
  | { type: "face"; who: string; towards: "player" | Direction }
  | { type: "wait"; time: number }
  | { type: "message"; speaker?: string; textKey: string; vars?: Record<string, string> }
  | { type: "choice"; textKey: string; options: { textKey: string; events: GameEvent[] }[] }
  | { type: "claimReward"; rewardId: string }
  | { type: "setFlag"; flag: string; value?: boolean | number }
  | { type: "incrementFlag"; flag: string; by?: number }
  | { type: "takeIngredients"; items: { ingredientId: string; count: number }[] }
  | { type: "takePizza"; filter: { minQuality?: number; recipeId?: string } }
  | { type: "advanceQuest"; questId: string; toStep: number }
  | { type: "if"; condition: Condition; then: GameEvent[]; else?: GameEvent[] }
  | {
      type: "startBattle";
      enemyId: string;
      source?: string;
      onWin?: GameEvent[];
      onLose?: GameEvent[];
    }
  | { type: "changeMap"; mapId: string; entrance: string }
  | { type: "openOven"; ovenId: string }
  | { type: "openShop" }
  | { type: "rest"; ovenId: string }
  | { type: "autosave" }
  | { type: "endDemo" };

export type GameEventType = GameEvent["type"];

const ms = z.number().int().min(0);

export const GameEventSchema: z.ZodType<GameEvent> = z.lazy(() => {
  const events = z.array(GameEventSchema);
  return z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("walk"), who: ObjectRefSchema, direction: DirectionSchema }),
    z.strictObject({
      type: z.literal("stand"),
      who: ObjectRefSchema,
      direction: DirectionSchema,
      time: ms,
    }),
    z.strictObject({
      type: z.literal("face"),
      who: ObjectRefSchema,
      towards: z.union([z.literal("player"), DirectionSchema]),
    }),
    z.strictObject({ type: z.literal("wait"), time: ms }),
    z.strictObject({
      type: z.literal("message"),
      speaker: NpcIdSchema.optional(),
      textKey: TextKeySchema,
      /** Troca {nome} no texto pelo valor (falas montadas pelo jogo, ex.: pedido online). */
      vars: z.record(z.string(), z.string()).optional(),
    }),
    z.strictObject({
      type: z.literal("choice"),
      textKey: TextKeySchema,
      options: z.array(z.strictObject({ textKey: TextKeySchema, events })).min(2),
    }),
    z.strictObject({ type: z.literal("claimReward"), rewardId: RewardIdSchema }),
    z.strictObject({
      type: z.literal("setFlag"),
      flag: FlagIdSchema,
      value: z.union([z.boolean(), z.number()]).optional(),
    }),
    z.strictObject({
      type: z.literal("incrementFlag"),
      flag: FlagIdSchema,
      by: z.number().optional(),
    }),
    z.strictObject({
      type: z.literal("takeIngredients"),
      items: z
        .array(z.strictObject({ ingredientId: IngredientIdSchema, count: z.number().int().min(1) }))
        .min(1),
    }),
    z.strictObject({
      type: z.literal("takePizza"),
      filter: z.strictObject({
        minQuality: z.number().int().optional(),
        recipeId: RecipeIdSchema.optional(),
      }),
    }),
    z.strictObject({
      type: z.literal("advanceQuest"),
      questId: QuestIdSchema,
      toStep: z.number().int().min(0),
    }),
    z.strictObject({
      type: z.literal("if"),
      condition: ConditionSchema,
      then: events,
      else: events.optional(),
    }),
    z.strictObject({
      type: z.literal("startBattle"),
      enemyId: EnemyIdSchema,
      source: ObjectRefSchema.optional(),
      onWin: events.optional(),
      onLose: events.optional(),
    }),
    z.strictObject({ type: z.literal("changeMap"), mapId: MapIdSchema, entrance: z.string() }),
    z.strictObject({ type: z.literal("openOven"), ovenId: OvenIdSchema }),
    z.strictObject({ type: z.literal("openShop") }),
    z.strictObject({ type: z.literal("rest"), ovenId: OvenIdSchema }),
    z.strictObject({ type: z.literal("autosave") }),
    z.strictObject({ type: z.literal("endDemo") }),
  ]);
});

/** Percorre uma lista de eventos, incluindo os aninhados (if, choice, startBattle). */
export function forEachEvent(events: GameEvent[], visit: (event: GameEvent) => void): void {
  for (const event of events) {
    visit(event);
    if (event.type === "if") {
      forEachEvent(event.then, visit);
      if (event.else) forEachEvent(event.else, visit);
    } else if (event.type === "choice") {
      event.options.forEach((option) => forEachEvent(option.events, visit));
    } else if (event.type === "startBattle") {
      if (event.onWin) forEachEvent(event.onWin, visit);
      if (event.onLose) forEachEvent(event.onLose, visit);
    }
  }
}
