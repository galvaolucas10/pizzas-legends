export type Direction = "up" | "down" | "left" | "right";

export const utils = {
  withGrid(n: number): number {
    return n * 16;
  },
  asGridCoord(x: number, y: number): string {
    return `${x * 16},${y * 16}`;
  },
  nextPosition(initialX: number, initialY: number, direction: Direction): { x: number; y: number } {
    let x = initialX;
    let y = initialY;
    const size = 16;
    if (direction === "left") {
      x -= size;
    } else if (direction === "right") {
      x += size;
    } else if (direction === "up") {
      y -= size;
    } else if (direction === "down") {
      y += size;
    }
    return { x, y };
  },
  // Caminho de um arquivo em public/assets, respeitando o "base" do Vite.
  asset(path: string): string {
    return `${import.meta.env.BASE_URL}assets/${path}`;
  },
};
