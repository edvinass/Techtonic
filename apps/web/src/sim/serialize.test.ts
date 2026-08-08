import { describe, expect, it } from "vitest";
import { createNewGame, tick } from "./engine";
import { deserialize, serialize } from "./serialize";

describe("serialize", () => {
  it("round-trips game state", () => {
    let state = createNewGame(99);
    state = tick(state);
    state = tick(state);
    const payload = serialize(state);
    const restored = deserialize(payload);
    expect(restored.tick).toBe(state.tick);
    expect(restored.age).toBe(state.age);
    expect(restored.resources).toEqual(state.resources);
    expect(restored.buildings).toEqual(state.buildings);
    expect(restored.map.tiles.length).toBe(state.map.tiles.length);
    expect(restored.pressure.season).toBe(state.pressure.season);
  });

  it("migrates schema v1 saves without pressure", () => {
    const state = createNewGame(12);
    const payload = serialize(state);
    const v1 = {
      ...payload,
      schemaVersion: 1 as const,
      pressure: undefined,
    };
    const restored = deserialize(v1);
    expect(restored.schemaVersion).toBe(5);
    expect(restored.strain).toBe(0);
    expect(restored.pressure.season).toBe("spring");
    expect(restored.pressure.nextRaidAt).toBeGreaterThan(0);
    expect(restored.outcome).toBe("playing");
    expect(restored.map.tiles.some((t) => t.deposit && (t.stock ?? 0) > 0)).toBe(true);
  });

  it("backfills fertile stock on legacy tiles missing stock", () => {
    const state = createNewGame(12);
    const payload = serialize(state);
    for (const t of payload.map.tiles) {
      if (t.terrain === "fertile") delete (t as { stock?: number }).stock;
    }
    const restored = deserialize(payload);
    const fertile = restored.map.tiles.filter((t) => t.terrain === "fertile" && !t.deposit);
    expect(fertile.length).toBeGreaterThan(0);
    expect(fertile.every((t) => (t.stock ?? 0) > 0)).toBe(true);
  });

  it("adds a starter stockpile when loading a save without one", () => {
    const state = createNewGame(12);
    const payload = serialize(state);
    payload.buildings = payload.buildings.filter((b) => b.type !== "stockpile");
    expect(payload.buildings.some((b) => b.type === "stockpile")).toBe(false);
    const restored = deserialize(payload);
    expect(restored.buildings.some((b) => b.type === "stockpile" && b.progress >= 1)).toBe(
      true,
    );
  });

  it("migrates legacy Gather (production) priority into wood", () => {
    const state = createNewGame(12);
    const payload = serialize(state);
    const legacy = {
      ...payload,
      schemaVersion: 4 as const,
      priorities: {
        food: 2,
        construction: 1,
        research: 0,
        production: 3,
        defence: 0,
      },
    };
    const restored = deserialize(legacy);
    expect(restored.priorities.wood).toBe(3);
    expect(restored.priorities.stone).toBe(0);
    expect(restored.priorities.metal).toBe(0);
    expect(restored.priorities.food).toBe(2);
    expect("production" in restored.priorities).toBe(false);
  });
});
