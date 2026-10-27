import type { DrawableImage } from "../assets/AssetLoader";

export const TILE = 16;

export interface CacheTileset {
  image: DrawableImage;
  firstGid: number;
  columns: number;
}

/**
 * Desenha camadas de tiles uma única vez num canvas fora da tela (ARCHITECTURE 13).
 * Em cada quadro, o mapa custa um único drawImage.
 */
export function buildTileLayerCache(
  layers: readonly (readonly number[])[],
  width: number,
  height: number,
  tilesets: readonly CacheTileset[],
): HTMLCanvasElement | null {
  if (layers.every((layer) => layer.every((gid) => gid === 0))) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width * TILE;
  canvas.height = height * TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  // Do maior firstGid para o menor: o primeiro tileset com firstGid <= gid é o dono do tile.
  const sorted = [...tilesets].sort((a, b) => b.firstGid - a.firstGid);
  for (const layer of layers) {
    layer.forEach((gid, i) => {
      if (gid === 0) return;
      const tileset = sorted.find((t) => gid >= t.firstGid);
      if (!tileset) return;
      const local = gid - tileset.firstGid;
      const sx = (local % tileset.columns) * TILE;
      const sy = Math.floor(local / tileset.columns) * TILE;
      const dx = (i % width) * TILE;
      const dy = Math.floor(i / width) * TILE;
      ctx.drawImage(tileset.image, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
    });
  }
  return canvas;
}
