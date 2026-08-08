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
