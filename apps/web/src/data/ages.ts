import type { AgeDef, AgeId } from "../sim/types";

export const AGE_ORDER: AgeId[] = [
  "stone",
  "farming",
  "metal",
  "industrial",
  "atomic",
  "space",
];

export function ageIndex(age: AgeId): number {
  return AGE_ORDER.indexOf(age);
}

export function ageReached(current: AgeId, required: AgeId): boolean {
  return ageIndex(current) >= ageIndex(required);
}

/** Extra housing granted per completed house by age. */
export const HOUSE_AGE_BONUS: Record<AgeId, number> = {
  stone: 0,
  farming: 1,
  metal: 2,
  industrial: 3,
  atomic: 4,
  space: 5,
};

export const AGES: Record<AgeId, AgeDef> = {
  stone: {
    id: "stone",
    name: "Stone Age",
    blurb: "Finite forests, Land Strain, hungry winters, and raiders at the treeline.",
    next: "farming",
    keyTech: "farming",
    landmark: "granary",
    minPopulation: 18,
    cost: { food: 90, wood: 80, stone: 55 },
  },
  farming: {
    id: "farming",
    name: "Farming Age",
    blurb: "Farms buy time. Choose Selective Cuts toward Harmony — or Clearcutting toward Ascent.",
    next: "metal",
    keyTech: "metallurgy",
    landmark: "forge",
    minPopulation: 32,
    cost: { food: 120, wood: 100, stone: 80, metal: 70 },
  },
  metal: {
    id: "metal",
    name: "Metal Age",
    blurb: "Ore and anvils. Fire the boilers — industry will need a living grid.",
    next: "industrial",
    keyTech: "steam_power",
    landmark: "factory",
    minPopulation: 45,
    cost: { food: 150, wood: 110, stone: 95, metal: 160, knowledge: 60, energy: 12 },
  },
  industrial: {
    id: "industrial",
    name: "Industrial Age",
    blurb: "Steam, wire, and a hungry grid. Keep Energy flowing or workshops stall.",
    next: "atomic",
    keyTech: "atomic_theory",
    landmark: "reactor",
    minPopulation: 58,
    cost: { food: 170, wood: 90, stone: 120, metal: 220, knowledge: 130, energy: 28 },
  },
  atomic: {
    id: "atomic",
    name: "Atomic Age",
    blurb: "Power and precision. The grid must hold for the launch.",
    next: "space",
    keyTech: "rocketry",
    landmark: "launch_pad",
    minPopulation: 72,
    cost: { food: 200, stone: 110, metal: 300, knowledge: 240, energy: 40 },
  },
  space: {
    id: "space",
    name: "Space Age",
    blurb: "Ascent complete — or you already chose Harmony among the living woods.",
  },
};
