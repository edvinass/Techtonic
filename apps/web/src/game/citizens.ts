import type { BuildingInstance, GameState, PriorityId, ResourceId } from "../sim/types";
import type { SavedCitizen } from "../sim/serialize";
import { BUILDINGS } from "../data/buildings";
import { workerQuota } from "../sim/priorities";
import {
  carryCapacityFor,
  findResourceTile,
  gatherRateFor,
  resourceForBuilding,
  worldPos,
} from "./gather";
import {
  findPath,
  isWalkable,
  nearestWalkable,
  worldToGrid,
  type GridPos,
} from "./pathfinding";

export type WorkKind =
  | "gather"
  | "build"
  | "research"
  | "farm"
  | "forage"
  | "defend"
  | "idle";

const RESOURCES: ResourceId[] = ["food", "wood", "stone", "metal", "knowledge"];
const WORK_KINDS: WorkKind[] = [
  "gather",
  "build",
  "research",
  "farm",
  "forage",
  "defend",
  "idle",
];

export type CitizenJob =
  | { kind: "idle" }
  | {
      kind: "walk";
      tx: number;
      ty: number;
      /** Remaining world-space waypoints (next hop first); routes around water/rock */
      path: { x: number; y: number }[];
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

function isResourceId(v: unknown): v is ResourceId {
  return typeof v === "string" && (RESOURCES as string[]).includes(v);
}

function isWorkKind(v: unknown): v is WorkKind {
  return typeof v === "string" && (WORK_KINDS as string[]).includes(v);
}

function parseJob(raw: unknown): CitizenJob {
  if (!raw || typeof raw !== "object") return { kind: "idle" };
  const j = raw as Record<string, unknown>;
  if (j.kind === "idle") return { kind: "idle" };

  if (j.kind === "gather") {
    const tile = j.tile as { gx?: unknown; gy?: unknown } | undefined;
    if (
      typeof j.buildingId === "string" &&
      isWorkKind(j.work) &&
      isResourceId(j.resource) &&
      tile &&
      typeof tile.gx === "number" &&
      typeof tile.gy === "number"
    ) {
      return {
        kind: "gather",
        buildingId: j.buildingId,
        work: j.work,
        resource: j.resource,
        tile: { gx: tile.gx, gy: tile.gy },
      };
    }
    return { kind: "idle" };
  }

  if (j.kind === "work") {
    if (
      typeof j.buildingId === "string" &&
      isWorkKind(j.work) &&
      typeof j.timer === "number"
    ) {
      return {
        kind: "work",
        buildingId: j.buildingId,
        work: j.work,
        timer: j.timer,
      };
    }
    return { kind: "idle" };
  }

  if (j.kind === "walk") {
    const path = Array.isArray(j.path)
      ? j.path
          .filter(
            (p): p is { x: number; y: number } =>
              !!p &&
              typeof p === "object" &&
              typeof (p as { x: unknown }).x === "number" &&
              typeof (p as { y: unknown }).y === "number",
          )
          .map((p) => ({ x: p.x, y: p.y }))
      : [];
    const tile = j.tile as { gx?: unknown; gy?: unknown } | undefined;
    const phase = j.phase;
    if (
      typeof j.tx === "number" &&
      typeof j.ty === "number" &&
      typeof j.buildingId === "string" &&
      isWorkKind(j.work) &&
      (phase === "toResource" ||
        phase === "toDropoff" ||
        phase === "toSite" ||
        phase === "wander")
    ) {
      const job: CitizenJob = {
        kind: "walk",
        tx: j.tx,
        ty: j.ty,
        path: path.length ? path : [{ x: j.tx, y: j.ty }],
        buildingId: j.buildingId,
        work: j.work,
        phase,
      };
      if (isResourceId(j.resource)) job.resource = j.resource;
      if (tile && typeof tile.gx === "number" && typeof tile.gy === "number") {
        job.tile = { gx: tile.gx, gy: tile.gy };
      }
      return job;
    }
    return { kind: "idle" };
  }

  return { kind: "idle" };
}

/** Snapshot live citizens for cloud saves. */
export function snapshotCitizens(citizens: Citizen[]): SavedCitizen[] {
  return citizens.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    bobPhase: c.bobPhase,
    carrying: c.carrying,
    carryAmount: c.carryAmount,
    job: structuredClone(c.job),
  }));
}

