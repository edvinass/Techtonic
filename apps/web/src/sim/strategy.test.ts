import { describe, expect, it } from "vitest";
import { createNewGame, harvestDeposit, claimHarmonyVictory, isTechAvailable } from "./engine";
import { defenceReadiness } from "./pressure";
import {
  forestCoverRatio,
  harmonyRequirements,
  housingDefenceCoverage,
  strainRaidMultiplier,
  techModifiers,
} from "./strategy";

describe("strategy depth", () => {
  it("raises Land Strain when wood is harvested", () => {
    const state = createNewGame(42);
    expect(state.strain).toBe(0);
    const wood = state.map.tiles.find((t) => t.deposit === "wood" && (t.stock ?? 0) > 20)!;
    harvestDeposit(state, wood.x, wood.y, 20);
    expect(state.strain).toBeGreaterThan(1);
  });

  it("makes high strain worsen raid harshness", () => {
    expect(strainRaidMultiplier(0)).toBe(1);
    expect(strainRaidMultiplier(100)).toBeGreaterThan(1.4);
  });

  it("locks Clearcutting after Selective Cuts (and vice versa)", () => {
    const state = createNewGame(3);
    state.research.unlocked = ["fire", "selective_cuts"];
    expect(isTechAvailable(state, "clearcutting")).toBe(false);
    expect(isTechAvailable(state, "primitive_tools")).toBe(true);

    const other = createNewGame(4);
    other.research.unlocked = ["fire", "clearcutting"];
    expect(isTechAvailable(other, "selective_cuts")).toBe(false);
  });

  it("applies distinct doctrine modifiers", () => {
    const selective = createNewGame(1);
    selective.research.unlocked = ["selective_cuts"];
    const clear = createNewGame(2);
    clear.research.unlocked = ["clearcutting"];
    const s = techModifiers(selective);
    const c = techModifiers(clear);
    expect(s.woodGatherMult).toBeLessThan(c.woodGatherMult);
    expect(s.strainGainMult).toBeLessThan(c.strainGainMult);
    expect(s.regrowthMult).toBeGreaterThan(c.regrowthMult);
  });

  it("boosts defence readiness when towers cover houses", () => {
    const exposed = createNewGame(8);
    exposed.buildings = [
      { id: "b1", type: "house", x: 10, y: 10, progress: 1, workers: 0 },
      { id: "b2", type: "watchtower", x: 30, y: 30, progress: 1, workers: 0 },
    ];
    exposed.priorities = {
      food: 20,
      wood: 20,
      stone: 0,
      metal: 0,
      construction: 20,
      research: 20,
      defence: 20,
      trade: 0,
    };

    const covered = createNewGame(9);
    covered.buildings = [
      { id: "b1", type: "house", x: 10, y: 10, progress: 1, workers: 0 },
      { id: "b2", type: "watchtower", x: 12, y: 11, progress: 1, workers: 0 },
    ];
    covered.priorities = { ...exposed.priorities };

    expect(housingDefenceCoverage(covered)).toBeGreaterThan(housingDefenceCoverage(exposed));
    expect(defenceReadiness(covered)).toBeGreaterThan(defenceReadiness(exposed));
  });

  it("claims Harmony victory when stewardship path is complete", () => {
    let state = createNewGame(15);
    state.age = "farming";
    state.research.unlocked = ["fire", "selective_cuts", "farming", "stewardship"];
    state.population.count = 48;
    state.strain = 10;
    state.buildings.push({
      id: "b200",
      type: "grove_sanctuary",
      x: 16,
      y: 16,
      progress: 1,
      workers: 0,
    });
    // Ensure enough forest cover for the map
    for (const t of state.map.tiles) {
      if (t.terrain === "grass" && !t.deposit) {
        t.terrain = "forest";
        t.deposit = "wood";
        t.stock = 40;
      }
    }
    expect(forestCoverRatio(state)).toBeGreaterThanOrEqual(0.3);
    const req = harmonyRequirements(state);
    expect(req.ready).toBe(true);
    state = claimHarmonyVictory(state);
    expect(state.outcome).toBe("victory");
    expect(state.stats.victoryKind).toBe("harmony");
  });
});
