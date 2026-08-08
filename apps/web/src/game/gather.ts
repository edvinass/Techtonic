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
  food: 2.6,
  wood: 2.1,
  stone: 1.7,
  metal: 1.45,
  knowledge: 1.2,
};

export function resourceForBuilding(building: BuildingInstance): ResourceId | null {
  if (building.progress < 1) return null;
  const def = BUILDINGS[building.type];
  if (!def.produces) return null;
  const key = Object.keys(def.produces)[0] as ResourceId | undefined;
  return key ?? null;
}

/** Match MainScene tile elevation so citizens stand on the tile top face. */
export function worldPos(gx: number, gy: number, ox: number, oy: number, elev = 3) {
  const { sx, sy } = gridToScreen(gx, gy);
  return { x: ox + sx, y: oy + sy - elev };
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
  const maxDist =
    resource === "wood" || resource === "stone" || resource === "metal" ? 14 : 8;

  const hasStock = (t: Tile) => t.stock === undefined || t.stock > 0;

  if (resource === "wood") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "wood" && t.terrain !== "forest") continue;
      if (t.deposit === "wood" && !hasStock(t)) continue;
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > maxDist) continue;
      let score = dist;
      if (t.deposit === "wood") score -= 0.5;
      if ((t.stock ?? 99) < 15) score += 2; // prefer fuller stands
      if (t.x === building.x && t.y === building.y) score += 8;
      if (preferAwayFrom && dist >= 1) score -= 0.25;
      score += Math.random() * 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "stone") {
    for (const t of state.map.tiles) {
      if (t.deposit === "metal") continue;
      if (t.deposit !== "stone" && t.terrain !== "rock") continue;
      if (t.deposit === "stone" && !hasStock(t)) continue;
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > maxDist) continue;
      let score = dist;
      if (t.deposit === "stone") score -= 0.5;
      if (t.x === building.x && t.y === building.y) score += 8;
      score += Math.random() * 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "metal") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "metal" || !hasStock(t)) continue;
      const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
      if (dist > maxDist) continue;
      let score = dist;
      if (t.x === building.x && t.y === building.y) score += 8;
      score += Math.random() * 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "food") {
    if (building.type === "farm") {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = tileAt(state, building.x + dx, building.y + dy);
          if (!t || t.terrain === "water" || t.terrain === "rock") continue;
          let score = Math.abs(dx) + Math.abs(dy) + Math.random() * 0.5;
          if (t.terrain === "fertile") score -= 1.2;
          candidates.push({ gx: t.x, gy: t.y, score });
        }
      }
    } else {
      // Wild foraging: grass / fertile / sand edge — forests are for woodcutters
      for (const t of state.map.tiles) {
        if ((t.terrain !== "grass" && t.terrain !== "fertile") || t.deposit) continue;
        const dist = Math.abs(t.x - building.x) + Math.abs(t.y - building.y);
        if (dist < 2 || dist > 7) continue;
        let score = dist + Math.random();
        if (t.terrain === "fertile") score -= 0.8;
        candidates.push({ gx: t.x, gy: t.y, score });
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
    if (resource === "wood" || resource === "stone" || resource === "metal") {
      let best: { gx: number; gy: number; score: number } | null = null;
      for (const t of state.map.tiles) {
        const match =
          resource === "metal"
            ? t.deposit === "metal" && hasStock(t)
            : resource === "wood"
              ? (t.deposit === "wood" && hasStock(t)) || t.terrain === "forest"
              : (t.deposit === "stone" || t.terrain === "rock") &&
                t.deposit !== "metal" &&
                (t.deposit !== "stone" || hasStock(t));
        if (!match) continue;
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

export function carryCapacityFor(
  resource: ResourceId,
  hasTools: boolean,
  wild = false,
): number {
  let base = CARRY_CAPACITY[resource];
  // Hand-chopping without a lumber camp is slower / smaller loads
  if (wild && resource === "wood") base = Math.max(3, Math.floor(base * 0.5));
  return hasTools && (resource === "wood" || resource === "stone" || resource === "metal")
    ? Math.ceil(base * 1.25)
    : base;
}
