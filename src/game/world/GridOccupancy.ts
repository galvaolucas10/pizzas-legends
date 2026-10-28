/**
 * Quem ocupa cada tile (ARCHITECTURE 10.2).
 * - Paredes vêm da colisão do mapa; fora do mapa conta como bloqueado.
 * - Entidades sólidas ocupam seu tile. Antes de andar, a entidade reserva o destino
 *   e só libera a origem ao chegar: duas entidades nunca entram no mesmo tile.
 */
export class GridOccupancy {
  private readonly occupants = new Map<string, string>();

  constructor(
    private readonly collision: readonly string[],
    readonly width: number,
    readonly height: number,
  ) {}

  isWall(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.collision[y]?.[x] !== ".";
  }

  /** Parede, entidade sólida ou reserva. */
  isBlocked(x: number, y: number): boolean {
    return this.isWall(x, y) || this.occupants.has(key(x, y));
  }

  occupant(x: number, y: number): string | undefined {
    return this.occupants.get(key(x, y));
  }

  /** Ocupa o tile para a entidade. Falha se estiver bloqueado por outra coisa. */
  reserve(entityId: string, x: number, y: number): boolean {
    const current = this.occupants.get(key(x, y));
    if (current === entityId) return true;
    if (this.isBlocked(x, y)) return false;
    this.occupants.set(key(x, y), entityId);
    return true;
  }

  /** Ocupa o tile mesmo sendo parede (ex.: cliente sentado numa cadeira). */
  claim(entityId: string, x: number, y: number): void {
    this.occupants.set(key(x, y), entityId);
  }

  release(entityId: string, x: number, y: number): void {
    if (this.occupants.get(key(x, y)) === entityId) this.occupants.delete(key(x, y));
  }

  /** Tiles ocupados (para a ferramenta de depuração). */
  entries(): [x: number, y: number, entityId: string][] {
    return [...this.occupants].map(([k, id]) => {
      const [x = 0, y = 0] = k.split(",").map(Number);
      return [x, y, id];
    });
  }
}

const key = (x: number, y: number) => `${x},${y}`;
