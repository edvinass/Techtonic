import type { BuildingInstance, GameState, ResourceId, Tile } from "../sim/types";
import { BUILDINGS } from "../data/buildings";
import { gridToScreen } from "./iso";

/** Max resources a worker can carry before returning to drop off. */
export const CARRY_CAPACITY: Record<ResourceId, number> = {
  food: 10,
  wood: 8,
  stone: 6,
  metal: 5,
  knowledge: 4,
};

/** Gather rate while standing on a resource tile (units per second). */
export const GATHER_PER_SEC: Record<ResourceId, number> = {
  food: 3.2,
  wood: 2.6,
  stone: 2.1,
  metal: 1.8,
  knowledge: 1.4,
};

export function resourceForBuilding(building: BuildingInstance): ResourceId | null {
  if (building.progress < 1) return null;
  const def = BUILDINGS[building.type];
  if (!def.produces) return null;
  const key = Object.keys(def.produces)[0] as ResourceId | undefined;
  return key ?? null;
}

export function worldPos(gx: number, gy: number, ox: number, oy: number) {
  const { sx, sy } = gridToScreen(gx, gy);
  return { x: ox + sx, y: oy + sy };
}

function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return undefined;
  return state.map.tiles[y * state.map.width + x];
}

/** Pick a map tile this worker should walk to for gathering. */
export function findResourceTile(
  state: GameState,
  building: BuildingInstance,
  resource: ResourceId,
  preferAwayFrom?: { x: number; y: number },
): { gx: number; gy: number } | null {
  const candidates: { gx: number; gy: number; score: number }[] = [];

  if (resource === "wood") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "wood" && t.terrain !== "forest") continue;
      // Prefer real deposits; allow forest without deposit too
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > 8) continue;
      let score = dist + (t.deposit === "wood" ? 0 : 2);
      if (preferAwayFrom) {
        score -= Math.min(3, Math.hypot(t.x - preferAwayFrom.x, t.y - preferAwayFrom.y) * 0.15);
      }
      // Slightly prefer tiles that aren't the building itself so they walk out
      if (t.x === building.x && t.y === building.y) score += 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "stone") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "stone" && t.terrain !== "rock") continue;
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > 8) continue;
      let score = dist + (t.deposit === "stone" ? 0 : 2);
      if (t.x === building.x && t.y === building.y) score += 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "food") {
    if (building.type === "farm") {
      // Work plots around the farm
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = tileAt(state, building.x + dx, building.y + dy);
          if (!t || t.terrain === "water") continue;
          const score = Math.abs(dx) + Math.abs(dy) + Math.random() * 0.5;
          candidates.push({ gx: t.x, gy: t.y, score });
        }
      }
    } else {
      // Foraging wild food on grass/forest near settlement
      for (const t of state.map.tiles) {
        if (t.terrain !== "grass" && t.terrain !== "forest") continue;
        const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
        if (dist < 2 || dist > 7) continue;
        candidates.push({ gx: t.x, gy: t.y, score: dist + Math.random() });
      }
    }
  } else if (resource === "knowledge") {
    // Study near the research hut — small walk around it
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const t = tileAt(state, building.x + dx, building.y + dy);
        if (!t || t.terrain === "water") continue;
        candidates.push({ gx: t.x, gy: t.y, score: Math.random() });
      }
    }
    candidates.push({ gx: building.x, gy: building.y, score: 2 });
  }

  if (!candidates.length) {
    // Fallback: building tile
    return { gx: building.x, gy: building.y };
  }

  candidates.sort((a, b) => a.score - b.score);
  // Pick among a few best so workers spread out
  const top = candidates.slice(0, Math.min(5, candidates.length));
  return top[Math.floor(Math.random() * top.length)];
}

export function carryCapacityFor(
  resource: ResourceId,
  hasTools: boolean,
): number {
  const base = CARRY_CAPACITY[resource];
  return hasTools && (resource === "wood" || resource === "stone")
    ? Math.ceil(base * 1.25)
    : base;
}
