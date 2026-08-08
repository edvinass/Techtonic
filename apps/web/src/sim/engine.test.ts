import { describe, expect, it } from "vitest";
import {
  advanceAge,
  ageUpRequirements,
  createNewGame,
  placeBuilding,
  startResearch,
  tick,
} from "./engine";

function runTicks(state: ReturnType<typeof createNewGame>, n: number) {
  let s = state;
  for (let i = 0; i < n; i++) s = tick(s);
  return s;
}

describe("sim engine", () => {
  it("creates a stone-age game with starting house and resources", () => {
    const state = createNewGame(42);
    expect(state.age).toBe("stone");
    expect(state.buildings.length).toBe(1);
    expect(state.buildings[0].type).toBe("house");
    expect(state.resources.wood).toBeGreaterThan(0);
    expect(state.population.count).toBe(5);
  });

  it("staffs lumber camps from production priority", () => {
    let state = createNewGame(7);
    state.resources.wood = 100;
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood");
    expect(woodTile).toBeTruthy();
    state = placeBuilding(state, "lumber_camp", woodTile!.x, woodTile!.y);
    state.buildings.forEach((b) => {
      if (b.type === "lumber_camp") b.progress = 1;
    });
    state.priorities = { food: 0, construction: 0, research: 0, production: 100, defence: 0 };
    state = runTicks(state, 2);
    const camp = state.buildings.find((b) => b.type === "lumber_camp");
    expect(camp?.workers).toBeGreaterThan(0);
  });

  it("halts population growth when food is empty", () => {
    let state = createNewGame(1);
    state.resources.food = 0;
    state.population.count = 5;
    state.population.housingCap = 20;
    const before = state.population.count;
    state = runTicks(state, 40);
    expect(state.population.count).toBe(before);
  });

  it("progresses research after spending knowledge", () => {
    let state = createNewGame(3);
    state.resources.knowledge = 50;
    state.pressure.eventCooldown = 9999;
    state.pressure.nextRaidAt = 9999;
    state = startResearch(state, "fire");
    expect(state.research.active?.techId).toBe("fire");
    state = runTicks(state, 80);
    expect(state.research.unlocked).toContain("fire");
    expect(state.research.active).toBeNull();
  });

  it("advances to farming age when gates are met", () => {
    let state = createNewGame(9);
    state.research.unlocked = ["fire", "farming"];
    state.population.count = 12;
    state.resources = { food: 100, wood: 100, stone: 100, metal: 0, knowledge: 10 };
    state.buildings.push({
      id: "b99",
      type: "granary",
      x: 10,
      y: 10,
      progress: 1,
      workers: 0,
    });
    const req = ageUpRequirements(state);
    expect(req.ready).toBe(true);
    state = advanceAge(state);
    expect(state.age).toBe("farming");
  });
});
