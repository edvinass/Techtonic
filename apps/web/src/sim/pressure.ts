import { CHALLENGE_EVENTS, getEventDef, SEASON_INFO, SEASON_LENGTH, SEASON_ORDER } from "../data/events";
import type { EventEffect } from "../data/events";
import { BUILDINGS } from "../data/buildings";
import { ageIndex } from "../data/ages";
import { createRng } from "./rng";
import { housingDefenceCoverage, strainRaidMultiplier } from "./strategy";
import type { GameState, Priorities } from "./types";

export function defaultPressure(seed: number): GameState["pressure"] {
  return {
    season: "spring",
    seasonTick: 0,
    // First raid after the opening settlement has some footing
    nextRaidAt: 110 + (seed % 50),
    raidWarningTicks: 0,
    pendingEventId: null,
    eventCooldown: 55,
    growthHaltTicks: 0,
    foodMult: 1,
    foodMultTicks: 0,
    lastBanner: null,
  };
}

/** Priority share + completed defence buildings. */
export function defenceReadiness(state: GameState | Priorities): number {
  // Back-compat: tests sometimes pass priorities alone
  if (!("buildings" in state)) {
    const priorities = state as Priorities;
    const total = Math.max(1, Object.values(priorities).reduce((a, b) => a + b, 0));
    return priorities.defence / total;
  }
  const gs = state as GameState;
  const total = Math.max(1, Object.values(gs.priorities).reduce((a, b) => a + b, 0));
  let ready = gs.priorities.defence / total;
  for (const b of gs.buildings) {
    if (b.progress < 1) continue;
    ready += BUILDINGS[b.type]?.defenceBonus ?? 0;
  }
  // Staffed towers punch above empty shells
  const towerStaff = gs.buildings
    .filter((b) => b.progress >= 1 && b.type === "watchtower")
    .reduce((s, b) => s + b.workers, 0);
  ready += towerStaff * 0.04;
  // Coverage of houses by nearby walls/towers — placement matters
  ready += housingDefenceCoverage(gs) * 0.14;
  return Math.min(1, ready);
}

function clampRes(state: GameState): void {
  for (const k of Object.keys(state.resources) as (keyof GameState["resources"])[]) {
    state.resources[k] = Math.max(0, state.resources[k]);
  }
  state.population.count = Math.max(1, state.population.count);
}

/** Burn nearby forest tiles (wildfire). Mutates map. */
export function burnForests(state: GameState, count: number): number {
  const forests = state.map.tiles.filter(
    (t) => t.terrain === "forest" || t.deposit === "wood",
  );
  const rng = createRng(state.rngSeed + state.tick * 41);
  let burned = 0;
  for (let i = 0; i < count && forests.length; i++) {
    const pick = forests.splice(Math.floor(rng() * forests.length), 1)[0];
    if (!pick) break;
    pick.terrain = "grass";
    pick.deposit = null;
    pick.stock = 0;
    pick.elev = Math.min(pick.elev ?? 1, 1);
    burned += 1;
  }
  return burned;
}

export function applyEffect(state: GameState, effect: EventEffect, defenceBoost = false): string {
  if (effect.resources) {
    for (const [k, v] of Object.entries(effect.resources)) {
      const key = k as keyof GameState["resources"];
      let amount = v ?? 0;
      // Standing watch with good defence softens food loss
      if (defenceBoost && amount < 0 && key === "food") {
        amount = Math.ceil(amount * 0.35);
      }
      state.resources[key] += amount;
    }
  }
  if (effect.knowledgeDelta) {
    state.resources.knowledge = Math.max(0, state.resources.knowledge + effect.knowledgeDelta);
  }
  if (effect.popDelta) {
    state.population.count = Math.max(1, state.population.count + effect.popDelta);
  }
  if (effect.growthHaltTicks) {
    state.pressure.growthHaltTicks = Math.max(
      state.pressure.growthHaltTicks,
      effect.growthHaltTicks,
    );
  }
  if (effect.foodMult && effect.foodMultTicks) {
    state.pressure.foodMult = effect.foodMult;
    state.pressure.foodMultTicks = effect.foodMultTicks;
  }
  if (effect.burnForests) {
    const n = burnForests(state, effect.burnForests);
    if (n > 0) {
      // appended to result below
    }
  }
  if (effect.strainDelta) {
    state.strain = Math.max(0, Math.min(100, state.strain + effect.strainDelta));
  }
  clampRes(state);

  let result = effect.result;
  if (defenceBoost) {
    result += " High Defence kept losses light.";
  }
  if (effect.burnForests) {
    result += ` ${effect.burnForests} wooded stands scarred.`;
  }
  return result;
}

export function resolveEventChoice(state: GameState, choiceIndex: 0 | 1): GameState {
  const next = structuredClone(state);
  const id = next.pressure.pendingEventId;
  if (!id) return state;
  const def = getEventDef(id);
  if (!def) {
    next.pressure.pendingEventId = null;
    return next;
  }
  const choice = def.choices[choiceIndex];
  const isWatch = id === "wolves" && choiceIndex === 0;
  const ready = defenceReadiness(next);
  const defenceBoost = isWatch && ready >= 0.22;

  if (isWatch && !defenceBoost) {
    // Failed watch — worse than the mild default
    next.resources.food = Math.max(0, next.resources.food - 22);
    next.resources.wood = Math.max(0, next.resources.wood - 12);
    if (next.population.count > 3) next.population.count -= 1;
    next.pressure.lastBanner = "The watch was thin. Wolves scatter the stores — a villager is lost.";
  } else {
    next.pressure.lastBanner = applyEffect(next, choice.effect, defenceBoost);
  }

  next.pressure.pendingEventId = null;
  next.pressure.eventCooldown = 70 + Math.floor(ready * 35);
  next.paused = next.outcome !== "playing" ? true : false;
  return next;
}

