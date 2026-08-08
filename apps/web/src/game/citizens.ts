import type { BuildingInstance, GameState, ResourceId } from "../sim/types";
import { BUILDINGS } from "../data/buildings";
import {
  carryCapacityFor,
  findResourceTile,
  GATHER_PER_SEC,
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
  /** Resource currently carried */
  carrying: ResourceId | null;
  carryAmount: number;
}

export interface CitizenStepContext {
  state: GameState;
  ox: number;
  oy: number;
  onDeposit: (resource: ResourceId, amount: number, wx: number, wy: number) => void;
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

function desiredAssignments(state: GameState): Assignment[] {
  const list: Assignment[] = [];

  for (const b of state.buildings) {
    if (b.progress < 1) {
      const n = Math.max(1, Math.min(3, Math.ceil(state.priorities.construction / 30)));
      for (let i = 0; i < n; i++) {
        list.push({ buildingId: b.id, work: "build", resource: null });
      }
      continue;
    }
    const work = workKindFor(b);
    const resource = resourceForBuilding(b);
    for (let i = 0; i < b.workers; i++) {
      list.push({ buildingId: b.id, work, resource });
    }
  }

  // Foragers: food-priority people not already on farms
  const farmWorkers = list.filter((a) => a.work === "farm").length;
  const foodQuota = Math.floor(
    (state.population.count * state.priorities.food) /
      Math.max(1, Object.values(state.priorities).reduce((a, b) => a + b, 0)),
  );
  const forageCount = Math.max(0, foodQuota - farmWorkers);
  const home = state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
  for (let i = 0; i < forageCount && home; i++) {
    list.push({ buildingId: home.id, work: "forage", resource: "food" });
  }

  return list;
}

function isBusyGatherer(c: Citizen): boolean {
  return (
    c.job.kind === "gather" ||
    c.job.kind === "work" ||
    (c.job.kind === "walk" && c.job.phase !== "wander")
  );
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
  const tile = findResourceTile(state, building, resource);
  if (!tile) {
    c.job = { kind: "idle" };
    return;
  }
  const pos = worldPos(tile.gx, tile.gy, ox, oy);
  c.carrying = null;
  c.carryAmount = 0;
  c.job = {
    kind: "walk",
    tx: pos.x + (Math.random() - 0.5) * 10,
    ty: pos.y + (Math.random() - 0.5) * 6,
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
  c.job = {
    kind: "walk",
    tx: pos.x + (Math.random() - 0.5) * 14,
    ty: pos.y + (Math.random() - 0.5) * 8,
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

  // Cancel jobs for missing buildings (unless carrying — finish dropoff first)
  for (const c of citizens) {
    if (c.job.kind === "idle") continue;
    const bid =
      c.job.kind === "walk" || c.job.kind === "gather" || c.job.kind === "work"
        ? c.job.buildingId
        : null;
    if (bid && !validIds.has(bid) && c.carryAmount <= 0) {
      c.job = { kind: "idle" };
      c.carrying = null;
    }
  }

  const taken = citizens.filter(isBusyGatherer).length;
  const need = Math.max(0, assignments.length - taken);

  // Count current assignments per building+work
  const used = new Map<string, number>();
  const keyOf = (buildingId: string, work: WorkKind) => `${buildingId}:${work}`;
  for (const c of citizens) {
    if (!isBusyGatherer(c)) continue;
    if (c.job.kind === "walk" || c.job.kind === "gather" || c.job.kind === "work") {
      const work = c.job.work;
      if (work === "idle") continue;
      const k = keyOf(c.job.buildingId, work);
      used.set(k, (used.get(k) ?? 0) + 1);
    }
  }

  const open: Assignment[] = [];
  const needCount = new Map<string, number>();
  for (const a of assignments) {
    const k = keyOf(a.buildingId, a.work);
    needCount.set(k, (needCount.get(k) ?? 0) + 1);
  }
  for (const [k, n] of needCount) {
    const have = used.get(k) ?? 0;
    const [buildingId, work] = k.split(":") as [string, WorkKind];
    const sample = assignments.find(
      (a) => a.buildingId === buildingId && a.work === work,
    );
    for (let i = have; i < n; i++) {
      open.push(
        sample ?? {
          buildingId,
          work,
          resource: work === "forage" ? "food" : null,
        },
      );
    }
  }

  let oi = 0;
  for (const c of citizens) {
    if (c.job.kind !== "idle" || c.carryAmount > 0) continue;
    const a = open[oi++];
    if (!a) break;
    if (a.work === "build") {
      startBuildTrip(c, state, ox, oy, a.buildingId);
    } else if (a.resource) {
      startGatherTrip(c, state, ox, oy, a.buildingId, a.work, a.resource);
    }
  }

  void need;

  for (const c of citizens) {
    if (c.job.kind === "idle" && c.carryAmount <= 0 && Math.random() < 0.012) {
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
  const speed = 0.058 * dt;
  const { state, ox, oy, onDeposit } = ctx;
  const hasTools = state.research.unlocked.includes("primitive_tools");

  for (const c of citizens) {
    c.bobPhase += dt * 0.014;

    if (c.job.kind === "walk") {
      const dx = c.job.tx - c.x;
      const dy = c.job.ty - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= 3.5) {
        c.x += (dx / dist) * Math.min(speed, dist);
        c.y += (dy / dist) * Math.min(speed * 0.65, dist);
        continue;
      }

      // Arrived
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
      const cap = carryCapacityFor(c.job.resource, hasTools);
      const rate = GATHER_PER_SEC[c.job.resource] * (hasTools ? 1.15 : 1);
      c.carryAmount = Math.min(cap, c.carryAmount + (rate * dt) / 1000);
      c.carrying = c.job.resource;
      // Work animation jitter
      c.x += Math.sin(c.bobPhase * 2.4) * 0.12;
      c.y += Math.cos(c.bobPhase * 2.4) * 0.06;

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
      c.x += Math.sin(c.bobPhase * 2.2) * 0.1;
      c.y += Math.cos(c.bobPhase * 2.2) * 0.05;
      if (c.job.timer <= 0) {
        // Resume building or idle
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
