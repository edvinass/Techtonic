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
    minPopulation: 14,
    cost: { food: 50, wood: 40, stone: 28 },
  },
  farming: {
    id: "farming",
    name: "Farming Age",
    blurb: "Farms buy time. Choose Selective Cuts toward Harmony — or Clearcutting toward Ascent.",
    next: "metal",
    keyTech: "metallurgy",
    landmark: "forge",
    minPopulation: 22,
    cost: { food: 55, wood: 50, stone: 42, metal: 32 },
  },
  metal: {
    id: "metal",
    name: "Metal Age",
    blurb: "Ore and anvils. Stronger tools open the road to industry.",
    next: "industrial",
    keyTech: "steam_power",
    landmark: "factory",
    minPopulation: 30,
    cost: { food: 65, wood: 55, stone: 48, metal: 70, knowledge: 20 },
  },
  industrial: {
    id: "industrial",
    name: "Industrial Age",
    blurb: "Steam and steel. Workshops hum; the atom awaits.",
    next: "atomic",
    keyTech: "atomic_theory",
    landmark: "reactor",
    minPopulation: 40,
    cost: { food: 75, wood: 45, stone: 55, metal: 95, knowledge: 42 },
  },
  atomic: {
    id: "atomic",
    name: "Atomic Age",
    blurb: "Power and precision. Reach the launch pad to win.",
    next: "space",
    keyTech: "rocketry",
    landmark: "launch_pad",
    minPopulation: 50,
    cost: { food: 85, stone: 50, metal: 120, knowledge: 85 },
  },
  space: {
    id: "space",
    name: "Space Age",
    blurb: "Ascent complete — or you already chose Harmony among the living woods.",
  },
};
