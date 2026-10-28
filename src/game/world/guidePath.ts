import { isSolid, type MapDef } from "../../content/schemas/map";
import type { Point } from "../../engine/Camera";

/** Para onde a seta no chão aponta: um mapa e os objetos-alvo nele (a seta vai ao mais próximo). */
export interface GuideTarget {
  mapId: string;
  targets: readonly string[];
}

const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Primeira porta do mapa atual no caminho mais curto (em número de portas) até o mapa-alvo.
 * Null se o alvo é o próprio mapa ou não há caminho.
 */
export function firstDoorTowards(
  maps: Readonly<Record<string, MapDef>>,
  fromMapId: string,
  toMapId: string,
): Point | null {
  if (fromMapId === toMapId) return null;
  const firstDoor = new Map<string, Point>([[fromMapId, { x: -1, y: -1 }]]);
  const queue = [fromMapId];
  while (queue.length) {
    const mapId = queue.shift()!;
    for (const object of maps[mapId]?.objects ?? []) {
      if (object.kind !== "door" || firstDoor.has(object.toMap)) continue;
      const door = mapId === fromMapId ? { x: object.x, y: object.y } : firstDoor.get(mapId)!;
      if (object.toMap === toMapId) return door;
      firstDoor.set(object.toMap, door);
      queue.push(object.toMap);
    }
  }
  return null;
}

/**
 * Caminho em tiles (sem o tile inicial) do jogador até o objetivo: ficar ao lado de um alvo
 * ou pisar na porta certa. Só paredes e objetos fixos bloqueiam (NPCs andam e saem da frente);
 * outras portas são evitadas para a seta não levar a um mapa errado.
 */
export function guidePath(
  map: MapDef,
  maps: Readonly<Record<string, MapDef>>,
  from: Point,
  guide: GuideTarget,
  /**
   * Posição atual de entidades que se movem (NPCs, inimigos), por id; uma lista quando o alvo
   * é um grupo (ex.: @clientes). null = sumiu; undefined = usar a posição do objeto no mapa.
   */
  livePosition: (id: string) => Point | Point[] | null | undefined,
): Point[] | null {
  const doors = map.objects.filter((o) => o.kind === "door");
  const blocked = new Set<string>();
  for (const o of map.objects) if (isSolid(o)) blocked.add(key(o.x, o.y));
  const wall = (x: number, y: number) =>
    x < 0 || y < 0 || x >= map.width || y >= map.height || map.collision[y]?.[x] !== ".";

  const goals = new Set<string>();
  if (map.id === guide.mapId) {
    for (const id of guide.targets) {
      const live = livePosition(id);
      // Entidade do alvo sumida (ex.: inimigo já vencido) não é alvo.
      if (live === null) continue;
      if (Array.isArray(live)) {
        for (const at of live) for (const s of STEPS) goals.add(key(at.x + s.x, at.y + s.y));
        continue;
      }
      const object = map.objects.find((o) => o.id === id);
      const at = live ?? (object ? { x: object.x, y: object.y } : undefined);
      if (!at) continue;
      for (const s of STEPS) goals.add(key(at.x + s.x, at.y + s.y));
    }
  } else {
    const door = firstDoorTowards(maps, map.id, guide.mapId);
    if (door) goals.add(key(door.x, door.y));
  }
  if (goals.size === 0 || goals.has(key(from.x, from.y))) return null;

  const avoid = new Set(doors.map((d) => key(d.x, d.y)).filter((k) => !goals.has(k)));
  const previous = new Map<string, string | null>([[key(from.x, from.y), null]]);
  const queue: Point[] = [from];
  while (queue.length) {
    const at = queue.shift()!;
    const atKey = key(at.x, at.y);
    if (goals.has(atKey)) {
      const path: Point[] = [];
      for (let k: string | null = atKey; k && k !== key(from.x, from.y); k = previous.get(k)!) {
        const [x, y] = k.split(",").map(Number);
        path.unshift({ x: x!, y: y! });
      }
      return path;
    }
    for (const s of STEPS) {
      const x = at.x + s.x;
      const y = at.y + s.y;
      const k = key(x, y);
      if (previous.has(k) || wall(x, y) || blocked.has(k) || avoid.has(k)) continue;
      previous.set(k, atKey);
      queue.push({ x, y });
    }
  }
  return null;
}

/** Setas no chão ao longo do caminho, com um brilho que corre na direção a seguir. */
export function drawGuideArrows(
  ctx: CanvasRenderingContext2D,
  path: readonly Point[],
  from: Point,
  tile: number,
  camera: Point,
  timeMs: number,
): void {
  const shown = path.slice(0, 14);
  shown.forEach((at, i) => {
    const next = shown[i + 1] ?? at;
    const prev = i === 0 ? from : shown[i - 1]!;
    // Direção: para o próximo tile (no último, a mesma do passo que chegou nele).
    const dx = next === at ? at.x - prev.x : next.x - at.x;
    const dy = next === at ? at.y - prev.y : next.y - at.y;
    const cx = at.x * tile + tile / 2 - camera.x;
    const cy = at.y * tile + tile / 2 - camera.y;
    const wave = (Math.sin(timeMs / 180 - i * 0.9) + 1) / 2;
    const fade = 1 - (i / shown.length) * 0.5;
    ctx.save();
    ctx.globalAlpha = (0.7 + wave * 0.3) * fade;
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, -5);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-3, 5);
    ctx.closePath();
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "#5a3a10";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

export type StepDirection = "up" | "down" | "left" | "right";

const DIRECTION_OF: Record<string, StepDirection> = {
  "1,0": "right",
  "-1,0": "left",
  "0,1": "down",
  "0,-1": "up",
};

/**
 * Passos (direções) do caminho mais curto de `from` até um tile em que `isGoal` vale,
 * andando só por tiles em que `passable` vale. Null se não houver caminho.
 */
export function findRoute(
  from: Point,
  isGoal: (x: number, y: number) => boolean,
  passable: (x: number, y: number) => boolean,
  maxTiles = 4000,
): StepDirection[] | null {
  if (isGoal(from.x, from.y)) return [];
  const previous = new Map<string, string>([[key(from.x, from.y), ""]]);
  const queue: Point[] = [from];
  while (queue.length && previous.size < maxTiles) {
    const at = queue.shift()!;
    for (const s of STEPS) {
      const x = at.x + s.x;
      const y = at.y + s.y;
      const k = key(x, y);
      if (previous.has(k) || !passable(x, y)) continue;
      previous.set(k, key(at.x, at.y));
      if (isGoal(x, y)) {
        const steps: StepDirection[] = [];
        for (let c = k; c !== key(from.x, from.y); c = previous.get(c)!) {
          const [cx, cy] = c.split(",").map(Number);
          const [px, py] = previous.get(c)!.split(",").map(Number);
          steps.unshift(DIRECTION_OF[`${cx! - px!},${cy! - py!}`]!);
        }
        return steps;
      }
      queue.push({ x, y });
    }
  }
  return null;
}
