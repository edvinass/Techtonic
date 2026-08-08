/**
 * Central pacing / difficulty knobs.
 * Target: typical Ascent victory ≈ 2 hours of unpaused play,
 * with pressure and costs rising by age.
 */
import type { AgeId } from "../sim/types";
import { ageIndex } from "./ages";

/** Base food drain per citizen per tick (before season / storage / age). */
export const FOOD_PER_CITIZEN = 0.22;

/** Minimum food stock required before a villager can be born. */
export const GROWTH_FOOD_BUFFER = 18;

/** Food spent when a villager is born. */
export const GROWTH_FOOD_COST = 8;

/** Population can grow at most once every N ticks. */
export const GROWTH_INTERVAL = 85;

/** Continuous starvation ticks before a villager dies. */
export const STARVE_DEATH_TICKS = 22;

/**
 * Age hunger curve — late ages demand more food per mouth.
 * Stone 1.00 → Space 1.60
 */
export function foodAgeMultiplier(age: AgeId): number {
  return 1 + ageIndex(age) * 0.12;
}

/** Passive knowledge drip before research buildings are staffed. */
export function knowledgeTrickle(population: number): number {
  return 0.01 + population * 0.003;
}
