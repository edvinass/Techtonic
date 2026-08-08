import { describe, expect, it } from "vitest";
import { applyWorkerCount, workerQuota, workerTargets } from "./priorities";

describe("worker priorities", () => {
  it("treats values as absolute headcounts when they fit the population", () => {
    const priorities = {
      food: 2,
      wood: 2,
      stone: 0,
      metal: 0,
      energy: 0,
      construction: 1,
      research: 0,
      defence: 0,
      trade: 0,
    };
    expect(workerQuota(priorities, 5, "food")).toBe(2);
    expect(workerQuota(priorities, 5, "research")).toBe(0);
    expect(workerQuota(priorities, 5, "wood")).toBe(2);
  });

  it("keeps relative shares when weights exceed population (legacy saves)", () => {
    const priorities = {
      food: 0,
      wood: 100,
      stone: 0,
      metal: 0,
      energy: 0,
      construction: 0,
      research: 0,
      defence: 0,
      trade: 0,
    };
    expect(workerQuota(priorities, 5, "wood")).toBe(5);
    expect(workerQuota(priorities, 5, "food")).toBe(0);
  });

  it("clamps edits so assigned workers never exceed population", () => {
    const priorities = {
      food: 2,
      wood: 2,
      stone: 0,
      metal: 0,
      energy: 0,
      construction: 1,
      research: 0,
      defence: 0,
      trade: 0,
    };
    const next = applyWorkerCount(priorities, 5, "defence", 3);
    expect(next.defence).toBe(0);
    expect(applyWorkerCount(priorities, 5, "food", 1).food).toBe(1);
    const grown = applyWorkerCount(priorities, 6, "defence", 1);
    expect(grown.defence).toBe(1);
    expect(workerTargets(grown, 6)).toEqual({
      food: 2,
      wood: 2,
      stone: 0,
      metal: 0,
      energy: 0,
      construction: 1,
      research: 0,
      defence: 1,
      trade: 0,
    });
  });
});
