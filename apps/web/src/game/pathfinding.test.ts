import { describe, expect, it } from "vitest";
import { createNewGame } from "../sim/engine";
import type { GameState } from "../sim/types";
import { findPath, isWalkable, nearestWalkable } from "./pathfinding";

function paint(state: GameState, x: number, y: number, terrain: "water" | "rock" | "grass") {
  const t = state.map.tiles[y * state.map.width + x];
  t.terrain = terrain;
  t.deposit = null;
}

describe("pathfinding", () => {
  it("blocks water and rock as walkable tiles", () => {
    const state = createNewGame(1);
    paint(state, 5, 5, "water");
    paint(state, 6, 6, "rock");
    paint(state, 7, 7, "grass");
    expect(isWalkable(state, 5, 5)).toBe(false);
    expect(isWalkable(state, 6, 6)).toBe(false);
    expect(isWalkable(state, 7, 7)).toBe(true);
  });

  it("routes around a water barrier", () => {
    const state = createNewGame(2);
    // Clear a corridor then put a water wall between start and goal
    for (let y = 10; y <= 14; y++) {
      for (let x = 10; x <= 16; x++) paint(state, x, y, "grass");
    }
    for (let y = 10; y <= 14; y++) paint(state, 13, y, "water");
    // Leave a gap at y=12... actually seal fully and open bottom
    paint(state, 13, 14, "grass");

    const path = findPath(state, { x: 11, y: 12 }, { x: 15, y: 12 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((p) => p.x === 13 && state.map.tiles[p.y * state.map.width + p.x].terrain === "water")).toBe(
      false,
    );
    // Must go through the grass gap at (13,14)
    expect(path.some((p) => p.x === 13 && p.y === 14)).toBe(true);
  });

  it("allows rock as a destination (quarry) but not as a transit tile", () => {
    const state = createNewGame(3);
    for (let y = 20; y <= 22; y++) {
      for (let x = 20; x <= 24; x++) paint(state, x, y, "grass");
    }
    paint(state, 22, 21, "rock");
    paint(state, 23, 21, "rock");
    paint(state, 24, 21, "grass");

    const toQuarry = findPath(state, { x: 20, y: 21 }, { x: 22, y: 21 });
    expect(toQuarry.length).toBeGreaterThan(0);
    expect(toQuarry[toQuarry.length - 1]).toEqual({ x: 22, y: 21 });
    // Path may end on rock, but intermediate rock (23) shouldn't be crossed to reach 24
    // when going 20 -> 24 with rock wall at 22-23 — open path around
    paint(state, 22, 20, "rock");
    paint(state, 22, 22, "rock");
    const around = findPath(state, { x: 20, y: 21 }, { x: 24, y: 21 });
    expect(around.length).toBeGreaterThan(0);
    // Should not step on rock except possibly never for a grass goal
    for (const p of around) {
      const t = state.map.tiles[p.y * state.map.width + p.x];
      expect(t.terrain).not.toBe("rock");
      expect(t.terrain).not.toBe("water");
    }
  });

  it("returns empty path when goal is water", () => {
    const state = createNewGame(4);
    paint(state, 30, 30, "grass");
    paint(state, 31, 30, "water");
    expect(findPath(state, { x: 30, y: 30 }, { x: 31, y: 30 })).toEqual([]);
  });

  it("nearestWalkable finds a grass tile beside rock", () => {
    const state = createNewGame(5);
    paint(state, 40, 40, "rock");
    paint(state, 41, 40, "grass");
    expect(nearestWalkable(state, { x: 40, y: 40 })).toEqual({ x: 41, y: 40 });
  });
});
