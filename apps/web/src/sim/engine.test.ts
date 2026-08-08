import { describe, expect, it } from "vitest";
import {
  advanceAge,
  ageUpRequirements,
  applyConstructionProgress,
  createNewGame,
  harvestDeposit,
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
  it("creates a stone-age game with starting house, stockpile, and resources", () => {
    const state = createNewGame(42);
    expect(state.age).toBe("stone");
    expect(state.buildings.some((b) => b.type === "house" && b.progress >= 1)).toBe(true);
    expect(state.buildings.some((b) => b.type === "stockpile" && b.progress >= 1)).toBe(true);
    expect(state.resources.wood).toBeGreaterThan(0);
    expect(state.population.count).toBe(5);
  });

  it("staffs lumber camps from wood priority", () => {
    let state = createNewGame(7);
    state.resources.wood = 100;
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood");
    expect(woodTile).toBeTruthy();
    state = placeBuilding(state, "lumber_camp", woodTile!.x, woodTile!.y);
    state.buildings.forEach((b) => {
      if (b.type === "lumber_camp") b.progress = 1;
    });
    state.priorities = {
      food: 0,
      wood: 100,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    state = runTicks(state, 2);
    const camp = state.buildings.find((b) => b.type === "lumber_camp");
    expect(camp?.workers).toBeGreaterThan(0);
  });

  it("starvation prevents growth and eventually kills villagers", () => {
    let state = createNewGame(1);
    state.resources.food = 0;
    state.population.count = 5;
    state.population.housingCap = 20;
    state.pressure.eventCooldown = 9999;
    state.pressure.nextRaidAt = 9999;
    const before = state.population.count;
    state = runTicks(state, 40);
    expect(state.population.count).toBeLessThan(before);
    expect(state.population.count).toBeGreaterThanOrEqual(1);
  });

  it("progresses research after spending knowledge", () => {
    let state = createNewGame(3);
    state.resources.knowledge = 50;
    state.pressure.eventCooldown = 9999;
    state.pressure.nextRaidAt = 9999;
    state = startResearch(state, "fire");
    expect(state.research.active?.techId).toBe("fire");
    // Fire is 36 researchTicks at base rate 0.4 → 90 ticks with no research workers
    state = runTicks(state, 120);
    expect(state.research.unlocked).toContain("fire");
    expect(state.research.active).toBeNull();
  });

  it("does not auto-progress construction when Build workers are 0", () => {
    let state = createNewGame(5);
    state.resources.wood = 100;
    state.buildings.push({
      id: "b50",
      type: "lumber_camp",
      x: 8,
      y: 8,
      progress: 0,
      workers: 0,
    });
    state.priorities = {
      food: 0,
      wood: 100,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    state.population.count = 5;
    const before = state.buildings.find((b) => b.id === "b50")!.progress;
    state = runTicks(state, 5);
    const after = state.buildings.find((b) => b.id === "b50")!.progress;
    expect(after).toBe(before);
  });

  it("applyConstructionProgress advances a scaffold toward completion", () => {
    const state = createNewGame(5);
    state.buildings.push({
      id: "b51",
      type: "lumber_camp",
      x: 8,
      y: 8,
      progress: 0.2,
      workers: 0,
    });
    applyConstructionProgress(state, "b51", 0.3);
    expect(state.buildings.find((b) => b.id === "b51")!.progress).toBeCloseTo(0.5);
    applyConstructionProgress(state, "b51", 1);
    expect(state.buildings.find((b) => b.id === "b51")!.progress).toBe(1);
  });

  it("advances to farming age when gates are met", () => {
    let state = createNewGame(9);
    state.research.unlocked = ["fire", "farming"];
    state.population.count = 18;
    state.resources = { food: 120, wood: 100, stone: 80, metal: 0, knowledge: 10 };
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

  it("depletes forest deposits when harvested", () => {
    const state = createNewGame(42);
    const wood = state.map.tiles.find((t) => t.deposit === "wood" && (t.stock ?? 0) > 0)!;
    expect(wood).toBeTruthy();
    const before = wood.stock!;
    const taken = harvestDeposit(state, wood.x, wood.y, 10);
    expect(taken).toBe(10);
    expect(wood.stock).toBe(before - 10);
  });

  it("depletes fertile land when foraged and turns it to grass when empty", () => {
    const state = createNewGame(42);
    const fertile = state.map.tiles.find((t) => t.terrain === "fertile" && !t.deposit)!;
    expect(fertile).toBeTruthy();
    expect(fertile.stock).toBeGreaterThan(0);
    const before = fertile.stock!;
    const taken = harvestDeposit(state, fertile.x, fertile.y, 10);
    expect(taken).toBe(10);
    expect(fertile.stock).toBe(before - 10);
    harvestDeposit(state, fertile.x, fertile.y, before);
    expect(fertile.terrain).toBe("grass");
    expect(fertile.stock).toBe(0);
  });

  it("places metal deposits near the spawn and advances through later ages", () => {
    let state = createNewGame(11);
    expect(state.map.tiles.some((t) => t.deposit === "metal")).toBe(true);

    state.age = "farming";
    state.research.unlocked = ["fire", "primitive_tools", "farming", "metallurgy"];
    state.population.count = 32;
    state.resources = { food: 400, wood: 400, stone: 400, metal: 400, knowledge: 400 };
    state.buildings.push({
      id: "b100",
      type: "forge",
      x: 11,
      y: 11,
      progress: 1,
      workers: 0,
    });
    expect(ageUpRequirements(state).ready).toBe(true);
    state = advanceAge(state);
    expect(state.age).toBe("metal");

    state.research.unlocked.push("steam_power");
    state.population.count = 45;
    state.resources = { food: 400, wood: 400, stone: 400, metal: 400, knowledge: 400 };
    state.buildings.push({
      id: "b101",
      type: "factory",
      x: 12,
      y: 12,
      progress: 1,
      workers: 0,
    });
    state = advanceAge(state);
    expect(state.age).toBe("industrial");

    state.research.unlocked.push("electricity", "atomic_theory");
    state.population.count = 58;
    state.resources = { food: 400, wood: 400, stone: 400, metal: 400, knowledge: 400 };
    state.buildings.push({
      id: "b102",
      type: "reactor",
      x: 13,
      y: 13,
      progress: 1,
      workers: 0,
    });
    state = advanceAge(state);
    expect(state.age).toBe("atomic");

    state.research.unlocked.push("rocketry");
    state.population.count = 72;
    state.resources = { food: 400, wood: 400, stone: 400, metal: 400, knowledge: 400 };
    state.buildings.push({
      id: "b103",
      type: "launch_pad",
      x: 14,
      y: 14,
      progress: 1,
      workers: 0,
    });
    state = advanceAge(state);
    expect(state.age).toBe("space");
    expect(state.outcome).toBe("victory");
    expect(state.stats.victoryKind).toBe("ascent");
    expect(ageUpRequirements(state).nextAge).toBeNull();
  });
});
