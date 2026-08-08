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
    blurb: "Forage, chop, and kindle the first spark of civilization.",
    next: "farming",
    keyTech: "farming",
    landmark: "granary",
    minPopulation: 12,
    cost: { food: 40, wood: 30, stone: 20 },
  },
  farming: {
    id: "farming",
    name: "Farming Age",
    blurb: "Farms unlock. Houses shelter more people. Dig for metal next.",
    next: "metal",
    keyTech: "metallurgy",
    landmark: "forge",
    minPopulation: 20,
    cost: { food: 40, wood: 40, stone: 35, metal: 25 },
  },
  metal: {
    id: "metal",
    name: "Metal Age",
    blurb: "Ore and anvils. Stronger tools open the road to industry.",
    next: "industrial",
    keyTech: "steam_power",
    landmark: "factory",
    minPopulation: 28,
    cost: { food: 50, wood: 50, stone: 40, metal: 55, knowledge: 15 },
  },
  industrial: {
    id: "industrial",
    name: "Industrial Age",
    blurb: "Steam and steel. Workshops hum; the atom awaits.",
    next: "atomic",
    keyTech: "atomic_theory",
    landmark: "reactor",
    minPopulation: 36,
    cost: { food: 60, wood: 40, stone: 50, metal: 80, knowledge: 35 },
  },
  atomic: {
    id: "atomic",
    name: "Atomic Age",
    blurb: "Power and precision. The sky is no longer a ceiling.",
    next: "space",
    keyTech: "rocketry",
    landmark: "launch_pad",
    minPopulation: 45,
    cost: { food: 70, stone: 40, metal: 100, knowledge: 70 },
  },
  space: {
    id: "space",
    name: "Space Age",
    blurb: "Your people reach for the stars. The long climb is complete.",
  },
};
