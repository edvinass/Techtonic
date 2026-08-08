import { describe, expect, it } from "vitest";
import { createNewGame } from "../sim/engine";
import { RAID_WARN_TICKS, spawnRaiderGang, stepRaiderGang } from "./raiders";

describe("raider gang", () => {
  it("spawns when raid warning becomes active", () => {
    const state = createNewGame(42);
    state.pressure.raidWarningTicks = RAID_WARN_TICKS;

    const gang = stepRaiderGang(null, state, 16, 400, 80);
    expect(gang).not.toBeNull();
    expect(gang!.phase).toBe("approach");
    expect(gang!.raiders.length).toBeGreaterThanOrEqual(4);
    expect(gang!.t).toBeLessThan(0.15);
  });

  it("advances toward the settlement as warning counts down", () => {
    const state = createNewGame(7);
    state.pressure.raidWarningTicks = RAID_WARN_TICKS;
    let gang = spawnRaiderGang(state, 400, 80);
    const startT = gang.t;

    state.pressure.raidWarningTicks = 3;
    for (let i = 0; i < 40; i++) {
      gang = stepRaiderGang(gang, state, 50, 400, 80)!;
    }
    expect(gang.t).toBeGreaterThan(startT + 0.4);
    expect(gang.phase).toBe("approach");
  });

  it("flees after a successful defence", () => {
    const state = createNewGame(3);
    state.pressure.raidWarningTicks = 1;
    let gang = spawnRaiderGang(state, 400, 80);
    gang.lastWarning = 1;
    gang.survivedAtSpawn = state.stats.raidsSurvived;

    state.pressure.raidWarningTicks = 0;
    state.stats.raidsSurvived += 1;
    gang = stepRaiderGang(gang, state, 16, 400, 80)!;
    expect(gang.phase).toBe("flee");
    expect(gang.won).toBe(true);
  });

  it("clashes after a failed raid", () => {
    const state = createNewGame(3);
    state.pressure.raidWarningTicks = 1;
    let gang = spawnRaiderGang(state, 400, 80);
    gang.lastWarning = 1;
    gang.survivedAtSpawn = state.stats.raidsSurvived;

    state.pressure.raidWarningTicks = 0;
    state.stats.raidsFailed += 1;
    gang = stepRaiderGang(gang, state, 16, 400, 80)!;
    expect(gang.phase).toBe("clash");
    expect(gang.won).toBe(false);
  });

  it("clears after resolve animation finishes", () => {
    const state = createNewGame(9);
    state.pressure.raidWarningTicks = 1;
    let gang = spawnRaiderGang(state, 400, 80);
    gang.lastWarning = 1;
    state.pressure.raidWarningTicks = 0;
    state.stats.raidsSurvived += 1;
    gang = stepRaiderGang(gang, state, 16, 400, 80)!;

    gang = stepRaiderGang(gang, state, 2000, 400, 80);
    expect(gang).toBeNull();
  });
});