/** Restore citizens from a save payload (positions + jobs). */
export function hydrateCitizens(saved: SavedCitizen[]): Citizen[] {
  return saved.map((s, i) => {
    const carrying =
      s.carrying != null && isResourceId(s.carrying) ? s.carrying : null;
    const carryAmount =
      typeof s.carryAmount === "number" && s.carryAmount > 0 && carrying
        ? s.carryAmount
        : 0;
    return {
      id: typeof s.id === "number" ? s.id : i,
      x: typeof s.x === "number" ? s.x : 0,
      y: typeof s.y === "number" ? s.y : 0,
      bobPhase: typeof s.bobPhase === "number" ? s.bobPhase : Math.random() * Math.PI * 2,
      carrying: carryAmount > 0 ? carrying : null,
      carryAmount,
      job: parseJob(s.job),
    };
  });
}

export interface CitizenStepContext {
  state: GameState;
  ox: number;
  oy: number;
  onDeposit: (resource: ResourceId, amount: number, wx: number, wy: number) => void;
  /** Called as gatherers pull finite deposits from the map */
  onHarvest?: (gx: number, gy: number, amount: number) => number;
  /** Builder on-site hammering — advances scaffold progress */
  onBuild?: (buildingId: string, amount: number) => void;
}

function buildingById(state: GameState, id: string): BuildingInstance | undefined {
  return state.buildings.find((b) => b.id === id);
}

/** Nearest completed stockpile (or house fallback) to a map tile. */
export function findNearestDropoff(
  state: GameState,
  gx: number,
  gy: number,
): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDist = Infinity;
  for (const b of state.buildings) {
    if (b.progress < 1 || !BUILDINGS[b.type]?.acceptsDropoff) continue;
    const dist = Math.abs(b.x - gx) + Math.abs(b.y - gy);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }
  if (best) return best;
  return (
    state.buildings.find((b) => b.type === "house" && b.progress >= 1) ??
    state.buildings.find((b) => b.progress >= 1) ??
    null
  );
}

/** Prefer a ring/spread world point; snap to nearest walkable if it lands on rock/water. */
function walkableStandPoint(
  state: GameState,
  ox: number,
  oy: number,
  near: GridPos,
  preferred: { x: number; y: number },
): { x: number; y: number; tile: GridPos } {
  const prefGrid = worldToGrid(preferred.x, preferred.y, ox, oy);
  if (isWalkable(state, prefGrid.x, prefGrid.y)) {
    return { x: preferred.x, y: preferred.y, tile: prefGrid };
  }
  const safe = nearestWalkable(state, prefGrid) ?? nearestWalkable(state, near);
  if (!safe) return { x: preferred.x, y: preferred.y, tile: near };
  const p = worldPos(safe.x, safe.y, ox, oy);
  return { x: p.x, y: p.y, tile: safe };
}

function routeWalk(
  c: Citizen,
  state: GameState,
  ox: number,
  oy: number,
  dest: { x: number; y: number },
  goalTile?: GridPos | null,
): { tx: number; ty: number; path: { x: number; y: number }[] } | null {
  const from = worldToGrid(c.x, c.y, ox, oy);
  const start = nearestWalkable(state, from) ?? from;
  const rawGoal = goalTile ?? worldToGrid(dest.x, dest.y, ox, oy);
  // Rock goals (quarries) are allowed; if unreachable, stand on nearest walkable
  let cells = findPath(state, start, rawGoal);
  if (!cells.length) {
    const alt = nearestWalkable(state, rawGoal);
    if (alt) cells = findPath(state, start, alt);
  }
  if (!cells.length) return null;

  const path: { x: number; y: number }[] = [];
  for (let i = 1; i < cells.length; i++) {
    const p = worldPos(cells[i].x, cells[i].y, ox, oy);
    path.push(p);
  }
  // Final hop uses the exact world dest only when that cell is standable
  // (or the allowed rock goal). Prevents ring offsets from dragging onto rock
  // and fighting the stranded-citizen nudge every frame.
  const last = cells[cells.length - 1];
  const lastWorld = worldPos(last.x, last.y, ox, oy);
  const destGrid = worldToGrid(dest.x, dest.y, ox, oy);
  const end = isWalkable(state, destGrid.x, destGrid.y, rawGoal)
    ? dest
    : lastWorld;
  if (path.length) {
    path[path.length - 1] = { x: end.x, y: end.y };
  } else {
    path.push({ x: end.x, y: end.y });
  }
  return { tx: end.x, ty: end.y, path };
}

