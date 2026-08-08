import { describe, expect, it } from "vitest";
import { currentMonthName, MONTH_LENGTH, SEASON_LENGTH } from "../data/events";
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
    state.resources.food = 50_000;
    state.pressure.eventCooldown = 9999;
    state.pressure.nextRaidAt = 9999;
    expect(state.pressure.season).toBe("spring");
    expect(currentMonthName(state.pressure.season, state.pressure.seasonTick)).toBe("March");
    state = runTicks(state, MONTH_LENGTH);
    expect(state.pressure.season).toBe("spring");
    expect(currentMonthName(state.pressure.season, state.pressure.seasonTick)).toBe("April");
    state = runTicks(state, SEASON_LENGTH - MONTH_LENGTH);
    expect(state.pressure.season).toBe("summer");
    expect(currentMonthName(state.pressure.season, state.pressure.seasonTick)).toBe("June");
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
    state.priorities = {
      food: 40,
      wood: 20,
      stone: 0,
      metal: 0,
      construction: 20,
      research: 20,
      defence: 0,
      trade: 0,
    };
    state.pressure.nextRaidAt = state.tick + 1;
    state.pressure.raidWarningTicks = 0;
    state.pressure.eventCooldown = 999;
    state.pressure.pendingEventId = null;

    // Warning window is 10 ticks; allow time for warning + resolve + reschedule
    state = runTicks(state, 16);
    expect(state.resources.food).toBeLessThan(80);
    expect(state.pressure.nextRaidAt).toBeGreaterThan(state.tick);
  });

  it("high defence can repel a raid", () => {
    const state = createNewGame(33);
    state.resources.food = 40;
    state.resources.wood = 40;
    state.priorities = {
      food: 10,
      wood: 10,
      stone: 0,
      metal: 0,
      construction: 10,
      research: 10,
      defence: 60,
      trade: 0,
    };
    expect(defenceReadiness(state)).toBeGreaterThan(0.3);
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
    state.priorities = {
      food: 20,
      wood: 20,
      stone: 0,
      metal: 0,
      construction: 20,
      research: 20,
      defence: 40,
      trade: 0,
    };
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