/** Advance seasons, raids, and maybe spawn a challenge event. Mutates `state`. */
export function tickPressure(state: GameState): void {
  const p = state.pressure;
  if (state.outcome !== "playing") return;

  // Don't stack systems while a choice is open
  if (p.pendingEventId) {
    state.paused = true;
    return;
  }

  if (p.foodMultTicks > 0) {
    p.foodMultTicks -= 1;
    if (p.foodMultTicks <= 0) {
      p.foodMult = 1;
      p.foodMultTicks = 0;
    }
  }
  if (p.growthHaltTicks > 0) p.growthHaltTicks -= 1;
  if (p.eventCooldown > 0) p.eventCooldown -= 1;

  // Seasons
  p.seasonTick += 1;
  if (p.seasonTick >= SEASON_LENGTH) {
    p.seasonTick = 0;
    const idx = SEASON_ORDER.indexOf(p.season);
    p.season = SEASON_ORDER[(idx + 1) % SEASON_ORDER.length];
    p.lastBanner = `${SEASON_INFO[p.season].label} arrives. ${SEASON_INFO[p.season].blurb}`;
  }

  // Raid schedule: warn for several ticks, then resolve when the counter hits 0.
  // Interval shrinks and damage rises with age — late game is much less forgiving.
  if (p.raidWarningTicks > 0) {
    p.raidWarningTicks -= 1;
    if (p.raidWarningTicks === 0) {
      resolveRaid(state);
      const rng = createRng(state.rngSeed + state.tick * 17);
      const ageScale = 100 - ageIndex(state.age) * 12;
      p.nextRaidAt = state.tick + Math.max(28, ageScale) + Math.floor(rng() * 40);
    }
  } else if (state.tick >= p.nextRaidAt) {
    p.raidWarningTicks = 10;
    p.lastBanner = "Scouts spot a raiding pack approaching… raise Defence and man the towers!";
  }

  // Challenge events — more frequent as ages advance; strained lands invite wildfire
  const eventChance = 0.16 + ageIndex(state.age) * 0.065 + (state.strain >= 55 ? 0.14 : 0);
  if (p.eventCooldown <= 0 && state.tick > 40 && state.tick % 8 === 0) {
    const rng = createRng(state.rngSeed + state.tick * 31);
    if (rng() < eventChance) {
      let pool = CHALLENGE_EVENTS;
      if (state.strain >= 55) {
        const strained = CHALLENGE_EVENTS.filter(
          (e) => e.id === "wildfire" || e.id === "scarred_land",
        );
        // Bias toward land-stress events when Strain is high
        if (strained.length && rng() < 0.6) pool = strained;
      }
      const def = pool[Math.floor(rng() * pool.length)];
      p.pendingEventId = def.id;
      state.paused = true;
      p.lastBanner = `Challenge: ${def.title}`;
    }
  }

  // Spontaneous dieback when strain is extreme — the map itself rebels
  if (state.strain >= 80 && state.tick % 20 === 0) {
    const burned = burnForests(state, 2);
    if (burned > 0) {
      state.strain = Math.max(0, state.strain - 4);
      p.lastBanner = `Land Strain cracks the woods — ${burned} stands die back. Ease the axe or the world will.`;
    }
  }
}

function resolveRaid(state: GameState): void {
  const ready = defenceReadiness(state);
  const rng = createRng(state.rngSeed + state.tick * 13);
  const coverage = housingDefenceCoverage(state);
  const ageHarsh = 1 + ageIndex(state.age) * 0.28;
  const harsh = ageHarsh * strainRaidMultiplier(state.strain) * (1.25 - coverage * 0.45);

  if (ready >= 0.3) {
    const spoils = 2 + Math.floor(rng() * 3);
    state.resources.food += spoils;
    state.stats.raidsSurvived += 1;
    const coverNote = coverage >= 0.7 ? " Covered homes held firm." : "";
    state.pressure.lastBanner = `Raiders driven off! Scavenged +${spoils} food. Defences held.${coverNote}`;
  } else if (ready >= 0.18) {
    const foodLoss = Math.floor((16 + Math.floor(rng() * 12)) * harsh);
    const woodLoss = Math.floor((10 + Math.floor(rng() * 10)) * harsh);
    state.resources.food = Math.max(0, state.resources.food - foodLoss);
    state.resources.wood = Math.max(0, state.resources.wood - woodLoss);
    state.stats.raidsFailed += 1;
    state.pressure.lastBanner = `Raid blunted but costly (−${foodLoss} food, −${woodLoss} wood).`;
  } else {
    const foodLoss = Math.floor((28 + Math.floor(rng() * 16)) * harsh);
    const woodLoss = Math.floor((18 + Math.floor(rng() * 14)) * harsh);
    state.resources.food = Math.max(0, state.resources.food - foodLoss);
    state.resources.wood = Math.max(0, state.resources.wood - woodLoss);
    state.stats.raidsFailed += 1;
    const popChance = coverage < 0.35 ? 0.78 : 0.52;
    if (state.population.count > 3 && rng() < popChance) {
      const lost = rng() < 0.35 && state.population.count > 5 ? 2 : 1;
      state.population.count -= lost;
      state.pressure.lastBanner = `Brutal raid! −${foodLoss} food, −${woodLoss} wood, and ${lost} villager${lost > 1 ? "s" : ""} lost.`;
    } else {
      state.pressure.lastBanner = `Raid tears through camp (−${foodLoss} food, −${woodLoss} wood). Fortify near homes!`;
    }
  }
}

export function seasonFoodMultiplier(state: GameState): number {
  return SEASON_INFO[state.pressure.season].foodMult * state.pressure.foodMult;
}
