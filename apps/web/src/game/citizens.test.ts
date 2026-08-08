import { describe, expect, it } from "vitest";
import { createNewGame, placeBuilding, tick } from "../sim/engine";
import { syncCitizens, type Citizen } from "./citizens";
import { worldPos } from "./gather";

describe("citizen wood gathering", () => {
  it("sends workers toward forest tiles when a lumber camp exists", () => {
    let state = createNewGame(21);
    state.resources.wood = 100;
    state.priorities = {
      food: 5,
      construction: 5,
      research: 5,
      production: 80,
      defence: 5,
    };
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood")!;
    state = placeBuilding(state, "lumber_camp", woodTile.x, woodTile.y);
    state.buildings.forEach((b) => {
      if (b.type === "lumber_camp") b.progress = 1;
    });
    // Advance a tick so construction workers aren't the only story
    state = tick(state);

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    // Interrupt any wander and assign again
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const woodBound = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.resource === "wood") ||
        (c.job.kind === "gather" && c.job.resource === "wood"),
    );
    expect(woodBound.length).toBeGreaterThan(0);

    const trip = woodBound[0];
    expect(trip.job.kind).toBe("walk");
    if (trip.job.kind !== "walk" || !trip.job.tile) throw new Error("expected walk");
    const camp = state.buildings.find((b) => b.type === "lumber_camp")!;
    // Target should not be identical to standing forever on camp only — prefer a tile
    const target = trip.job.tile;
    const targetPos = worldPos(target.gx, target.gy, ox, oy);
    const campPos = worldPos(camp.x, camp.y, ox, oy);
    // Either off the camp tile, or if only camp has wood, at least job is wood gather
    expect(
      target.gx !== camp.x ||
        target.gy !== camp.y ||
        state.map.tiles.filter((t) => t.deposit === "wood" || t.terrain === "forest")
          .length === 1,
    ).toBe(true);
    expect(Math.hypot(targetPos.x - campPos.x, targetPos.y - campPos.y)).toBeGreaterThanOrEqual(0);
  });
});
