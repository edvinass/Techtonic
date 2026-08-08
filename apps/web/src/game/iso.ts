export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export function gridToScreen(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_WIDTH / 2),
    sy: (x + y) * (TILE_HEIGHT / 2),
  };
}

export function screenToGrid(
  sx: number,
  sy: number,
): { x: number; y: number } {
  const x = Math.round((sx / (TILE_WIDTH / 2) + sy / (TILE_HEIGHT / 2)) / 2);
  const y = Math.round((sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2);
  return { x, y };
}
