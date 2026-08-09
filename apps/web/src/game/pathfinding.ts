import type { GameState, TerrainId } from "../sim/types";
import { screenToGrid } from "./iso";

export type GridPos = { x: number; y: number };

/** Water and bare rock are impassable; rock goals (quarries) are allowed as destinations. */
export function isBlockedTerrain(terrain: TerrainId): boolean {
  return terrain === "water" || terrain === "rock";
}

export function tileAt(state: GameState, x: number, y: number) {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return undefined;
  return state.map.tiles[y * state.map.width + x];
}

export function isWalkable(
  state: GameState,
  x: number,
  y: number,
  allow?: GridPos | null,
): boolean {
  if (allow && x === allow.x && y === allow.y) {
    const t = tileAt(state, x, y);
    return !!t; // destination may be rock (quarry / stone deposit)
  }
  const t = tileAt(state, x, y);
  if (!t) return false;
  return !isBlockedTerrain(t.terrain);
}

/** World → grid; matches `worldPos` elevation offset. */
export function worldToGrid(
  wx: number,
  wy: number,
  ox: number,
  oy: number,
  elev = 3,
): GridPos {
  return screenToGrid(wx - ox, wy - oy + elev);
}

const NEIGHBORS: GridPos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

function heuristic(a: GridPos, b: GridPos): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + Math.min(dx, dy) * 0.001;
}

/**
 * A* grid path from `from` to `to`. Includes both endpoints.
 * Returns [] if unreachable. Start tile is always treated as walkable.
 */
export function findPath(state: GameState, from: GridPos, to: GridPos): GridPos[] {
  const { width, height } = state.map;
  if (
    from.x < 0 ||
    from.y < 0 ||
    from.x >= width ||
    from.y >= height ||
    to.x < 0 ||
    to.y < 0 ||
    to.x >= width ||
    to.y >= height
  ) {
    return [];
  }
  if (from.x === to.x && from.y === to.y) return [from];

  // If destination is water, nowhere valid to stand
  const dest = tileAt(state, to.x, to.y);
  if (!dest || dest.terrain === "water") return [];

  const key = (x: number, y: number) => y * width + x;
  const open: { x: number; y: number; f: number; g: number }[] = [
    { x: from.x, y: from.y, f: heuristic(from, to), g: 0 },
  ];
  const came = new Int32Array(width * height).fill(-1);
  const gScore = new Float32Array(width * height).fill(Infinity);
  gScore[key(from.x, from.y)] = 0;
  const closed = new Uint8Array(width * height);

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[best].f) best = i;
    }
    const cur = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    const ck = key(cur.x, cur.y);
    if (closed[ck]) continue;
    closed[ck] = 1;

    if (cur.x === to.x && cur.y === to.y) {
      const path: GridPos[] = [{ x: cur.x, y: cur.y }];
      let k = ck;
      while (came[k] >= 0) {
        const prev = came[k];
        path.push({ x: prev % width, y: Math.floor(prev / width) });
        k = prev;
      }
      path.reverse();
      return path;
    }

    for (const n of NEIGHBORS) {
      const nx = cur.x + n.x;
      const ny = cur.y + n.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;

      const diagonal = n.x !== 0 && n.y !== 0;
      if (diagonal) {
        // No cutting corners through blocked tiles
        if (!isWalkable(state, cur.x + n.x, cur.y, to) || !isWalkable(state, cur.x, cur.y + n.y, to)) {
          continue;
        }
      }

      const start = nx === from.x && ny === from.y;
      if (!start && !isWalkable(state, nx, ny, to)) continue;

      const step = diagonal ? 1.414 : 1;
      const tentative = cur.g + step;
      if (tentative >= gScore[nk]) continue;
      came[nk] = ck;
      gScore[nk] = tentative;
      open.push({
        x: nx,
        y: ny,
        g: tentative,
        f: tentative + heuristic({ x: nx, y: ny }, to),
      });
    }
  }

  return [];
}

/** Nearest walkable tile to `pos` (including itself). */
export function nearestWalkable(state: GameState, pos: GridPos, maxR = 8): GridPos | null {
  if (isWalkable(state, pos.x, pos.y)) return pos;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (isWalkable(state, pos.x + dx, pos.y + dy)) {
          return { x: pos.x + dx, y: pos.y + dy };
        }
      }
    }
  }
  return null;
}

/**
 * Flood-fill every walkable tile reachable from `origin` (8-connected, same
 * rules as findPath). Used to keep villagers off lake islets.
 */
export function walkableFlood(state: GameState, origin: GridPos): Uint8Array {
  const { width, height } = state.map;
  const reach = new Uint8Array(width * height);
  const start = isWalkable(state, origin.x, origin.y)
    ? origin
    : nearestWalkable(state, origin, 12);
  if (!start) return reach;

  const qx: number[] = [start.x];
  const qy: number[] = [start.y];
  reach[start.y * width + start.x] = 1;
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    for (const n of NEIGHBORS) {
      const nx = x + n.x;
      const ny = y + n.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = ny * width + nx;
      if (reach[k]) continue;
      const diagonal = n.x !== 0 && n.y !== 0;
      if (diagonal) {
        if (!isWalkable(state, x + n.x, y) || !isWalkable(state, x, y + n.y)) continue;
      }
      if (!isWalkable(state, nx, ny)) continue;
      reach[k] = 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  return reach;
}

export function tileInFlood(reach: Uint8Array, width: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= reach.length / width) return false;
  return reach[y * width + x] === 1;
}

/** Nearest walkable tile that belongs to a flood-fill (home mainland). */
export function nearestReachable(
  state: GameState,
  pos: GridPos,
  reach: Uint8Array,
  maxR = 16,
): GridPos | null {
  const { width } = state.map;
  if (isWalkable(state, pos.x, pos.y) && tileInFlood(reach, width, pos.x, pos.y)) {
    return pos;
  }
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (isWalkable(state, x, y) && tileInFlood(reach, width, x, y)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}
