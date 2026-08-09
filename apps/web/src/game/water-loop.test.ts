import { describe, expect, it } from "vitest";
import { createNewGame } from "../sim/engine";
import { isPathDetour, syncCitizens, type Citizen } from "./citizens";
import { worldPosAt } from "./gather";
import {
  findPath,
  isWalkable,
  nearestWalkable,
  walkableFlood,
  worldToGrid,
} from "./pathfinding";

describe("citizen water walk loop", () => {
  it("treats a river circumnavigation as a detour", () => {
    const state = createNewGame(1);
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 15; x <= 25; x++) {
        state.map.tiles[y * state.map.width + x].terrain = "grass";
        state.map.tiles[y * state.map.width + x].deposit = null;
      }
      state.map.tiles[y * state.map.width + 20].terrain = "water";
    }
    const gapY = state.map.height - 2;
    state.map.tiles[gapY * state.map.width + 20].terrain = "grass";

    const from = { x: 16, y: 12 };
    const to = { x: 24, y: 12 };
    const path = findPath(state, from, to);
    expect(path.length).toBeGreaterThan(0);
    const hops = path.length - 1;
    expect(hops).toBeGreaterThan(20);
    expect(isPathDetour(from, to, hops)).toBe(true);
  });

  it("does not send foragers on a shore loop across a river", () => {
    const state = createNewGame(1);
    state.population.count = 4;
    state.priorities = {
      food: 100,
      wood: 0,
      stone: 0,
      metal: 0,
      energy: 0,
      construction: 0,
      research: 0,
      defence: 0,
      trade: 0,
    };

    const home = state.buildings.find((b) => b.type === "house")!;
    for (let y = home.y - 6; y <= home.y + 6; y++) {
      for (let x = home.x - 2; x <= home.x + 10; x++) {
        if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
        const t = state.map.tiles[y * state.map.width + x];
        t.terrain = "grass";
        t.deposit = null;
        t.stock = undefined;
      }
    }
    for (let y = 0; y < state.map.height; y++) {
      const t = state.map.tiles[y * state.map.width + (home.x + 4)];
      t.terrain = "water";
      t.deposit = null;
    }
    state.map.tiles[1 * state.map.width + (home.x + 4)].terrain = "grass";

    const far = state.map.tiles[home.y * state.map.width + (home.x + 6)];
    far.terrain = "fertile";
    far.deposit = null;
    far.stock = 40;

    const nearX = home.x - 3;
    expect(nearX).toBeGreaterThanOrEqual(0);
    const near = state.map.tiles[home.y * state.map.width + nearX];
    near.terrain = "fertile";
    near.deposit = null;
    near.stock = 40;

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const gatherers = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.phase === "toResource") || c.job.kind === "gather",
    );
    expect(gatherers.length).toBeGreaterThan(0);

    for (const c of gatherers) {
      const tile =
        c.job.kind === "walk" || c.job.kind === "gather" ? c.job.tile : undefined;
      expect(tile).toBeDefined();
      expect(tile!.gx).not.toBe(home.x + 6);
    }
  });

  it("rescues a villager stranded on a lake islet", () => {
    const state = createNewGame(2);
    state.population.count = 1;
    const home = state.buildings.find((b) => b.type === "house")!;
    const ox = 400;
    const oy = 80;

    // Carve a lake with a 1-tile islet far from home
    const ix = Math.min(state.map.width - 4, home.x + 18);
    const iy = home.y;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const t = state.map.tiles[(iy + dy) * state.map.width + (ix + dx)];
        if (!t) continue;
        t.terrain = "water";
        t.deposit = null;
      }
    }
    const islet = state.map.tiles[iy * state.map.width + ix];
    islet.terrain = "grass";
    islet.deposit = null;

    // Sanity: islet is walkable but not on the home flood
    expect(isWalkable(state, ix, iy)).toBe(true);
    const mainland = walkableFlood(state, { x: home.x, y: home.y });
    expect(mainland[iy * state.map.width + ix]).toBe(0);
    // Old bug: nearestWalkable from water next to islet picks the islet
    expect(nearestWalkable(state, { x: ix + 1, y: iy })).toEqual({ x: ix, y: iy });

    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    const c = citizens[0];
    const islandPos = worldPosAt(state, ix, iy, ox, oy);
    c.x = islandPos.x;
    c.y = islandPos.y;
    c.job = { kind: "idle" };

    syncCitizens(citizens, state, ox, oy);

    const g = worldToGrid(c.x, c.y, ox, oy);
    expect(mainland[g.y * state.map.width + g.x]).toBe(1);
    expect(g).not.toEqual({ x: ix, y: iy });
  });
});
