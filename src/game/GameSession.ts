import type { ContentRegistry } from "../content/registry";
import type { Direction } from "../content/schemas/common";
import { applyBattleResult, restAtOven, type BattleState } from "../core/battle";
import { cookPizza, type PreparationError } from "../core/cooking";
import {
  convertIngredients,
  harvest,
  isChestOpen,
  type ConversionError,
  type HarvestSpot,
} from "../core/gathering";
import { addIngredients, hasIngredients } from "../core/inventory";
import {
  learnSkill,
  maxHpFor,
  skillBlocker,
  xpToNextLevel,
  type SkillError,
} from "../core/progression";

export type { SkillError };
import { questStatus } from "../core/conditions";
import {
  advanceQuest,
  currentObjective,
  objectiveProgress,
  stepProgress,
  updateQuests,
  type QuestEvent,
} from "../core/quests";
import { claimReward } from "../core/rewards";
import type { PizzaInstance, SaveData } from "../core/types";
import { Signals } from "./signals";

/** Intenções que alteram o progresso (ARCHITECTURE 8.1). */
export type Command =
  | { type: "cookPizza"; recipeId: string; ingredientIds: string[] }
  | { type: "claimReward"; rewardId: string }
  | { type: "setFlag"; flag: string; value: boolean | number }
  | { type: "incrementFlag"; flag: string; by: number }
  | { type: "takeIngredients"; items: { ingredientId: string; count: number }[] }
  | { type: "takePizza"; pizzaId: string }
  | { type: "advanceQuest"; questId: string; toStep: number }
  | { type: "applyBattleResult"; battle: BattleState; enemyGlobalId?: string }
  | { type: "rest"; ovenId: string }
  | { type: "setPosition"; mapId: string; x: number; y: number; direction: Direction }
  | { type: "learnSkill"; skillId: string }
  | { type: "convertIngredients"; conversionId: string; times: number }
  | { type: "harvest"; spot: HarvestSpot }
  | { type: "openChest"; rewardId: string }
  | { type: "setBasket"; pizzaIds: string[] }
  | { type: "addPlayTime"; ms: number };

export type CommandError =
  | PreparationError
  | SkillError
  | ConversionError
  | { kind: "alreadyTaken" }
  | { kind: "notEnoughIngredients" }
  | { kind: "pizzaNotFound"; pizzaId: string };

export type CommandResult =
  | {
      ok: true;
      pizza?: PizzaInstance;
      drops?: { ingredientId: string; count: number }[];
      xp?: number;
    }
  | { ok: false; error: CommandError };

export interface SessionSignals extends Record<string, unknown> {
  changed: SaveData;
  levelUp: { level: number; levels: number };
  itemsGained: { ingredientId: string; count: number }[];
  recipeLearned: string;
  skillLearned: string;
  questEvent: QuestEvent;
  objectiveChanged: string | null;
  /** Marca o save como "sujo": o SaveSystem decide quando gravar. */
  dirty: void;
}

/**
 * Estado da partida (ARCHITECTURE 8): o SaveData imutável + comandos transacionais + sinais.
 * É o único lugar que chama as funções do core que alteram o save.
 */
export class GameSession {
  readonly signals = new Signals<SessionSignals>();
  private current: SaveData;

  constructor(
    readonly content: ContentRegistry,
    initial: SaveData,
  ) {
    this.current = initial;
  }

  get state(): Readonly<SaveData> {
    return this.current;
  }

  get objective(): string | null {
    return currentObjective(this.current, this.content);
  }

  /** Contagem do objetivo atual (ex.: 1 de 2 ratos), se a etapa tiver contagem. */
  get objectiveProgress(): { done: number; total: number } | null {
    return objectiveProgress(this.current, this.content);
  }

  /** Contagem da etapa atual de uma missão, se houver. */
  stepProgress(questId: string): { done: number; total: number } | null {
    return stepProgress(this.current, questId, this.content);
  }

  /** PV máximo do personagem ativo (fora da batalha o PV está sempre cheio, GDD 7.6). */
  get maxHp(): number {
    return maxHpFor(this.current.characters[0]?.level ?? 1, this.content);
  }

  /** XP que falta para o próximo nível (null no nível máximo). */
  get xpToNextLevel(): number | null {
    return xpToNextLevel(this.current, this.content);
  }

  /** Status de uma missão, incluindo "disponível"/"indisponível" antes de começar. */
  questStatus(questId: string): string {
    return questStatus(this.current, questId, this.content);
  }

  /** Por que a habilidade ainda não pode ser aprendida (null = pode). */
  skillBlocker(skillId: string): SkillError | null {
    return skillBlocker(this.current, skillId, this.content);
  }

  /** Executa um comando. Se falhar, nada muda e o erro volta tipado. */
  dispatch(command: Command): CommandResult {
    const before = this.current;
    const result = this.apply(command);
    if (!result.ok || result.save === before) return result.ok ? strip(result) : result;

    const quests = updateQuests(result.save, this.content);
    this.current = quests.save;
    this.notify(before, this.current, quests.events, command);
    return strip(result);
  }