function startDropoffTrip(
  c: Citizen,
  state: GameState,
  ox: number,
  oy: number,
  workBuildingId: string,
  work: WorkKind,
  resource: ResourceId,
  tile?: { gx: number; gy: number },
): void {
  const from =
    tile ??
    (() => {
      const workSite = buildingById(state, workBuildingId);
      return workSite ? { gx: workSite.x, gy: workSite.y } : { gx: 0, gy: 0 };
    })();
  const dropoff = findNearestDropoff(state, from.gx, from.gy);
  if (!dropoff) {
    c.job = { kind: "idle" };
    return;
  }
  const drop = worldPos(dropoff.x, dropoff.y, ox, oy);
  const dest = {
    x: drop.x + (Math.random() - 0.5) * 8,
    y: drop.y + (Math.random() - 0.5) * 6,
  };
  const routed = routeWalk(c, state, ox, oy, dest, { x: dropoff.x, y: dropoff.y });
  if (!routed) {
    c.job = { kind: "idle" };
    return;
  }
  c.job = {
    kind: "walk",
    ...routed,
    buildingId: workBuildingId,
    work,
    phase: "toDropoff",
    resource,
    tile,
  };
}

interface Assignment {
  buildingId: string;
  work: WorkKind;
  resource: ResourceId | null;
}

function quota(state: GameState, p: PriorityId): number {
  return workerQuota(state.priorities, state.population.count, p);
}

/**
 * Desired jobs from priorities + buildings (does not depend on sim tick workers,
 * which can lag a full second behind).
 */
