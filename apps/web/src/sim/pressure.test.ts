import { describe, expect, it } from "vitest";
import { SEASON_LENGTH } from "../data/events";
import { createNewGame, tick } from "./engine";
import {
  defenceReadiness,
  resolveEventChoice,
  seasonFoodMultiplier,
  tickPressure,
} from "./pressure";

function runTicks(state: ReturnType<typeof createNewGame>, n: number) {
  let s = state;
  for (let i = 0; i < n; i++) {
    if (s.pressure.pendingEventId) break;
    s = tick(s);
  }
  return s;
}

describe("pressure systems", () => {
  it("advances seasons after SEASON_LENGTH ticks", () => {
    let state = createNewGame(11);
    expect(state.pressure.season).toBe("spring");
    state = runTicks(state, SEASON_LENGTH);
    expect(state.pressure.season).toBe("summer");
    expect(state.pressure.lastBanner ?? "").toMatch(/Summer/i);
  });

  it("winter increases food drain via season multiplier", () => {
    const state = createNewGame(5);
    state.pressure.season = "winter";
    state.pressure.foodMult = 1;
    expect(seasonFoodMultiplier(state)).toBeGreaterThan(1);
    state.pressure.season = "autumn";
    expect(seasonFoodMultiplier(state)).toBeLessThan(1);
  });

  it("resolves raids harder when defence is low", () => {
    let state = createNewGame(21);
    state.resources.food = 80;
    state.resources.wood = 80;
    state.priorities = { food: 40, construction: 20, research: 20, production: 20, defence: 0 };
    state.pressure.nextRaidAt = state.tick + 1;
    state.pressure.raidWarningTicks = 0;
    state.pressure.eventCooldown = 999;
    state.pressure.pendingEventId = null;

    // Warning window is 6 ticks; raid resolves when warning hits 1
    state = runTicks(state, 10);
    expect(state.resources.food).toBeLessThan(80);
    expect(state.pressure.nextRaidAt).toBeGreaterThan(state.tick);
  });

  it("high defence can repel a raid", () => {
    const state = createNewGame(33);
    state.resources.food = 40;
    state.resources.wood = 40;
    state.priorities = { food: 10, construction: 10, research: 10, production: 10, defence: 60 };
    expect(defenceReadiness(state.priorities)).toBeGreaterThan(0.22);
    state.pressure.nextRaidAt = state.tick + 999;
    state.pressure.raidWarningTicks = 1;
    state.pressure.eventCooldown = 999;
    tickPressure(state);
    expect(state.pressure.lastBanner ?? "").toMatch(/driven off|Defence held/i);
    expect(state.resources.food).toBeGreaterThanOrEqual(40);
  });

  it("two-choice events apply effects and clear pause", () => {
    let state = createNewGame(8);
    state.paused = true;
    state.resources.food = 50;
    state.resources.wood = 40;
    state.pressure.pendingEventId = "poor_harvest";
    state = resolveEventChoice(state, 0);
    expect(state.pressure.pendingEventId).toBeNull();
    expect(state.paused).toBe(false);
    expect(state.resources.food).toBeLessThan(50);
    expect(state.pressure.foodMultTicks).toBeGreaterThan(0);
  });

  it("wolf watch succeeds with enough defence", () => {
    let state = createNewGame(14);
    state.resources.food = 40;
    state.priorities = { food: 20, construction: 20, research: 20, production: 20, defence: 40 };
    state.pressure.pendingEventId = "wolves";
    state = resolveEventChoice(state, 0);
    expect(state.pressure.pendingEventId).toBeNull();
    expect(state.pressure.lastBanner ?? "").toMatch(/High Defence|hold the line|Guards/i);
  });

  it("growthHaltTicks blocks population growth", () => {
    let state = createNewGame(2);
    state.resources.food = 80;
    state.population.count = 5;
    state.population.housingCap = 20;
    state.pressure.growthHaltTicks = 40;
    state.pressure.eventCooldown = 999;
    state.pressure.nextRaidAt = 9999;
    const before = state.population.count;
    state = runTicks(state, 24);
    expect(state.population.count).toBe(before);
  });
});
