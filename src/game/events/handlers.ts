import type { Direction } from "../../content/schemas/common";
import type { Entity } from "../entities/Entity";
import type { ActiveEvent, EventContext, HandlerTable } from "./EventRunner";

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
