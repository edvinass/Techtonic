import { BUILDINGS } from "../data/buildings";
import { TECHS } from "../data/techs";
import type { GameState, ResourceId, TechId } from "./types";

/** Aggregated modifiers from unlocked techs (branching doctrines). */
export interface TechModifiers {
  strainGainMult: number;
  woodGatherMult: number;
  regrowthMult: number;
}

export function techModifiers(state: GameState): TechModifiers {
  let strainGainMult = 1;
  let woodGatherMult = 1;
  let regrowthMult = 1;
  for (const id of state.research.unlocked) {
    const m = TECHS[id]?.modifiers;
    if (!m) continue;
    if (m.strainGainMult != null) strainGainMult *= m.strainGainMult;
    if (m.woodGatherMult != null) woodGatherMult *= m.woodGatherMult;
    if (m.regrowthMult != null) regrowthMult *= m.regrowthMult;
  }
  return { strainGainMult, woodGatherMult, regrowthMult };
}

/** Share of non-water tiles that are living forest (or wood deposits). */
export function forestCoverRatio(state: GameState): number {
  let land = 0;
  let forest = 0;
  for (const t of state.map.tiles) {
    if (t.terrain === "water") continue;
    land += 1;
    if (t.terrain === "forest" || (t.deposit === "wood" && (t.stock ?? 0) > 0)) {
      forest += 1;
    }
  }
  return land > 0 ? forest / land : 0;
}

/**
 * Fraction of completed houses within reach of a defence building.
 * Encourages clustering walls/towers around homes instead of stacking stats.
 */
export function housingDefenceCoverage(state: GameState): number {
  const houses = state.buildings.filter((b) => b.progress >= 1 && b.type === "house");
  if (houses.length === 0) return 0.55;
  const defences = state.buildings.filter(
    (b) =>
      b.progress >= 1 &&
      (b.type === "watchtower" || b.type === "palisade") &&
      (BUILDINGS[b.type]?.defenceBonus ?? 0) > 0,
  );
  if (defences.length === 0) return 0;

  let covered = 0;
  for (const h of houses) {
    const near = defences.some((d) => {
      const dist = Math.abs(d.x - h.x) + Math.abs(d.y - h.y);
      const range = d.type === "watchtower" ? 5 : 3;
      return dist <= range;
    });
    if (near) covered += 1;
  }
  return covered / houses.length;
}

export function applyStrainGain(state: GameState, resource: ResourceId, amount: number): void {
  if (amount <= 0) return;
  const mods = techModifiers(state);
  let base = 0;
  if (resource === "wood") base = amount * 0.12;
  else if (resource === "stone" || resource === "metal") base = amount * 0.035;
  if (base <= 0) return;
  state.strain = Math.min(100, state.strain + base * mods.strainGainMult);
}

export function easeStrain(state: GameState, amount: number): void {
  const mods = techModifiers(state);
  state.strain = Math.max(0, state.strain - amount * mods.regrowthMult);
}

export function strainRaidMultiplier(strain: number): number {
  // 0 → 1.0, 50 → 1.2, 100 → 1.45
  return 1 + (Math.min(100, Math.max(0, strain)) / 100) * 0.45;
}

export type HarmonyRequirements = {
  ready: boolean;
  hasTech: boolean;
  hasLandmark: boolean;
  hasPopulation: boolean;
  forestOk: boolean;
  strainOk: boolean;
  forestCover: number;
  strain: number;
};

const HARMONY_MIN_POP = 28;
const HARMONY_MIN_FOREST = 0.22;
const HARMONY_MAX_STRAIN = 28;

export function harmonyRequirements(state: GameState): HarmonyRequirements {
  const forestCover = forestCoverRatio(state);
  const hasTech = state.research.unlocked.includes("stewardship");
  const hasLandmark = state.buildings.some(
    (b) => b.type === "grove_sanctuary" && b.progress >= 1,
  );
  const hasPopulation = state.population.count >= HARMONY_MIN_POP;
  const forestOk = forestCover >= HARMONY_MIN_FOREST;
  const strainOk = state.strain <= HARMONY_MAX_STRAIN;
  return {
    ready: hasTech && hasLandmark && hasPopulation && forestOk && strainOk,
    hasTech,
    hasLandmark,
    hasPopulation,
    forestOk,
    strainOk,
    forestCover,
    strain: state.strain,
  };
}

export const HARMONY_THRESHOLDS = {
  minPopulation: HARMONY_MIN_POP,
  minForest: HARMONY_MIN_FOREST,
  maxStrain: HARMONY_MAX_STRAIN,
};

/** Whether researching `techId` is blocked by an exclusive sibling already unlocked. */
export function isTechExcluded(state: GameState, techId: TechId): boolean {
  const tech = TECHS[techId];
  if (!tech?.exclusiveWith?.length) return false;
  return tech.exclusiveWith.some((id) => state.research.unlocked.includes(id));
}
