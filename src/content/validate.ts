import type { ContentRegistry } from "./registry";
import { manifestIds } from "./schemas/assets";
import { forEachEvent, type GameEvent } from "./schemas/events";
import { isSolid, type MapDef } from "./schemas/map";

/**
 * Integridade referencial (DATA_MODELS 7.1): o formato já foi validado pelo Zod;
 * aqui se confere se tudo o que é citado existe. Devolve a lista de problemas.
 */
export function validateContent(content: ContentRegistry): string[] {
  const problems: string[] = [];
  const hasText = (key: string) => key in content.locale;

  const { assets } = content;
  const allAssets = manifestIds(assets);

  for (const [id, image] of Object.entries(assets.images)) {
    if (image.animations && !assets.animationSets[image.animations]) {
      problems.push(
        `assets.json: "${id}" cita o conjunto de animação inexistente "${image.animations}"`,
      );
    }
  }
  for (const [name, ids] of Object.entries(assets.bundles)) {
    for (const id of ids) {
      if (!allAssets.has(id))
        problems.push(`assets.json: pacote "${name}" cita o asset inexistente "${id}"`);
    }
  }

  for (const npc of Object.values(content.npcs)) {
    if (!hasText(`${npc.id}.name`)) problems.push(`${npc.id}: falta o texto "${npc.id}.name"`);
    if (!assets.images[npc.sprite]) problems.push(`${npc.id}: sprite inexistente "${npc.sprite}"`);
    if (npc.portrait && !assets.images[npc.portrait]) {
      problems.push(`${npc.id}: retrato inexistente "${npc.portrait}"`);
    }
  }

  for (const map of Object.values(content.maps)) {
    const where = (detail: string) => `${map.id}: ${detail}`;
    if (!hasText(`${map.id}.name`)) problems.push(where(`falta o texto "${map.id}.name"`));
    for (const tileset of map.tilesets) {
      if (!assets.tilesets[tileset.assetId])
        problems.push(where(`tileset inexistente "${tileset.assetId}"`));
    }
    if (map.music && !assets.audio[map.music])
      problems.push(where(`música inexistente "${map.music}"`));

    const localIds = new Set<string>();
    for (const object of map.objects) {
      if (localIds.has(object.id)) problems.push(where(`objeto repetido "${object.id}"`));
      localIds.add(object.id);
    }

    for (const [name, entrance] of Object.entries(map.entrances)) {
      if (!isFree(map, entrance.x, entrance.y)) {
        problems.push(where(`entrada "${name}" (${entrance.x},${entrance.y}) está numa parede`));
      }
    }

    for (const object of map.objects) {
      const at = `objeto "${object.id}" (${object.x},${object.y})`;
      if (object.x >= map.width || object.y >= map.height) {
        problems.push(where(`${at} está fora do mapa`));
      } else if (
        object.kind !== "door" &&
        object.kind !== "trigger" &&
        !isFree(map, object.x, object.y)
      ) {
        problems.push(where(`${at} está sobre uma parede`));
      }
      if (
        isSolid(object) &&
        Object.values(map.entrances).some((e) => e.x === object.x && e.y === object.y)
      ) {
        problems.push(where(`${at} é sólido e está sobre uma entrada`));
      }

      if (object.kind === "npc" && !content.npcs[object.npcId]) {
        problems.push(where(`${at} cita o NPC inexistente "${object.npcId}"`));
      }
      if (object.kind === "door") {
        const target = content.maps[object.toMap];
        if (!target) problems.push(where(`${at} leva ao mapa inexistente "${object.toMap}"`));
        else if (!target.entrances[object.toEntrance]) {
          problems.push(
            where(`${at} leva à entrada inexistente "${object.toMap}#${object.toEntrance}"`),
          );
        }
      }
      if (object.kind === "sign" && !hasText(object.textKey)) {
        problems.push(where(`${at} cita o texto inexistente "${object.textKey}"`));
      }

      for (const events of eventListsOf(object)) {
        checkEvents(events, `${at}`);
      }
    }

    function checkEvents(events: GameEvent[], origin: string): void {
      forEachEvent(events, (event) => {
        const fail = (detail: string) =>
          problems.push(where(`${origin}, evento "${event.type}": ${detail}`));
        switch (event.type) {
          case "walk":
          case "stand":
          case "face":
            if (event.who !== "player" && !localIds.has(event.who)) {
              fail(`objeto "${event.who}" não existe neste mapa`);
            }
            break;
          case "message":
            if (!hasText(event.textKey)) fail(`texto inexistente "${event.textKey}"`);
            if (event.speaker && !content.npcs[event.speaker])
              fail(`NPC inexistente "${event.speaker}"`);
            break;
          case "choice":
            for (const key of [event.textKey, ...event.options.map((o) => o.textKey)]) {
              if (!hasText(key)) fail(`texto inexistente "${key}"`);
            }
            break;
          case "changeMap": {
            const target = content.maps[event.mapId];
            if (!target) fail(`mapa inexistente "${event.mapId}"`);
            else if (!target.entrances[event.entrance])
              fail(`entrada inexistente "${event.entrance}"`);
            break;
          }
          default:
            break;
        }
      });
    }
  }

  return problems;
}

function isFree(map: MapDef, x: number, y: number): boolean {
  return map.collision[y]?.[x] === ".";
}

function eventListsOf(object: MapDef["objects"][number]): GameEvent[][] {
  switch (object.kind) {
    case "npc":
      return [...object.talking.map((t) => t.events), object.behaviorLoop ?? []];
    case "enemy":
      return [object.behaviorLoop ?? [], object.onDefeat ?? []];
    case "trigger":
      return [object.events];
    default:
      return [];
  }
}
