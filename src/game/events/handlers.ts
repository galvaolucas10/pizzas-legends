import type { Direction } from "../../content/schemas/common";
import type { GameEvent } from "../../content/schemas/events";
import type { PizzaInstance } from "../../core/types";
import type { Entity } from "../entities/Entity";
import type { Command, GameSession } from "../GameSession";
import type {
  ActiveEvent,
  BattleOutcome,
  EventContext,
  HandlerTable,
  SubRunner,
} from "./EventRunner";

/** Uma cena bloqueante nunca trava: um walk impedido por mais de 3 s é abandonado (ARCHITECTURE 11.3). */
export const BLOCKING_WALK_TIMEOUT_MS = 3000;

const DONE: ActiveEvent = { update: () => "done" };

function find(ref: string, ctx: EventContext): Entity | undefined {
  const entity = ctx.entity(ref);
  if (!entity) ctx.warn(`objeto "${ref}" não está no mapa`);
  return entity;
}

/** Espera `ms` do relógio do jogo. */
function waitFor(ms: number): ActiveEvent {
  let elapsed = 0;
  return {
    update(dt) {
      elapsed += dt;
      return elapsed >= ms ? "done" : "running";
    },
  };
}

function directionTowards(from: Entity, to: Entity): Direction {
  const dx = to.mover.tileX - from.mover.tileX;
  const dy = to.mover.tileY - from.mover.tileY;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Handlers de movimento e espera (F0-11). Diálogo e troca de mapa entram nas próximas tarefas. */
export const movementHandlers: HandlerTable = {
  walk(event, ctx) {
    const entity = find(event.who, ctx);
    if (!entity) return DONE;
    let started = false;
    let waited = 0;
    return {
      update(dt) {
        if (!started) {
          // Ocupado: espera e tenta de novo no próximo tick, como no tutorial.
          started = ctx.grid !== null && entity.mover.tryStep(event.direction, ctx.grid);
          if (!started) {
            waited += dt;
            if (ctx.mode === "blocking" && waited >= BLOCKING_WALK_TIMEOUT_MS) {
              ctx.warn(`walk de "${event.who}" para ${event.direction} bloqueado por 3 s; pulando`);
              return "done";
            }
            return "running";
          }
        }
        return entity.mover.moving ? "running" : "done";
      },
    };
  },

  stand(event, ctx) {
    const entity = find(event.who, ctx);
    if (entity && !entity.mover.moving) entity.mover.direction = event.direction;
    return waitFor(event.time);
  },

  face(event, ctx) {
    const entity = find(event.who, ctx);
    if (entity) {
      entity.mover.direction =
        event.towards === "player" ? directionTowards(entity, ctx.player) : event.towards;
    }
    return DONE;
  },

  wait(event) {
    return waitFor(event.time);
  },
};

/** Falas (F0-13): confirmar completa o texto; com o texto completo, confirmar avança. */
export const dialogueHandlers: HandlerTable = {
  message(event, ctx) {
    const { dialogue, input } = ctx;
    if (!dialogue || !input) {
      ctx.warn(`message "${event.textKey}" sem caixa de diálogo`);
      return DONE;
    }
    dialogue.show(
      ctx.text(event.textKey),
      event.speaker ? ctx.text(`${event.speaker}.name`) : undefined,
    );
    return {
      update(dt) {
        dialogue.update(dt);
        if (!input.wasPressed("confirm")) return "running";
        input.consume("confirm"); // a mesma tecla não avança a próxima fala nem reabre a conversa
        if (dialogue.typing) {
          dialogue.complete();
          return "running";
        }
        return "done";
      },
      cancel: () => dialogue.hide(),
    };
  },
};

/** Troca de mapa (F0-12). A troca cancela este roteiro; até lá, ele só espera. */
export const worldHandlers: HandlerTable = {
  changeMap(event, ctx) {
    if (!ctx.changeMap) {
      ctx.warn("changeMap sem suporte neste contexto");
      return DONE;
    }
    ctx.changeMap(event.mapId, event.entrance);
    return { update: () => "running" };
  },
};

function session(ctx: EventContext, type: string): GameSession | undefined {
  if (!ctx.session) ctx.warn(`${type} sem partida ativa`);
  return ctx.session;
}

/** Envia um comando à sessão; um erro vira aviso e o roteiro segue. */
function dispatch(ctx: EventContext, command: Command): ActiveEvent {
  const result = session(ctx, command.type)?.dispatch(command);
  if (result && !result.ok) ctx.warn(`${command.type} falhou: ${result.error.kind}`);
  return DONE;
}

/** Espera uma tela externa fechar e então roda os eventos escolhidos pelo resultado. */
function awaitThen<R>(
  open: (done: (result: R) => void) => void,
  next: (result: R) => readonly GameEvent[] | undefined,
  sub: SubRunner,
): ActiveEvent {
  let result: { value: R } | null = null;
  let follow: ActiveEvent | null = null;
  open((value) => (result = { value }));
  return {
    update(dt) {
      if (!follow) {
        if (!result) return "running";
        const events = next(result.value);
        if (!events?.length) return "done";
        follow = sub(events);
      }
      return follow.update(dt);
    },
    cancel: () => follow?.cancel?.(),
  };
}

/** A pior pizza que atende ao filtro: entregar não deve levar a melhor da mochila. */
function pickPizza(
  pizzas: readonly PizzaInstance[],
  filter: { minQuality?: number; recipeId?: string },
): PizzaInstance | undefined {
  return pizzas
    .filter(
      (p) =>
        p.slicesLeft > 0 &&
        (!filter.recipeId || p.recipeId === filter.recipeId) &&
        p.quality >= (filter.minQuality ?? 0),
    )
    .sort((a, b) => a.quality - b.quality)[0];
}

/** Progresso (F1-05): cada evento vira um comando da GameSession; `if` empilha um sub-executor. */
export const progressHandlers: HandlerTable = {
  claimReward: (event, ctx) => dispatch(ctx, { type: "claimReward", rewardId: event.rewardId }),

  setFlag: (event, ctx) =>
    dispatch(ctx, { type: "setFlag", flag: event.flag, value: event.value ?? true }),

  incrementFlag: (event, ctx) =>
    dispatch(ctx, { type: "incrementFlag", flag: event.flag, by: event.by ?? 1 }),

  advanceQuest: (event, ctx) =>
    dispatch(ctx, { type: "advanceQuest", questId: event.questId, toStep: event.toStep }),

  takeIngredients: (event, ctx) => dispatch(ctx, { type: "takeIngredients", items: event.items }),

  takePizza(event, ctx) {
    const s = session(ctx, "takePizza");
    if (!s) return DONE;
    const pizza = pickPizza(s.state.inventory.pizzas, event.filter);
    if (!pizza) {
      ctx.warn("takePizza: nenhuma pizza atende ao filtro");
      return DONE;
    }
    return dispatch(ctx, { type: "takePizza", pizzaId: pizza.id });
  },

  rest: (event, ctx) => dispatch(ctx, { type: "rest", ovenId: event.ovenId }),

  if(event, ctx, sub) {
    if (!ctx.isTrue) ctx.warn("if sem avaliador de condições; seguindo pelo else");
    const branch = ctx.isTrue?.(event.condition) ? event.then : event.else;
    return branch?.length ? sub(branch) : DONE;
  },

  autosave(_event, ctx) {
    ctx.autosave?.(); // sem SaveSystem (testes, dev), não há o que gravar
    return DONE;
  },

  openOven(event, ctx, sub) {
    const open = ctx.openOven;
    if (!open) {
      ctx.warn(`openOven "${event.ovenId}" sem tela de forno`);
      return DONE;
    }
    return awaitThen<void>(
      (done) => open(event.ovenId, () => done()),
      () => undefined,
      sub,
    );
  },

  startBattle(event, ctx, sub) {
    const start = ctx.startBattle;
    if (!start) {
      ctx.warn(`startBattle "${event.enemyId}" sem cena de batalha`);
      return DONE;
    }
    return awaitThen<BattleOutcome>(
      (done) => start({ enemyId: event.enemyId, source: event.source }, done),
      (outcome) =>
        outcome === "victory" ? event.onWin : outcome === "defeat" ? event.onLose : undefined,
      sub,
    );
  },
};
