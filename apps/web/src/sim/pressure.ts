import { CHALLENGE_EVENTS, getEventDef, SEASON_INFO, SEASON_LENGTH, SEASON_ORDER } from "../data/events";
import type { EventEffect } from "../data/events";
import { createRng } from "./rng";
import type { GameState, Priorities } from "./types";

export function defaultPressure(seed: number): GameState["pressure"] {
  return {
    season: "spring",
    seasonTick: 0,
    nextRaidAt: 55 + (seed % 40),
    raidWarningTicks: 0,
    pendingEventId: null,
    eventCooldown: 35,
    growthHaltTicks: 0,
    foodMult: 1,
    foodMultTicks: 0,
    lastBanner: null,
  };
}

export function defenceReadiness(priorities: Priorities): number {
  const total = Math.max(1, Object.values(priorities).reduce((a, b) => a + b, 0));
  return priorities.defence / total;
}

function clampRes(state: GameState): void {
  for (const k of Object.keys(state.resources) as (keyof GameState["resources"])[]) {
    state.resources[k] = Math.max(0, state.resources[k]);
  }
  state.population.count = Math.max(1, state.population.count);
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
  clampRes(state);

  let result = effect.result;
  if (defenceBoost) {
    result += " High Defence kept losses light.";
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
  const ready = defenceReadiness(next.priorities);
  const defenceBoost = isWatch && ready >= 0.18;

  if (isWatch && !defenceBoost) {
    // Failed watch — worse than the mild default
    next.resources.food = Math.max(0, next.resources.food - 16);
    next.resources.wood = Math.max(0, next.resources.wood - 8);
    next.pressure.lastBanner = "The watch was thin. Wolves scatter the stores.";
  } else {
    next.pressure.lastBanner = applyEffect(next, choice.effect, defenceBoost);
  }

  next.pressure.pendingEventId = null;
  next.pressure.eventCooldown = 45 + Math.floor(ready * 20);
  next.paused = false;
  return next;
}

/** Advance seasons, raids, and maybe spawn a challenge event. Mutates `state`. */
export function tickPressure(state: GameState): void {
  const p = state.pressure;

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

  // Raid schedule: warn for several ticks, then resolve when the counter hits 0
  if (p.raidWarningTicks > 0) {
    p.raidWarningTicks -= 1;
    if (p.raidWarningTicks === 0) {
      resolveRaid(state);
      const rng = createRng(state.rngSeed + state.tick * 17);
      p.nextRaidAt = state.tick + 70 + Math.floor(rng() * 50);
    }
  } else if (state.tick >= p.nextRaidAt) {
    p.raidWarningTicks = 6;
    p.lastBanner = "Scouts spot a raiding pack approaching… raise Defence!";
  }

  // Challenge events
  if (p.eventCooldown <= 0 && state.tick > 25 && state.tick % 7 === 0) {
    const rng = createRng(state.rngSeed + state.tick * 31);
    if (rng() < 0.22) {
      const def = CHALLENGE_EVENTS[Math.floor(rng() * CHALLENGE_EVENTS.length)];
      p.pendingEventId = def.id;
      state.paused = true;
      p.lastBanner = `Challenge: ${def.title}`;
    }
  }
}

function resolveRaid(state: GameState): void {
  const ready = defenceReadiness(state.priorities);
  const rng = createRng(state.rngSeed + state.tick * 13);
  if (ready >= 0.22) {
    const spoils = 3 + Math.floor(rng() * 5);
    state.resources.food += spoils;
    state.pressure.lastBanner = `Raiders driven off! Scavenged +${spoils} food. Defence held.`;
  } else if (ready >= 0.12) {
    const foodLoss = 10 + Math.floor(rng() * 8);
    const woodLoss = 6 + Math.floor(rng() * 6);
    state.resources.food = Math.max(0, state.resources.food - foodLoss);
    state.resources.wood = Math.max(0, state.resources.wood - woodLoss);
    state.pressure.lastBanner = `Raid blunted but costly (−${foodLoss} food, −${woodLoss} wood).`;
  } else {
    const foodLoss = 18 + Math.floor(rng() * 12);
    const woodLoss = 12 + Math.floor(rng() * 10);
    state.resources.food = Math.max(0, state.resources.food - foodLoss);
    state.resources.wood = Math.max(0, state.resources.wood - woodLoss);
    if (state.population.count > 3 && rng() < 0.35) {
      state.population.count -= 1;
      state.pressure.lastBanner = `Brutal raid! −${foodLoss} food, −${woodLoss} wood, and a villager is lost.`;
    } else {
      state.pressure.lastBanner = `Raid tears through camp (−${foodLoss} food, −${woodLoss} wood). Raise Defence!`;
    }
  }
}

export function seasonFoodMultiplier(state: GameState): number {
  return SEASON_INFO[state.pressure.season].foodMult * state.pressure.foodMult;
}
