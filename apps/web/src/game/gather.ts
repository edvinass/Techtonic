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
  const maxDist = resource === "wood" || resource === "stone" ? 14 : 8;

  if (resource === "wood") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "wood" && t.terrain !== "forest") continue;
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > maxDist) continue;
      // Prefer nearby trees that are NOT the camp tile itself (so they walk out)
      let score = dist;
      if (t.deposit === "wood") score -= 0.5;
      if (t.x === building.x && t.y === building.y) score += 8;
      if (preferAwayFrom && dist >= 1) score -= 0.25;
      // Slight randomness so workers spread across several trees
      score += Math.random() * 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "stone") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "stone" && t.terrain !== "rock") continue;
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > maxDist) continue;
      let score = dist;
      if (t.deposit === "stone") score -= 0.5;
      if (t.x === building.x && t.y === building.y) score += 8;
      score += Math.random() * 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "food") {
    if (building.type === "farm") {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = tileAt(state, building.x + dx, building.y + dy);
          if (!t || t.terrain === "water") continue;
          candidates.push({
            gx: t.x,
            gy: t.y,
            score: Math.abs(dx) + Math.abs(dy) + Math.random() * 0.5,
          });
        }
      }
    } else {
      // Wild foraging: grass only — forests are for woodcutters
      for (const t of state.map.tiles) {
        if (t.terrain !== "grass" || t.deposit) continue;
        const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
        if (dist < 2 || dist > 7) continue;
        candidates.push({ gx: t.x, gy: t.y, score: dist + Math.random() });
      }
    }
  } else if (resource === "knowledge") {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const t = tileAt(state, building.x + dx, building.y + dy);
        if (!t || t.terrain === "water") continue;
        candidates.push({ gx: t.x, gy: t.y, score: Math.abs(dx) + Math.abs(dy) + Math.random() });
      }
    }
  }

  if (!candidates.length) {
    // Global fallback: any matching resource on the map nearest the building
    if (resource === "wood" || resource === "stone") {
      const deposit = resource === "wood" ? "wood" : "stone";
      const terrain = resource === "wood" ? "forest" : "rock";
      let best: { gx: number; gy: number; score: number } | null = null;
      for (const t of state.map.tiles) {
        if (t.deposit !== deposit && t.terrain !== terrain) continue;
        const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
        if (t.x === building.x && t.y === building.y) continue;
        if (!best || dist < best.score) best = { gx: t.x, gy: t.y, score: dist };
      }
      if (best) return { gx: best.gx, gy: best.gy };
    }
    return { gx: building.x, gy: building.y };
  }

  candidates.sort((a, b) => a.score - b.score);
  // Prefer walking at least 1 tile away when possible
  const away = candidates.filter(
    (c) => !(c.gx === building.x && c.gy === building.y),
  );
  const pool = away.length ? away : candidates;
  const top = pool.slice(0, Math.min(6, pool.length));
  return top[Math.floor(Math.random() * top.length)];
}

export function carryCapacityFor(resource: ResourceId, hasTools: boolean): number {
  const base = CARRY_CAPACITY[resource];
  return hasTools && (resource === "wood" || resource === "stone")
    ? Math.ceil(base * 1.25)
    : base;
}
