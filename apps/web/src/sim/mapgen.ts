import type { Tile } from "./types";
import { createRng } from "./rng";

export function generateMap(width: number, height: number, seed: number): Tile[] {
  const rng = createRng(seed);
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = rng();
      let terrain: Tile["terrain"] = "grass";
      let deposit: Tile["deposit"] = null;

      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (onBorder && n < 0.55) {
        terrain = "water";
      } else if (n < 0.18) {
        terrain = "forest";
        deposit = "wood";
      } else if (n < 0.26) {
        terrain = "rock";
        deposit = "stone";
      } else if (n < 0.30) {
        terrain = "rock";
        deposit = "metal";
      } else {
        terrain = "grass";
      }

      tiles.push({ x, y, terrain, deposit });
    }
  }

  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tile = tiles.find((t) => t.x === cx + dx && t.y === cy + dy);
      if (!tile) continue;
      tile.terrain = "grass";
      tile.deposit = null;
    }
  }

  const woodTile = tiles.find((t) => t.x === cx + 3 && t.y === cy);
  if (woodTile) {
    woodTile.terrain = "forest";
    woodTile.deposit = "wood";
  }
  const stoneTile = tiles.find((t) => t.x === cx && t.y === cy + 3);
  if (stoneTile) {
    stoneTile.terrain = "rock";
    stoneTile.deposit = "stone";
  }
  const metalTile = tiles.find((t) => t.x === cx - 3 && t.y === cy);
  if (metalTile) {
    metalTile.terrain = "rock";
    metalTile.deposit = "metal";
  }

  return tiles;
}
