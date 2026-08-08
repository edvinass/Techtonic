import type { Priorities, PriorityId } from "./types";

export const PRIORITY_IDS: PriorityId[] = [
  "food",
  "wood",
  "stone",
  "metal",
  "construction",
  "research",
  "defence",
];

export function emptyPriorities(): Priorities {
  return {
    food: 0,
    wood: 0,
    stone: 0,
    metal: 0,
    construction: 0,
    research: 0,
    defence: 0,
  };
}

/** Normalize priorities from saves / HMR; maps legacy `production` → `wood`. */
export function normalizePriorities(
  raw: Partial<Priorities> & { production?: number },
): Priorities {
  const next = emptyPriorities();
  next.food = raw.food ?? 0;
  next.construction = raw.construction ?? 0;
  next.research = raw.research ?? 0;
  next.defence = raw.defence ?? 0;
  next.stone = raw.stone ?? 0;
  next.metal = raw.metal ?? 0;
  if (!("wood" in raw) && typeof raw.production === "number") {
    next.wood = raw.production;
  } else {
    next.wood = raw.wood ?? 0;
  }
  return next;
}

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
    return emptyPriorities();
  }
  if (total <= pop) {
    const next = emptyPriorities();
    for (const id of PRIORITY_IDS) {
      next[id] = Math.floor(priorities[id]);
    }
    return next;
  }
  const next = emptyPriorities();
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
