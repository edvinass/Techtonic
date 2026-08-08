import type { BuildingInstance, GameState, PriorityId, ResourceId } from "../sim/types";
import { BUILDINGS } from "../data/buildings";
import {
  carryCapacityFor,
  findResourceTile,
  gatherRateFor,
  resourceForBuilding,
  worldPos,
} from "./gather";

export type WorkKind = "gather" | "build" | "research" | "farm" | "forage" | "idle";

export type CitizenJob =
  | { kind: "idle" }
  | {
      kind: "walk";
      tx: number;
      ty: number;
      buildingId: string;
      work: WorkKind;
      phase: "toResource" | "toDropoff" | "toSite" | "wander";
      resource?: ResourceId;
      tile?: { gx: number; gy: number };
    }
  | {
      kind: "gather";
      buildingId: string;
      work: WorkKind;
      resource: ResourceId;
      tile: { gx: number; gy: number };
    }
  | {
      kind: "work";
      buildingId: string;
      work: WorkKind;
      timer: number;
    };

export interface Citizen {
  id: number;
  x: number;
  y: number;
  job: CitizenJob;
  bobPhase: number;
  carrying: ResourceId | null;
  carryAmount: number;
}

export interface CitizenStepContext {
  state: GameState;
  ox: number;
  oy: number;
  onDeposit: (resource: ResourceId, amount: number, wx: number, wy: number) => void;
  /** Called as gatherers pull finite deposits from the map */
  onHarvest?: (gx: number, gy: number, amount: number) => number;
}

function buildingById(state: GameState, id: string): BuildingInstance | undefined {
  return state.buildings.find((b) => b.id === id);
}

function workKindFor(building: BuildingInstance): WorkKind {
  if (building.progress < 1) return "build";
  const def = BUILDINGS[building.type];
  if (def.priority === "research") return "research";
  if (building.type === "farm") return "farm";
  if (def.produces) return "gather";
  return "idle";
}

interface Assignment {
  buildingId: string;
  work: WorkKind;
  resource: ResourceId | null;
}

function quota(state: GameState, p: PriorityId): number {
  const weights = state.priorities;
  if (weights[p] <= 0) return 0;
  const total = Math.max(1, Object.values(weights).reduce((a, b) => a + b, 0));
  // Round so small populations still get workers (floor made construction=0 at pop 5)
  return Math.max(1, Math.round((state.population.count * weights[p]) / total));
}

/**
 * Desired jobs from priorities + buildings (does not depend on sim tick workers,
 * which can lag a full second behind).
 */
