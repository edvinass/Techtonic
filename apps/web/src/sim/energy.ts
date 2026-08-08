import { ageReached } from "../data/ages";
import { BUILDINGS } from "../data/buildings";
import { techModifiers } from "./strategy";
import type { GameState } from "./types";

/** Base battery before substations / tech bonuses. */
export const ENERGY_BATTERY_BASE = 12;

/**
 * Energy HUD / Work controls appear from the Metal Age (boilers, steam)
 * or sooner if a save already has charge on the grid.
 */
export function energyUnlocked(state: GameState): boolean {
  return ageReached(state.age, "metal") || state.resources.energy > 0.05;
}

export function energyCap(state: GameState): number {
  const mods = techModifiers(state);
  let cap = ENERGY_BATTERY_BASE + mods.energyBatteryBonus;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    cap += BUILDINGS[b.type]?.energyBattery ?? 0;
  }
  return Math.max(0, cap);
}

/** Demand from one completed building this tick (before tech use mult). */
export function buildingEnergyDemand(state: GameState, buildingId: string): number {
  const b = state.buildings.find((x) => x.id === buildingId);
  if (!b || b.progress < 1) return 0;
  const def = BUILDINGS[b.type];
  if (!def?.consumesEnergy) return 0;
  if (def.workerSlots <= 0) return def.consumesEnergy;
  return def.consumesEnergy * (b.workers / def.workerSlots);
}

export function totalEnergyDemand(state: GameState): number {
  const mods = techModifiers(state);
  let demand = 0;
  for (const b of state.buildings) {
    demand += buildingEnergyDemand(state, b.id);
  }
  return demand * mods.energyUseMult;
}

/**
 * Ideal production if fuel were unlimited (before fuel clamp).
 * Returns raw energy and wood that would be burned.
 */
export function idealEnergyProduction(state: GameState): {
  energy: number;
  woodFuel: number;
  strain: number;
} {
  const mods = techModifiers(state);
  let energy = 0;
  let woodFuel = 0;
  let strain = 0;
  for (const b of state.buildings) {
    if (b.progress < 1 || b.workers <= 0) continue;
    const def = BUILDINGS[b.type];
    if (!def?.producesEnergy) continue;
    const produced = def.producesEnergy * b.workers * mods.energyOutputMult;
    energy += produced;
    woodFuel += produced * (def.fuelWoodPerEnergy ?? 0) * mods.energyFuelMult;
    strain += produced * (def.strainPerEnergy ?? 0) * mods.energyStrainMult;
  }
  return { energy, woodFuel, strain };
}

/**
 * Tick the grid: produce (spending fuel), meet demand from battery + generation,
 * clamp surplus to battery cap, set powerFactor for consumer brownouts.
 */
export function tickEnergy(state: GameState): void {
  const mods = techModifiers(state);
  const cap = energyCap(state);
  const ideal = idealEnergyProduction(state);

  let production = ideal.energy;
  let woodFuel = ideal.woodFuel;
  let strainGain = ideal.strain;

  if (woodFuel > 0) {
    const affordable = Math.min(1, state.resources.wood / woodFuel);
    if (affordable < 1) {
      production *= affordable;
      woodFuel *= affordable;
      strainGain *= affordable;
    }
    state.resources.wood = Math.max(0, state.resources.wood - woodFuel);
  }

  if (strainGain > 0) {
    state.strain = Math.min(100, state.strain + strainGain * mods.strainGainMult);
  }

  const demand = totalEnergyDemand(state);
  const available = state.resources.energy + production;
  const consumed = Math.min(available, demand);
  const remainder = available - consumed;
  state.resources.energy = Math.min(cap, Math.max(0, remainder));

  const factor = demand <= 1e-6 ? 1 : consumed / demand;
  state.powerFactor = Math.max(0, Math.min(1, factor));

  if (state.powerFactor < 0.98 && demand > 0.05) {
    state.pressure.lastBanner = "The grid browns out — powered work slows.";
  }
}

/** Effective power for a building that may consume energy. */
export function buildingPowerFactor(state: GameState, buildingType: string): number {
  const def = BUILDINGS[buildingType];
  if (!def?.consumesEnergy) return 1;
  return state.powerFactor;
}