function desiredAssignments(state: GameState): Assignment[] {
  const list: Assignment[] = [];
  let remaining = state.population.count;

  // Construction only when Work → Build assigns workers (no auto floor).
  const sites = state.buildings.filter((b) => b.progress < 1);
  let buildSlots = Math.min(
    quota(state, "construction"),
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
  let woodBudget = quota(state, "wood");
  let stoneBudget = quota(state, "stone");
  let metalBudget = quota(state, "metal");
  let defenceBudget = quota(state, "defence");

  const home = state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
  const hasLumberCamp = state.buildings.some(
    (b) => b.type === "lumber_camp" && b.progress >= 1,
  );
  const hasResearchBuilding = state.buildings.some(
    (b) => BUILDINGS[b.type].priority === "research" && b.progress >= 1,
  );

  // Match sim assignWorkers order: research before resource camps so Work-tab
  // Research quotas actually produce visible scholars on the map.
  for (const b of state.buildings) {
    if (BUILDINGS[b.type].priority === "research") {
      researchBudget -= staffBuilding(b, researchBudget, "research", "knowledge");
    }
  }
  // No research hut yet: scholars study at home so Research workers still appear.
  if (!hasResearchBuilding && home && researchBudget > 0) {
    const scholars = Math.min(researchBudget, remaining, 3);
    for (let i = 0; i < scholars; i++) {
      list.push({ buildingId: home.id, work: "research", resource: "knowledge" });
      remaining -= 1;
      researchBudget -= 1;
    }
  }

  for (const b of state.buildings) {
    if (b.type === "farm") {
      foodBudget -= staffBuilding(b, foodBudget, "farm", "food");
    }
  }

  for (const b of state.buildings) {
    const res = resourceForBuilding(b);
    if (res === "wood") {
      woodBudget -= staffBuilding(b, woodBudget, "gather", "wood");
    } else if (res === "stone") {
      stoneBudget -= staffBuilding(b, stoneBudget, "gather", "stone");
    } else if (res === "metal") {
      metalBudget -= staffBuilding(b, metalBudget, "gather", "metal");
    }
  }

  // No lumber camp yet: wood workers chop wild trees and drop off at the house
  if (!hasLumberCamp && home && woodBudget > 0) {
    const wildWood = Math.min(woodBudget, remaining, 3);
    for (let i = 0; i < wildWood; i++) {
      list.push({ buildingId: home.id, work: "forage", resource: "wood" });
      remaining -= 1;
      woodBudget -= 1;
    }
  }

  // Guards man completed watchtowers (before forage so Defence quota isn't eaten)
  for (const b of state.buildings) {
    if (b.type === "watchtower") {
      defenceBudget -= staffBuilding(b, defenceBudget, "defend", null);
    }
  }

  // Wild food foragers (fertile land only)
  const forageWanted = Math.min(Math.max(0, foodBudget), remaining);
  for (let i = 0; i < forageWanted && home; i++) {
    list.push({ buildingId: home.id, work: "forage", resource: "food" });
    remaining -= 1;
  }

  // Leave anyone else idle — Work-tab quotas are hard caps, not soft targets.
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
  const dest = {
    x: pos.x + (Math.random() - 0.5) * spread + (onSite ? (c.id % 3) * 6 - 6 : 0),
    y: pos.y + (Math.random() - 0.5) * (spread * 0.55) + (onSite ? (c.id % 2) * 4 - 2 : 0),
  };
  const routed = routeWalk(c, state, ox, oy, dest, { x: tile.gx, y: tile.gy });
  c.carrying = null;
  c.carryAmount = 0;
  if (!routed) {
    c.job = { kind: "idle" };
    return;
  }
  c.job = {
    kind: "walk",
    ...routed,
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
  // Stand on walkable ground next to the scaffold (quarries sit on rock)
  const site = { x: building.x, y: building.y };
  const standTile = nearestWalkable(state, site) ?? site;
  const pos = worldPos(standTile.x, standTile.y, ox, oy);
  // Ring builders around the scaffold instead of stacking inside it
  const angle = ((c.id * 2.4) % (Math.PI * 2)) + Math.random() * 0.4;
  const radius = 16 + (c.id % 3) * 5;
  const preferred = {
    x: pos.x + Math.cos(angle) * radius,
    y: pos.y + Math.sin(angle) * radius * 0.55,
  };
  const stand = walkableStandPoint(state, ox, oy, standTile, preferred);
  const routed = routeWalk(c, state, ox, oy, stand, stand.tile);
  if (!routed) {
    c.job = { kind: "idle" };
    return;
  }
  c.job = {
    kind: "walk",
    ...routed,
    buildingId,
    work: "build",
    phase: "toSite",
  };
}

/** Send a guard to stand watch near a completed tower. */
function startDefendTrip(
  c: Citizen,
  state: GameState,
  ox: number,
  oy: number,
  buildingId: string,
): void {
  const building = buildingById(state, buildingId);
  if (!building || building.progress < 1 || building.type !== "watchtower") {
    c.job = { kind: "idle" };
    return;
  }
  const site = { x: building.x, y: building.y };
  const standTile = nearestWalkable(state, site) ?? site;
  const pos = worldPos(standTile.x, standTile.y, ox, oy);
  // Post at the tower base — offset by id so two guards don't stack
  const angle = ((c.id * 2.1) % (Math.PI * 2)) + Math.random() * 0.35;
  const radius = 10 + (c.id % 2) * 4;
  const preferred = {
    x: pos.x + Math.cos(angle) * radius,
    y: pos.y + Math.sin(angle) * radius * 0.55 - 6,
  };
  const stand = walkableStandPoint(state, ox, oy, standTile, preferred);
  const routed = routeWalk(c, state, ox, oy, stand, stand.tile);
  if (!routed) {
    c.job = { kind: "idle" };
    return;
  }
  c.carrying = null;
  c.carryAmount = 0;
  c.job = {
    kind: "walk",
    ...routed,
    buildingId,
    work: "defend",
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

  // Nudge anyone stranded on water/rock back onto land (except quarry work on rock)
  for (const c of citizens) {
    const g = worldToGrid(c.x, c.y, ox, oy);
    if (isWalkable(state, g.x, g.y)) continue;
    const workingRock =
      (c.job.kind === "gather" && c.job.tile.gx === g.x && c.job.tile.gy === g.y) ||
      (c.job.kind === "walk" &&
        c.job.tile &&
        c.job.tile.gx === g.x &&
        c.job.tile.gy === g.y);
    if (workingRock) continue;
    const safe = nearestWalkable(state, g);
    if (safe) {
      const p = worldPos(safe.x, safe.y, ox, oy);
      c.x = p.x;
      c.y = p.y;
    }
  }

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

  // After load: carriers with a broken/idle job resume drop-off so haul isn't stranded
  for (const c of citizens) {
    if (c.carryAmount <= 0 || !c.carrying || c.job.kind !== "idle") continue;
    const dropBuilding =
      state.buildings.find((b) => b.progress >= 1 && BUILDINGS[b.type]?.acceptsDropoff) ??
      home;
    if (!dropBuilding || !c.carrying) continue;
    startDropoffTrip(
      c,
      state,
      ox,
      oy,
      dropBuilding.id,
      "gather",
      c.carrying,
    );
  }

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

  // Include resource so wild-wood forage and food forage on the house don't collide.
  const keyOf = (buildingId: string, work: WorkKind, resource: ResourceId | null) =>
    `${buildingId}:${work}:${resource ?? "-"}`;

  const needByKey = new Map<string, number>();
  const needCount = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const k = keyOf(a.buildingId, a.work, a.resource);
    needByKey.set(k, (needByKey.get(k) ?? 0) + 1);
    const arr = needCount.get(k) ?? [];
    arr.push(a);
    needCount.set(k, arr);
  }

  const claimed = new Map<string, number>();
  const jobKey = (c: Citizen): string | null => {
    if (c.job.kind !== "walk" && c.job.kind !== "gather" && c.job.kind !== "work") return null;
    if (c.job.work === "idle") return null;
    const resource =
      c.job.kind === "gather"
        ? c.job.resource
        : c.job.kind === "walk"
          ? (c.job.resource ?? null)
          : null;
    return keyOf(c.job.buildingId, c.job.work, resource);
  };

  // Keep carriers finishing drop-off; demote everyone else whose job is no longer needed.
  for (const c of citizens) {
    if (!isOnAssignment(c)) continue;
    const k = jobKey(c);
    if (!k) continue;
    if (c.carryAmount > 0) {
      claimed.set(k, (claimed.get(k) ?? 0) + 1);
      continue;
    }
    const have = claimed.get(k) ?? 0;
    const need = needByKey.get(k) ?? 0;
    if (have >= need) {
      c.job = { kind: "idle" };
      c.carrying = null;
    } else {
      claimed.set(k, have + 1);
    }
  }

  const open: Assignment[] = [];
  for (const [k, arr] of needCount) {
    const have = claimed.get(k) ?? 0;
    for (let i = have; i < arr.length; i++) open.push(arr[i]);
  }

  // Research first so scholars claim free villagers before wood/forage fills the roster
  open.sort((a, b) => {
    const rank = (x: Assignment) =>
      x.work === "research"
        ? 0
        : x.work === "defend"
          ? 1
          : x.work === "gather"
            ? 2
            : x.work === "farm"
              ? 3
              : x.work === "build"
                ? 4
                : 5;
    return rank(a) - rank(b);
  });

  let oi = 0;
  for (const c of citizens) {
    if (!isFreeForWork(c)) continue;
    const a = open[oi++];
    if (!a) break;
    if (a.work === "build") {
      startBuildTrip(c, state, ox, oy, a.buildingId);
    } else if (a.work === "defend") {
      startDefendTrip(c, state, ox, oy, a.buildingId);
    } else if (a.resource) {
      startGatherTrip(c, state, ox, oy, a.buildingId, a.work, a.resource);
    }
  }

  for (const c of citizens) {
    if (c.job.kind === "idle" && c.carryAmount <= 0 && Math.random() < 0.008) {
      const anchor = home
        ? { x: home.x, y: home.y }
        : worldToGrid(homePos.x, homePos.y, ox, oy);
      let destTile: GridPos | null = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const gx = anchor.x + Math.floor((Math.random() - 0.5) * 6);
        const gy = anchor.y + Math.floor((Math.random() - 0.5) * 6);
        const spot = nearestWalkable(state, { x: gx, y: gy }, 3);
        if (spot) {
          destTile = spot;
          break;
        }
      }
      if (!destTile) continue;
      const pos = worldPos(destTile.x, destTile.y, ox, oy);
      const dest = {
        x: pos.x + (Math.random() - 0.5) * 10,
        y: pos.y + (Math.random() - 0.5) * 6,
      };
      const routed = routeWalk(c, state, ox, oy, dest, destTile);
      if (!routed) continue;
      c.job = {
        kind: "walk",
        ...routed,
        buildingId: home?.id ?? "home",
        work: "idle",
        phase: "wander",
      };
    }
  }
}

export function stepCitizens(citizens: Citizen[], dt: number, ctx: CitizenStepContext): void {
  const speed = 0.07 * dt;
  const { state, ox, oy, onDeposit, onHarvest, onBuild } = ctx;
  const hasTools = state.research.unlocked.includes("primitive_tools");

  for (const c of citizens) {
    // Walk cycle needs a quicker cadence or legs lag and they look like they float
    c.bobPhase += dt * (c.job.kind === "walk" ? 0.013 : 0.0045);

    if (c.job.kind === "walk") {
      const hop = c.job.path[0] ?? { x: c.job.tx, y: c.job.ty };
      const dx = hop.x - c.x;
      const dy = hop.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= 3.5) {
        c.x += (dx / dist) * Math.min(speed, dist);
        c.y += (dy / dist) * Math.min(speed * 0.7, dist);
        continue;
      }
      if (c.job.path.length > 0) {
        c.job.path.shift();
        if (c.job.path.length > 0) continue;
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
        // Idle so syncCitizens can reassign from current Work quotas
        // (avoids restarting wood trips after Gather was set to 0).
        if (work === "build") {
          startBuildTrip(c, state, ox, oy, buildingId);
        } else {
          c.job = { kind: "idle" };
        }
        continue;
      }

      if (c.job.phase === "toSite") {
        if (c.job.work === "defend") {
          c.job = {
            kind: "work",
            buildingId: c.job.buildingId,
            work: "defend",
            timer: 4200 + Math.random() * 2800,
          };
        } else {
          c.job = {
            kind: "work",
            buildingId: c.job.buildingId,
            work: "build",
            timer: 2800 + Math.random() * 2200,
          };
        }
      }
      continue;
    }

    if (c.job.kind === "gather") {
      const isForage = c.job.work === "forage";
      const wildWood = isForage && c.job.resource === "wood";
      const depletes =
        c.job.resource === "wood" ||
        c.job.resource === "stone" ||
        c.job.resource === "metal" ||
        (c.job.resource === "food" && isForage);
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
            startDropoffTrip(
              c,
              state,
              ox,
              oy,
              c.job.buildingId,
              c.job.work,
              c.job.resource,
              c.job.tile,
            );
            continue;
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
        startDropoffTrip(
          c,
          state,
          ox,
          oy,
          c.job.buildingId,
          c.job.work,
          c.job.resource,
          c.job.tile,
        );
      }
      continue;
    }

    if (c.job.kind === "work") {
      const building = buildingById(state, c.job.buildingId);

      if (c.job.work === "defend") {
        if (!building || building.progress < 1 || building.type !== "watchtower") {
          c.job = { kind: "idle" };
          continue;
        }
        // Slow watch-post sway; periodically re-post around the tower
        c.x += Math.sin(c.bobPhase * 0.18) * 0.018;
        c.y += Math.cos(c.bobPhase * 0.16) * 0.01;
        c.job.timer -= dt;
        if (c.job.timer <= 0) {
          startDefendTrip(c, state, ox, oy, building.id);
        }
        continue;
      }

      if (!building || building.progress >= 1 || c.job.work !== "build") {
        c.job = { kind: "idle" };
        continue;
      }
      const def = BUILDINGS[building.type];
      // One on-site builder fills the scaffold in buildTicks seconds of work time
      if (onBuild && def) {
        onBuild(building.id, (dt / 1000) / def.buildTicks);
      }
      c.job.timer -= dt;
      c.x += Math.sin(c.bobPhase * 0.28) * 0.015;
      c.y += Math.cos(c.bobPhase * 0.28) * 0.008;
      if (c.job.timer <= 0) {
        if (building.progress < 1) {
          startBuildTrip(c, state, ox, oy, building.id);
        } else {
          c.job = { kind: "idle" };
        }
      }
    }
  }
}
