import { describe, expect, it } from "vitest";
import { createNewGame } from "../sim/engine";
import { CARRY_CAPACITY, findResourceTile, resourceForBuilding } from "./gather";

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
});
