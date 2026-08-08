import type { BuildingInstance, GameState, ResourceId, Tile } from "../sim/types";
import { BUILDINGS } from "../data/buildings";
import { techModifiers } from "../sim/strategy";
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
  food: 1.85,
  wood: 1.45,
  stone: 1.15,
  metal: 0.95,
  knowledge: 0.7,
};

export function resourceForBuilding(building: BuildingInstance): ResourceId | null {
  if (building.progress < 1) return null;
  const def = BUILDINGS[building.type];
  if (!def.produces) return null;
  const key = Object.keys(def.produces)[0] as ResourceId | undefined;
  return key ?? null;
}

/**
 * Effective gather rate: base × building `produces` identity × tech doctrines.
 * Wild forage (no produce building) is slower than camp/farm work.
 */
export function gatherRateFor(
  state: GameState,
  building: BuildingInstance | null,
  resource: ResourceId,
  opts: { hasTools: boolean; wild?: boolean; fertileBonus?: number } = { hasTools: false },
): number {
  const wild = opts.wild ?? false;
  let buildingMult = 1;
  if (building) {
    buildingMult = BUILDINGS[building.type]?.produces?.[resource] ?? 1;
  } else if (wild) {
    // Hand-forage: half speed for wood, slightly slow for food
    buildingMult = resource === "wood" ? 0.5 : 0.7;
  }
  const mods = techModifiers(state);
  const woodDoctrine = resource === "wood" ? mods.woodGatherMult : 1;
  return (
    GATHER_PER_SEC[resource] *
    buildingMult *
    woodDoctrine *
    (opts.hasTools ? 1.15 : 1) *
    (opts.fertileBonus ?? 1)
  );
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

/** Completed stockpile positions (drop-off buildings). */
function stockpilePositions(state: GameState): { x: number; y: number }[] {
  const piles: { x: number; y: number }[] = [];
  for (const b of state.buildings) {
    if (b.progress < 1 || !BUILDINGS[b.type]?.acceptsDropoff) continue;
    piles.push({ x: b.x, y: b.y });
  }
  return piles;
}

/**
 * Haul distance for a resource tile: Manhattan distance to the nearest stockpile.
 * Falls back to the work building when no stockpile exists yet.
 */
function distToNearestStockpile(
  piles: { x: number; y: number }[],
  x: number,
  y: number,
  fallback: { x: number; y: number },
): number {
  if (!piles.length) {
    return Math.abs(x - fallback.x) + Math.abs(y - fallback.y);
  }
  let best = Infinity;
  for (const p of piles) {
    const d = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (d < best) best = d;
  }
  return best;
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
  // Prefer resources closest to whichever stockpile they'll drop off at.
  const piles = stockpilePositions(state);
  const haulDist = (x: number, y: number) =>
    distToNearestStockpile(piles, x, y, building);

  const hasStock = (t: Tile) => (t.stock ?? 1) > 0;

  if (resource === "wood") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "wood" && t.terrain !== "forest") continue;
      if (t.deposit === "wood" && !hasStock(t)) continue;
      const dist = haulDist(t.x, t.y);
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
    // Only real stone deposits yield via harvestDeposit — barren rock is a no-op.
    for (const t of state.map.tiles) {
      if (t.deposit !== "stone" || !hasStock(t)) continue;
      const dist = haulDist(t.x, t.y);
      if (dist > maxDist) continue;
      let score = dist;
      if ((t.stock ?? 99) < 15) score += 2;
      if (t.x === building.x && t.y === building.y) score += 8;
      score += Math.random() * 1.5;
      candidates.push({ gx: t.x, gy: t.y, score });
    }
  } else if (resource === "metal") {
    for (const t of state.map.tiles) {
      if (t.deposit !== "metal" || !hasStock(t)) continue;
      const dist = haulDist(t.x, t.y);
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
      // Wild foraging: fertile land only (grass is barren for food)
      for (const t of state.map.tiles) {
        if (t.terrain !== "fertile" || t.deposit || !hasStock(t)) continue;
        const dist = haulDist(t.x, t.y);
        if (dist < 2 || dist > 7) continue;
        let score = dist + Math.random();
        if ((t.stock ?? 99) < 20) score += 1.5; // prefer fuller banks
        candidates.push({ gx: t.x, gy: t.y, score });
      }
    }
  } else if (resource === "knowledge") {
    // Prefer researching on the hut itself so the channel pose reads clearly
    candidates.push({ gx: building.x, gy: building.y, score: 0.1 + Math.random() * 0.2 });
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const t = tileAt(state, building.x + dx, building.y + dy);
        if (!t || t.terrain === "water") continue;
        candidates.push({
          gx: t.x,
          gy: t.y,
          score: 1.2 + Math.abs(dx) + Math.abs(dy) + Math.random(),
        });
      }
    }
  }

  if (!candidates.length) {
    // Global fallback: any matching resource with the shortest haul to a stockpile
    if (
      resource === "wood" ||
      resource === "stone" ||
      resource === "metal" ||
      (resource === "food" && building.type !== "farm")
    ) {
      let best: { gx: number; gy: number; score: number } | null = null;
      for (const t of state.map.tiles) {
        const match =
          resource === "metal"
            ? t.deposit === "metal" && hasStock(t)
            : resource === "wood"
              ? (t.deposit === "wood" && hasStock(t)) || t.terrain === "forest"
              : resource === "food"
                ? t.terrain === "fertile" && !t.deposit && hasStock(t)
                : t.deposit === "stone" && hasStock(t);
        if (!match) continue;
        const dist = haulDist(t.x, t.y);
        if (t.x === building.x && t.y === building.y) continue;
        if (!best || dist < best.score) best = { gx: t.x, gy: t.y, score: dist };
      }
      if (best) return { gx: best.gx, gy: best.gy };
      // Wild food: no fertile land anywhere — don't fake-gather on grass
      if (resource === "food") return null;
    }
    return { gx: building.x, gy: building.y };
  }

  candidates.sort((a, b) => a.score - b.score);
  // Knowledge is channeled at the research building (occasional nearby wander for variety).
  if (resource === "knowledge") {
    if (Math.random() < 0.75) {
      return { gx: building.x, gy: building.y };
    }
    const nearby = candidates.filter(
      (c) => !(c.gx === building.x && c.gy === building.y),
    );
    const pool = nearby.length ? nearby : candidates;
    const top = pool.slice(0, Math.min(4, pool.length));
    return top[Math.floor(Math.random() * top.length)];
  }
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
