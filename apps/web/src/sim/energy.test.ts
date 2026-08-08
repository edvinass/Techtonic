import { describe, expect, it } from "vitest";
import { createNewGame, tick } from "./engine";
import {
  ENERGY_BATTERY_BASE,
  energyCap,
  energyUnlocked,
  idealEnergyProduction,
  tickEnergy,
  totalEnergyDemand,
} from "./energy";

function withBoiler(state: ReturnType<typeof createNewGame>, workers = 3) {
  state.buildings.push({
    id: "boiler1",
    type: "boiler_house",
    x: 10,
    y: 10,
    progress: 1,
    workers,
  });
  state.priorities.energy = workers;
  state.resources.wood = 500;
  return state;
}

describe("energy grid", () => {
  it("starts with an empty battery and full power factor", () => {
    const state = createNewGame(7);
    expect(state.resources.energy).toBe(0);
    expect(state.powerFactor).toBe(1);
    expect(energyCap(state)).toBe(ENERGY_BATTERY_BASE);
  });

  it("unlocks energy HUD from the Metal Age (or stored charge)", () => {
    const early = createNewGame(7);
    expect(energyUnlocked(early)).toBe(false);
    early.age = "farming";
    expect(energyUnlocked(early)).toBe(false);
    early.age = "metal";
    expect(energyUnlocked(early)).toBe(true);

    const charged = createNewGame(7);
    charged.resources.energy = 1;
    expect(energyUnlocked(charged)).toBe(true);
  });

  it("fills the battery from staffed boilers and burns wood fuel", () => {
    let state = createNewGame(7);
    state = withBoiler(state, 3);
    const woodBefore = state.resources.wood;
    // Bypass assignWorkers by calling tickEnergy directly with workers already set
    tickEnergy(state);
    expect(state.resources.energy).toBeGreaterThan(0);
    expect(state.resources.energy).toBeLessThanOrEqual(energyCap(state));
    expect(state.resources.wood).toBeLessThan(woodBefore);
    expect(state.powerFactor).toBe(1);
  });

  it("caps surplus at battery capacity", () => {
    let state = createNewGame(7);
    state = withBoiler(state, 3);
    for (let i = 0; i < 40; i++) tickEnergy(state);
    expect(state.resources.energy).toBeCloseTo(energyCap(state), 5);
  });

  it("browns out when demand exceeds supply and battery", () => {
    let state = createNewGame(7);
    state.buildings.push({
      id: "lab1",
      type: "laboratory",
      x: 12,
      y: 12,
      progress: 1,
      workers: 4,
    });
    state.resources.energy = 0;
    tickEnergy(state);
    expect(totalEnergyDemand(state)).toBeGreaterThan(0);
    expect(state.powerFactor).toBeLessThan(1);
    expect(state.resources.energy).toBe(0);
  });

  it("keeps workshops powered when boilers cover demand", () => {
    let state = createNewGame(7);
    state = withBoiler(state, 3);
    state.buildings.push({
      id: "shop1",
      type: "workshop",
      x: 11,
      y: 11,
      progress: 1,
      workers: 2,
    });
    // Fill battery first
    for (let i = 0; i < 10; i++) tickEnergy(state);
    tickEnergy(state);
    expect(state.powerFactor).toBeGreaterThan(0.95);
  });

  it("grid wiring and high voltage raise battery and output", () => {
    let state = createNewGame(7);
    state = withBoiler(state, 3);
    state.buildings.push({
      id: "sub1",
      type: "substation",
      x: 14,
      y: 14,
      progress: 1,
      workers: 0,
    });
    const baseCap = energyCap(state);
    const baseOut = idealEnergyProduction(state).energy;

    state.research.unlocked.push("grid_wiring", "high_voltage");
    expect(energyCap(state)).toBeGreaterThan(baseCap);
    expect(idealEnergyProduction(state).energy).toBeGreaterThan(baseOut);
    expect(totalEnergyDemand(state)).toBeLessThan(
      // same substation drain * use mult < unboosted
      0.12,
    );
  });

  it("engine tick applies energy after staffing", () => {
    let state = createNewGame(11);
    state.population.count = 12;
    state.priorities = {
      food: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      energy: 3,
      construction: 0,
      research: 0,
      defence: 0,
      trade: 0,
    };
    state.buildings.push({
      id: "boiler1",
      type: "boiler_house",
      x: 10,
      y: 10,
      progress: 1,
      workers: 0,
    });
    state.resources.wood = 200;
    state = tick(state);
    const boiler = state.buildings.find((b) => b.id === "boiler1");
    expect(boiler?.workers).toBe(3);
    expect(state.resources.energy).toBeGreaterThan(0);
  });

  it("cooling towers cut fuel burn and energy strain", () => {
    let state = createNewGame(7);
    state = withBoiler(state, 3);
    const before = idealEnergyProduction(state);
    state.research.unlocked.push("cooling_towers");
    const after = idealEnergyProduction(state);
    expect(after.energy).toBeGreaterThan(before.energy);
    expect(after.woodFuel / after.energy).toBeLessThan(before.woodFuel / before.energy);
    expect(after.strain / after.energy).toBeLessThan(before.strain / before.energy);
  });
});