function desiredAssignments(state: GameState): Assignment[] {
  const list: Assignment[] = [];
  let remaining = state.population.count;

  // Construction sites first — always at least one builder per unfinished building
  const sites = state.buildings.filter((b) => b.progress < 1);
  let buildSlots = Math.min(
    Math.max(sites.length, quota(state, "construction")),
    remaining,
    sites.length * 2,
  );
  for (const site of sites) {
    if (buildSlots <= 0 || remaining <= 0) break;
    const take = Math.min(2, buildSlots, remaining);
    for (let i = 0; i < take; i++) {
      list.push({ buildingId: site.id, work: "build", resource: null });
    }
    buildSlots -= take;
    remaining -= take;
  }

  const staffBuilding = (
    building: BuildingInstance,
    budget: number,
    work: WorkKind,
    resource: ResourceId | null,
  ) => {
    if (budget <= 0 || remaining <= 0 || building.progress < 1) return 0;
    const slots = BUILDINGS[building.type].workerSlots;
    const take = Math.min(slots, budget, remaining);
    for (let i = 0; i < take; i++) {
      list.push({ buildingId: building.id, work, resource });
    }
    remaining -= take;
    return take;
  };

  let researchBudget = quota(state, "research");
  let foodBudget = quota(state, "food");
  let productionBudget = quota(state, "production");

  const home = state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
  const hasLumberCamp = state.buildings.some(
    (b) => b.type === "lumber_camp" && b.progress >= 1,
  );

  // Production camps (wood/stone) first
  for (const b of state.buildings) {
    if (BUILDINGS[b.type].priority === "production") {
      const res = resourceForBuilding(b);
      if (!res) continue;
      productionBudget -= staffBuilding(b, productionBudget, "gather", res);
    }
  }

  // No lumber camp yet: production workers chop wild trees and drop off at the house
  if (!hasLumberCamp && home && productionBudget > 0) {
    const wildWood = Math.min(productionBudget, remaining, 3);
    for (let i = 0; i < wildWood; i++) {
      list.push({ buildingId: home.id, work: "forage", resource: "wood" });
      remaining -= 1;
      productionBudget -= 1;
    }
  }

  for (const b of state.buildings) {
    if (BUILDINGS[b.type].priority === "research") {
      researchBudget -= staffBuilding(b, researchBudget, "research", "knowledge");
    }
  }
  for (const b of state.buildings) {
    if (b.type === "farm") {
      foodBudget -= staffBuilding(b, foodBudget, "farm", "food");
    }
  }

  // Wild food foragers (grass only)
  const forageWanted = Math.min(Math.max(0, foodBudget), remaining);
  for (let i = 0; i < forageWanted && home; i++) {
    list.push({ buildingId: home.id, work: "forage", resource: "food" });
    remaining -= 1;
  }

  // Leftover people: prefer open production slots, then research, then farms — not more foraging
  const fillOrder = state.buildings.filter((b) => b.progress >= 1);
  fillOrder.sort((a, b) => {
    const rank = (x: BuildingInstance) => {
      const p = BUILDINGS[x.type].priority;
      if (p === "production") return 0;
      if (p === "research") return 1;
      if (x.type === "farm") return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });
  for (const b of fillOrder) {
    if (remaining <= 0) break;
    const def = BUILDINGS[b.type];
    if (def.workerSlots <= 0) continue;
    const already = list.filter((a) => a.buildingId === b.id).length;
    const room = def.workerSlots - already;
    if (room <= 0) continue;
    const work = workKindFor(b);
    const resource = resourceForBuilding(b);
    if (!resource) continue;
    const take = Math.min(room, remaining);
    for (let i = 0; i < take; i++) {
      list.push({ buildingId: b.id, work, resource });
    }
    remaining -= take;
  }

  return list;
}

function isWanderer(c: Citizen): boolean {
  return c.job.kind === "walk" && (c.job.phase === "wander" || c.job.work === "idle");
}

function isFreeForWork(c: Citizen): boolean {
  return c.carryAmount <= 0 && (c.job.kind === "idle" || isWanderer(c));
}

function isOnAssignment(c: Citizen): boolean {
  if (c.carryAmount > 0) return true;
  if (c.job.kind === "gather" || c.job.kind === "work") return true;
  if (c.job.kind === "walk" && c.job.phase !== "wander" && c.job.work !== "idle") return true;
  return false;
}

function startGatherTrip(
  c: Citizen,
  state: GameState,
  ox: number,
  oy: number,
  buildingId: string,
  work: WorkKind,
  resource: ResourceId,
): void {
  const building = buildingById(state, buildingId);
  if (!building) {
    c.job = { kind: "idle" };
    return;
  }
  const tile = findResourceTile(state, building, resource, {
    x: building.x,
    y: building.y,
  });
  if (!tile) {
    c.job = { kind: "idle" };
    return;
  }
  const pos = worldPos(tile.gx, tile.gy, ox, oy);
  // Spread workers so they don't stack; step off the building footprint when gathering on-site
  const onSite = tile.gx === building.x && tile.gy === building.y;
  const spread = onSite ? 22 : 12;
  c.carrying = null;
  c.carryAmount = 0;
  c.job = {
    kind: "walk",
    tx: pos.x + (Math.random() - 0.5) * spread + (onSite ? (c.id % 3) * 6 - 6 : 0),
    ty: pos.y + (Math.random() - 0.5) * (spread * 0.55) + (onSite ? (c.id % 2) * 4 - 2 : 0),
    buildingId,
    work,
    phase: "toResource",
    resource,
    tile,
  };
}

function startBuildTrip(
  c: Citizen,
  state: GameState,
  ox: number,
  oy: number,
  buildingId: string,
): void {
  const building = buildingById(state, buildingId);
  if (!building) {
    c.job = { kind: "idle" };
    return;
  }
  const pos = worldPos(building.x, building.y, ox, oy);
  // Ring builders around the scaffold instead of stacking inside it
  const angle = ((c.id * 2.4) % (Math.PI * 2)) + Math.random() * 0.4;
  const radius = 16 + (c.id % 3) * 5;
  c.job = {
    kind: "walk",
    tx: pos.x + Math.cos(angle) * radius,
    ty: pos.y + Math.sin(angle) * radius * 0.55,
    buildingId,
    work: "build",
    phase: "toSite",
  };
}

export function syncCitizens(
  citizens: Citizen[],
  state: GameState,
  ox: number,
  oy: number,
): void {
  const targetCount = Math.min(48, Math.max(0, state.population.count));
  const home =
    state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
  const homePos = home
    ? worldPos(home.x, home.y, ox, oy)
    : worldPos(state.map.width / 2, state.map.height / 2, ox, oy);

  while (citizens.length < targetCount) {
    const id = citizens.length ? Math.max(...citizens.map((c) => c.id)) + 1 : 0;
    citizens.push({
      id,
      x: homePos.x + (Math.random() - 0.5) * 40,
      y: homePos.y + (Math.random() - 0.5) * 20,
      job: { kind: "idle" },
      bobPhase: Math.random() * Math.PI * 2,
      carrying: null,
      carryAmount: 0,
    });
  }
  if (citizens.length > targetCount) citizens.length = targetCount;

  const assignments = desiredAssignments(state);
  const validIds = new Set(state.buildings.map((b) => b.id));

  for (const c of citizens) {
    if (c.job.kind === "idle" || isWanderer(c)) continue;
    const bid =
      c.job.kind === "walk" || c.job.kind === "gather" || c.job.kind === "work"
        ? c.job.buildingId
        : null;
    if (bid && !validIds.has(bid) && c.carryAmount <= 0) {
      c.job = { kind: "idle" };
      c.carrying = null;
    }
  }

  const keyOf = (buildingId: string, work: WorkKind) => `${buildingId}:${work}`;
  const used = new Map<string, number>();
  for (const c of citizens) {
    if (!isOnAssignment(c)) continue;
    if (c.job.kind === "walk" || c.job.kind === "gather" || c.job.kind === "work") {
      const work = c.job.work;
      if (work === "idle") continue;
      used.set(keyOf(c.job.buildingId, work), (used.get(keyOf(c.job.buildingId, work)) ?? 0) + 1);
    }
  }

  const open: Assignment[] = [];
  const needCount = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const k = keyOf(a.buildingId, a.work);
    const arr = needCount.get(k) ?? [];
    arr.push(a);
    needCount.set(k, arr);
  }
  for (const [k, arr] of needCount) {
    const have = used.get(k) ?? 0;
    for (let i = have; i < arr.length; i++) open.push(arr[i]);
  }

  // Production / gather jobs first so woodcutters leave base before foragers/wander
  open.sort((a, b) => {
    const rank = (x: Assignment) =>
      x.work === "gather" ? 0 : x.work === "farm" ? 1 : x.work === "research" ? 2 : x.work === "build" ? 3 : 4;
    return rank(a) - rank(b);
  });

  let oi = 0;
  for (const c of citizens) {
    if (!isFreeForWork(c)) continue;
    const a = open[oi++];
    if (!a) break;
    if (a.work === "build") {
      startBuildTrip(c, state, ox, oy, a.buildingId);
    } else if (a.resource) {
      startGatherTrip(c, state, ox, oy, a.buildingId, a.work, a.resource);
    }
  }

  for (const c of citizens) {
    if (c.job.kind === "idle" && c.carryAmount <= 0 && Math.random() < 0.008) {
      c.job = {
        kind: "walk",
        tx: homePos.x + (Math.random() - 0.5) * 80,
        ty: homePos.y + (Math.random() - 0.5) * 40,
        buildingId: home?.id ?? "home",
        work: "idle",
        phase: "wander",
      };
    }
  }
}

