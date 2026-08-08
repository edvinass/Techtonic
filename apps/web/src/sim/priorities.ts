import type { Priorities, PriorityId } from "./types";

export const PRIORITY_IDS: PriorityId[] = [
  "food",
  "construction",
  "research",
  "production",
  "defence",
];

export function priorityTotal(priorities: Priorities): number {
  return Object.values(priorities).reduce((a, b) => a + b, 0);
}

/**
 * Desired workers for a category.
 * When weights sum to ≤ population they are treated as absolute headcounts;
 * otherwise they behave as relative shares (legacy / over-assigned).
 */
export function workerQuota(priorities: Priorities, pop: number, p: PriorityId): number {
  const weight = priorities[p];
  if (weight <= 0 || pop <= 0) return 0;
  const total = priorityTotal(priorities);
  if (total <= 0) return 0;
  if (total <= pop) return Math.floor(weight);
  return Math.max(1, Math.round((pop * weight) / total));
}

/** Effective headcounts shown in the Work tab (and used when editing). */
export function workerTargets(priorities: Priorities, pop: number): Priorities {
  const total = priorityTotal(priorities);
  if (total <= 0 || pop <= 0) {
    return { food: 0, construction: 0, research: 0, production: 0, defence: 0 };
  }
  if (total <= pop) {
    return {
      food: Math.floor(priorities.food),
      construction: Math.floor(priorities.construction),
      research: Math.floor(priorities.research),
      production: Math.floor(priorities.production),
      defence: Math.floor(priorities.defence),
    };
  }
  const next = {} as Priorities;
  for (const id of PRIORITY_IDS) {
    next[id] = workerQuota(priorities, pop, id);
  }
  return next;
}

/** Set one category's desired workers; keeps the total ≤ population. */
export function applyWorkerCount(
  priorities: Priorities,
  pop: number,
  id: PriorityId,
  count: number,
): Priorities {
  const current = workerTargets(priorities, pop);
  const others = PRIORITY_IDS.filter((p) => p !== id).reduce((sum, p) => sum + current[p], 0);
  const capped = Math.max(0, Math.min(Math.floor(count), Math.max(0, pop - others)));
  return { ...current, [id]: capped };
}
