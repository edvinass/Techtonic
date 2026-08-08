import { describe, expect, it } from "vitest";
import { createNewGame } from "../sim/engine";
import {
  CARRY_CAPACITY,
  findResourceTile,
  gatherRateFor,
  GATHER_PER_SEC,
  resourceForBuilding,
} from "./gather";

describe("gather rules", () => {
  it("defines finite carry capacities", () => {
    expect(CARRY_CAPACITY.wood).toBeGreaterThan(0);
    expect(CARRY_CAPACITY.stone).toBeLessThan(CARRY_CAPACITY.wood + 5);
  });

  it("sends lumber workers to forest/wood tiles", () => {
    const state = createNewGame(11);
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood")!;
    const building = {
      id: "b2",
      type: "lumber_camp" as const,
      x: woodTile.x,
      y: woodTile.y,
      progress: 1,
      workers: 2,
    };
    expect(resourceForBuilding(building)).toBe("wood");
    const tile = findResourceTile(state, building, "wood");
    expect(tile).toBeTruthy();
    const found = state.map.tiles.find((t) => t.x === tile!.gx && t.y === tile!.gy);
    expect(found?.deposit === "wood" || found?.terrain === "forest").toBe(true);
  });

  it("sends quarry workers only to stone deposits, never barren rock", () => {
    const state = createNewGame(11);
    const stoneTile = state.map.tiles.find((t) => t.deposit === "stone")!;
    // Inject barren rock next to the quarry — old matcher treated this as gatherable
    const nx = Math.min(state.map.width - 1, stoneTile.x + 1);
    const ny = stoneTile.y;
    const barren = state.map.tiles[ny * state.map.width + nx];
    barren.terrain = "rock";
    barren.deposit = null;
    barren.stock = undefined;

    const building = {
      id: "b-quarry",
      type: "quarry" as const,
      x: stoneTile.x,
      y: stoneTile.y,
      progress: 1,
      workers: 2,
    };
    expect(resourceForBuilding(building)).toBe("stone");

    for (let i = 0; i < 20; i++) {
      const tile = findResourceTile(state, building, "stone");
      expect(tile).toBeTruthy();
      const found = state.map.tiles.find((t) => t.x === tile!.gx && t.y === tile!.gy);
      expect(found?.deposit).toBe("stone");
      expect(found?.stock === undefined || found!.stock! > 0).toBe(true);
    }
  });

  it("sends wild food foragers only to fertile land", () => {
    const state = createNewGame(11);
    const home = state.buildings.find((b) => b.type === "house")!;
    // Guarantee fertile + grass in forage range so the matcher has a choice
    const fertile = state.map.tiles.find(
      (t) =>
        t.terrain === "fertile" &&
        !t.deposit &&
        Math.abs(t.x - home.x) + Math.abs(t.y - home.y) >= 2 &&
        Math.abs(t.x - home.x) + Math.abs(t.y - home.y) <= 7,
    );
    expect(fertile).toBeTruthy();
    const grassNear = state.map.tiles.find(
      (t) =>
        t.terrain === "grass" &&
        !t.deposit &&
        Math.abs(t.x - home.x) + Math.abs(t.y - home.y) >= 2 &&
        Math.abs(t.x - home.x) + Math.abs(t.y - home.y) <= 7,
    );
    expect(grassNear).toBeTruthy();

    for (let i = 0; i < 20; i++) {
      const tile = findResourceTile(state, home, "food");
      expect(tile).toBeTruthy();
      const found = state.map.tiles.find((t) => t.x === tile!.gx && t.y === tile!.gy);
      expect(found?.terrain).toBe("fertile");
    }
  });

  it("multiplies gather speed by building produces rates", () => {
    const state = createNewGame(11);
    const camp = {
      id: "b2",
      type: "lumber_camp" as const,
      x: 5,
      y: 5,
      progress: 1,
      workers: 2,
    };
    const farm = {
      id: "b3",
      type: "farm" as const,
      x: 6,
      y: 6,
      progress: 1,
      workers: 2,
    };
    const campRate = gatherRateFor(state, camp, "wood", { hasTools: false });
    const wildRate = gatherRateFor(state, null, "wood", { hasTools: false, wild: true });
    const farmRate = gatherRateFor(state, farm, "food", { hasTools: false });
    expect(campRate).toBeCloseTo(GATHER_PER_SEC.wood * 1.15, 5);
    expect(wildRate).toBeLessThan(campRate);
    expect(farmRate).toBeCloseTo(GATHER_PER_SEC.food * 1.2, 5);
  });

  it("applies clearcutting wood doctrine to gather rate", () => {
    const base = createNewGame(2);
    const boosted = createNewGame(2);
    boosted.research.unlocked = ["clearcutting"];
    const camp = {
      id: "b2",
      type: "lumber_camp" as const,
      x: 5,
      y: 5,
      progress: 1,
      workers: 1,
    };
    expect(gatherRateFor(boosted, camp, "wood", { hasTools: false })).toBeGreaterThan(
      gatherRateFor(base, camp, "wood", { hasTools: false }),
    );
  });
});