export function stepCitizens(citizens: Citizen[], dt: number, ctx: CitizenStepContext): void {
  const speed = 0.07 * dt;
  const { state, ox, oy, onDeposit, onHarvest } = ctx;
  const hasTools = state.research.unlocked.includes("primitive_tools");

  for (const c of citizens) {
    c.bobPhase += dt * 0.0045;

    if (c.job.kind === "walk") {
      const dx = c.job.tx - c.x;
      const dy = c.job.ty - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= 3.5) {
        c.x += (dx / dist) * Math.min(speed, dist);
        c.y += (dy / dist) * Math.min(speed * 0.7, dist);
        continue;
      }

      if (c.job.phase === "wander" || c.job.work === "idle") {
        c.job = { kind: "idle" };
        continue;
      }

      if (c.job.phase === "toResource" && c.job.resource && c.job.tile) {
        c.job = {
          kind: "gather",
          buildingId: c.job.buildingId,
          work: c.job.work,
          resource: c.job.resource,
          tile: c.job.tile,
        };
        c.carrying = c.job.resource;
        c.carryAmount = 0;
        continue;
      }

      if (c.job.phase === "toDropoff" && c.job.resource && c.carryAmount > 0) {
        const amount = c.carryAmount;
        const res = c.job.resource;
        const buildingId = c.job.buildingId;
        const work = c.job.work;
        onDeposit(res, amount, c.x, c.y);
        c.carryAmount = 0;
        c.carrying = null;
        if (work === "build") {
          startBuildTrip(c, state, ox, oy, buildingId);
        } else {
          startGatherTrip(c, state, ox, oy, buildingId, work, res);
        }
        continue;
      }

      if (c.job.phase === "toSite") {
        c.job = {
          kind: "work",
          buildingId: c.job.buildingId,
          work: "build",
          timer: 900 + Math.random() * 900,
        };
      }
      continue;
    }

    if (c.job.kind === "gather") {
      const isForage = c.job.work === "forage";
      const wildWood = isForage && c.job.resource === "wood";
      const depletes =
        c.job.resource === "wood" ||
        c.job.resource === "stone" ||
        c.job.resource === "metal";
      const cap = carryCapacityFor(c.job.resource, hasTools, wildWood);
      const fertileBonus =
        c.job.resource === "food" && c.job.work === "farm"
          ? (() => {
              const t = state.map.tiles[c.job.tile.gy * state.map.width + c.job.tile.gx];
              return t?.terrain === "fertile" ? 1.35 : 1;
            })()
          : 1;
      // Forage jobs are anchored to a house — don't use house produce rates
      const home =
        isForage ? null : (buildingById(state, c.job.buildingId) ?? null);
      const rate = gatherRateFor(state, home, c.job.resource, {
        hasTools,
        wild: isForage,
        fertileBonus,
      });
      const gain = (rate * dt) / 1000;

      if (depletes && onHarvest && c.job.tile) {
        const taken = onHarvest(c.job.tile.gx, c.job.tile.gy, gain);
        if (taken <= 0) {
          // Deposit exhausted — abandon and find another
          c.carryAmount = Math.max(0, c.carryAmount);
          if (c.carryAmount > 0.5) {
            const building = buildingById(state, c.job.buildingId);
            if (building) {
              const drop = worldPos(building.x, building.y, ox, oy);
              c.job = {
                kind: "walk",
                tx: drop.x,
                ty: drop.y,
                buildingId: building.id,
                work: c.job.work,
                phase: "toDropoff",
                resource: c.job.resource,
                tile: c.job.tile,
              };
              continue;
            }
          }
          startGatherTrip(c, state, ox, oy, c.job.buildingId, c.job.work, c.job.resource);
          continue;
        }
        c.carryAmount = Math.min(cap, c.carryAmount + taken);
      } else {
        c.carryAmount = Math.min(cap, c.carryAmount + gain);
      }
      c.carrying = c.job.resource;
      // Slow gather sway
      c.x += Math.sin(c.bobPhase * 0.28) * 0.02;
      c.y += Math.cos(c.bobPhase * 0.28) * 0.01;

      if (c.carryAmount >= cap - 0.001) {
        c.carryAmount = cap;
        const building = buildingById(state, c.job.buildingId);
        if (!building) {
          c.job = { kind: "idle" };
          continue;
        }
        const drop = worldPos(building.x, building.y, ox, oy);
        c.job = {
          kind: "walk",
          tx: drop.x + (Math.random() - 0.5) * 8,
          ty: drop.y + (Math.random() - 0.5) * 6,
          buildingId: building.id,
          work: c.job.work,
          phase: "toDropoff",
          resource: c.job.resource,
          tile: c.job.tile,
        };
      }
      continue;
    }

    if (c.job.kind === "work") {
      c.job.timer -= dt;
      c.x += Math.sin(c.bobPhase * 0.28) * 0.015;
      c.y += Math.cos(c.bobPhase * 0.28) * 0.008;
      if (c.job.timer <= 0) {
        const building = buildingById(state, c.job.buildingId);
        if (building && building.progress < 1) {
          startBuildTrip(c, state, ox, oy, building.id);
        } else {
          c.job = { kind: "idle" };
        }
      }
    }
  }
}
