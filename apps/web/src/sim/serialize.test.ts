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
    expect(restored.schemaVersion).toBe(8);
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

  it("preserves citizen snapshots on the save payload", () => {
    const state = createNewGame(12);
    const payload = serialize(state);
    expect(payload.schemaVersion).toBe(8);
    payload.citizens = [
      {
        id: 0,
        lx: 120,
        ly: 80,
        bobPhase: 0.5,
        carrying: null,
        carryAmount: 0,
        job: { kind: "idle" },
      },
    ];
    // deserialize only restores GameState; citizens stay on the payload for the scene
    const restored = deserialize(payload);
    expect(restored.population.count).toBe(state.population.count);
    expect(payload.citizens?.[0].lx).toBe(120);
    expect(payload.citizens?.[0].ly).toBe(80);
  });

  it("seeds diplomacy when loading a save from before the neighbours", () => {
    const state = createNewGame(31);
    const payload = serialize(state);
    const legacy = {
      ...payload,
      schemaVersion: 6 as const,
      diplomacy: undefined,
    };
    const restored = deserialize(legacy);
    expect(restored.diplomacy.neighbours.length).toBeGreaterThan(0);
    expect(restored.diplomacy.routes).toEqual([]);
    expect(restored.diplomacy.demand).toBeNull();
    expect(restored.stats.goodsTraded).toBe(0);
    expect(restored.stats.tributesPaid).toBe(0);
    expect(restored.priorities.trade).toBe(0);
    // Camps must land on real, non-water ground or citizens can never reach them
    for (const n of restored.diplomacy.neighbours) {
      const tile = restored.map.tiles[n.y * restored.map.width + n.x];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe("water");
    }
  });

  it("round-trips live trade routes and standing", () => {
    let state = createNewGame(32);
    state.diplomacy.neighbours[0].standing = 42;
    state.diplomacy.routes.push({
      id: "r1",
      neighbourId: state.diplomacy.neighbours[0].id,
      give: "wood",
      take: "stone",
      weight: 2,
      pending: 3.5,
      progress: 0.25,
      starvedTicks: 0,
      suspended: false,
    });
    state = tick(state);
    const restored = deserialize(serialize(state));
    expect(restored.diplomacy.routes).toEqual(state.diplomacy.routes);
    expect(restored.diplomacy.neighbours).toEqual(state.diplomacy.neighbours);
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
        trade: 0,
      },
    };
    const restored = deserialize(legacy);
    expect(restored.priorities.wood).toBe(3);
    expect(restored.priorities.stone).toBe(0);
    expect(restored.priorities.metal).toBe(0);
    expect(restored.priorities.food).toBe(2);
    expect("production" in restored.priorities).toBe(false);
  });

  it("backfills energy and powerFactor when loading pre-grid saves", () => {
    const state = createNewGame(12);
    const payload = serialize(state);
    const { energy: _drop, ...rest } = payload.resources;
    const legacy = {
      ...payload,
      schemaVersion: 7 as const,
      resources: rest,
      powerFactor: undefined,
      priorities: {
        food: 2,
        wood: 2,
        stone: 0,
        metal: 0,
        construction: 1,
        research: 0,
        defence: 0,
        trade: 0,
      },
    };
    const restored = deserialize(legacy);
    expect(restored.resources.energy).toBe(0);
    expect(restored.powerFactor).toBe(1);
    expect(restored.priorities.energy).toBe(0);
    expect(restored.schemaVersion).toBe(8);
  });
});
