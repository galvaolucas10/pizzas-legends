import type { MapObject } from "../../content/schemas/map";
import { Entity, type SpriteDef } from "./Entity";

export type NpcObject = Extract<MapObject, { kind: "npc" }>;

/** NPC do mapa: falas (talking) e rotina (behaviorLoop), executadas pelo EventSystem. */
export class Npc extends Entity {
  constructor(
    readonly def: NpcObject,
    sprite: SpriteDef,
  ) {
    super({
      id: def.id,
      x: def.x,
      y: def.y,
      direction: def.direction ?? "down",
      solid: def.solid ?? true,
      sprite,
    });
  }
}