  private apply(
    command: Command,
  ): (CommandResult & { save: SaveData }) | { ok: false; error: CommandError } {
    const save = this.current;
    const c = this.content;
    switch (command.type) {
      case "cookPizza": {
        const r = cookPizza(save, command.recipeId, command.ingredientIds, c);
        if ("kind" in r) return { ok: false, error: r };
        return { ok: true, save: r.save, pizza: r.pizza };
      }
      case "claimReward":
        return { ok: true, save: claimReward(save, command.rewardId, c).save };
      case "setFlag":
        return {
          ok: true,
          save: { ...save, flags: { ...save.flags, [command.flag]: command.value } },
        };
      case "incrementFlag": {
        const value = Number(save.flags[command.flag] ?? 0) + command.by;
        return { ok: true, save: { ...save, flags: { ...save.flags, [command.flag]: value } } };
      }
      case "takeIngredients":
        if (!hasIngredients(save, command.items))
          return { ok: false, error: { kind: "notEnoughIngredients" } };
        return {
          ok: true,
          save: addIngredients(
            save,
            command.items.map((i) => ({ ...i, count: -i.count })),
            c,
          ),
        };
      case "takePizza": {
        if (!save.inventory.pizzas.some((p) => p.id === command.pizzaId)) {
          return { ok: false, error: { kind: "pizzaNotFound", pizzaId: command.pizzaId } };
        }
        const pizzas = save.inventory.pizzas.filter((p) => p.id !== command.pizzaId);
        const lastBasket = save.inventory.lastBasket.filter((id) => id !== command.pizzaId);
        return {
          ok: true,
          save: { ...save, inventory: { ...save.inventory, pizzas, lastBasket } },
        };
      }
      case "advanceQuest":
        return { ok: true, save: advanceQuest(save, command.questId, command.toStep).save };
      case "applyBattleResult": {
        const outcome = applyBattleResult(save, command.battle, c);
        let next = outcome.save;
        if (command.battle.phase === "victory" && command.enemyGlobalId) {
          next = {
            ...next,
            world: {
              ...next.world,
              defeatedEnemies: [...next.world.defeatedEnemies, command.enemyGlobalId],
            },
          };
        }
        return { ok: true, save: next, drops: outcome.drops, xp: outcome.xp };
      }
      case "rest":
        return { ok: true, save: restAtOven(save, command.ovenId, c) };
      case "setPosition":
        return {
          ok: true,
          save: {
            ...save,
            world: {
              ...save.world,
              mapId: command.mapId,
              position: { x: command.x, y: command.y, direction: command.direction },
            },
          },
        };
      case "convertIngredients": {
        const r = convertIngredients(save, command.conversionId, command.times, c);
        if ("kind" in r) return { ok: false, error: r };
        return { ok: true, save: r };
      }
      case "harvest": {
        const r = harvest(save, command.spot, c);
        if (!r) return { ok: false, error: { kind: "alreadyTaken" } };
        return { ok: true, save: r };
      }
      case "openChest":
        if (isChestOpen(save, command.rewardId))
          return { ok: false, error: { kind: "alreadyTaken" } };
        return { ok: true, save: claimReward(save, command.rewardId, c).save };
      case "learnSkill": {
        const r = learnSkill(save, command.skillId, c);
        if ("kind" in r) return { ok: false, error: r };
        return { ok: true, save: r };
      }
      case "setBasket":
        return {
          ok: true,
          save: { ...save, inventory: { ...save.inventory, lastBasket: [...command.pizzaIds] } },
        };
      case "addPlayTime":
        return {
          ok: true,
          save: {
            ...save,
            stats: { ...save.stats, playTimeMs: save.stats.playTimeMs + command.ms },
          },
        };
    }
  }

  private notify(
    before: SaveData,
    after: SaveData,
    questEvents: QuestEvent[],
    command: Command,
  ): void {
    const s = this.signals;
    if (command.type === "addPlayTime") return; // só o relógio: não é mudança de jogo
    const charBefore = before.characters[0];
    const charAfter = after.characters[0];
    if (charBefore && charAfter && charAfter.level > charBefore.level) {
      s.emit("levelUp", { level: charAfter.level, levels: charAfter.level - charBefore.level });
    }
    const gained = Object.entries(after.inventory.ingredients)
      .map(([ingredientId, n]) => ({
        ingredientId,
        count: n - (before.inventory.ingredients[ingredientId] ?? 0),
      }))
      .filter((g) => g.count > 0);
    if (gained.length && command.type !== "takeIngredients") s.emit("itemsGained", gained);
    for (const recipe of charAfter?.knownRecipes ?? []) {
      if (!charBefore?.knownRecipes.includes(recipe)) s.emit("recipeLearned", recipe);
    }
    for (const skill of charAfter?.skills ?? []) {
      if (!charBefore?.skills.includes(skill)) s.emit("skillLearned", skill);
    }
    for (const event of questEvents) s.emit("questEvent", event);
    const objBefore = currentObjective(before, this.content);
    const objAfter = currentObjective(after, this.content);
    if (objBefore !== objAfter) s.emit("objectiveChanged", objAfter);
    s.emit("changed", after);
    s.emit("dirty", undefined);
  }

  /** Substitui o save inteiro (carregar um jogo). */
  load(save: SaveData): void {
    this.current = updateQuests(save, this.content).save;
    this.signals.emit("changed", this.current);
    this.signals.emit("objectiveChanged", this.objective);
  }
}

function strip<T extends { save?: SaveData }>(result: T): Omit<T, "save"> {
  const { save: _save, ...rest } = result;
  return rest;
}
