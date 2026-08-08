import { AGES } from "../data/ages";
import { BUILDINGS } from "../data/buildings";
import { TECHS } from "../data/techs";
import { generateMap } from "./mapgen";
import type {
  AgeId,
  BuildingId,
  GameState,
  Priorities,
  PriorityId,
  Resources,
  TechId,
  Tile,
} from "./types";

const MAP_SIZE = 32;
const FOOD_PER_CITIZEN = 0.15;
const GROWTH_FOOD_BUFFER = 5;
let nextBuildingSeq = 1;

function defaultPriorities(): Priorities {
  return { food: 30, construction: 20, research: 20, production: 25, defence: 5 };
}

function tileAt(state: GameState, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return undefined;
  return state.map.tiles[y * state.map.width + x];
}

function occupied(state: GameState, x: number, y: number): boolean {
  return state.buildings.some((b) => b.x === x && b.y === y);
}

function recalcHousing(state: GameState): number {
  let cap = 4;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    const def = BUILDINGS[b.type];
    if (def?.housing) {
      const ageBonus = state.age === "farming" && b.type === "house" ? 1 : 0;
      cap += def.housing + ageBonus;
    }
  }
  return cap;
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (Object.keys(cost) as (keyof Resources)[]).every(
    (k) => resources[k] >= (cost[k] ?? 0),
  );
}

function spend(resources: Resources, cost: Partial<Resources>): void {
  for (const key of Object.keys(cost) as (keyof Resources)[]) {
    resources[key] -= cost[key] ?? 0;
  }
}

export function createNewGame(seed = Date.now() % 1_000_000): GameState {
  nextBuildingSeq = 1;
  const tiles = generateMap(MAP_SIZE, MAP_SIZE, seed);
  const cx = Math.floor(MAP_SIZE / 2);
  const cy = Math.floor(MAP_SIZE / 2);

  const state: GameState = {
    schemaVersion: 1,
    tick: 0,
    age: "stone",
    resources: { food: 40, wood: 50, stone: 20, metal: 0, knowledge: 8 },
    priorities: defaultPriorities(),
    map: { width: MAP_SIZE, height: MAP_SIZE, tiles },
    buildings: [
      {
        id: `b${nextBuildingSeq++}`,
        type: "house",
        x: cx,
        y: cy,
        progress: 1,
        workers: 0,
      },
    ],
    population: { count: 5, housingCap: 8 },
    research: { unlocked: [], active: null },
    rngSeed: seed,
    paused: false,
  };
  state.population.housingCap = recalcHousing(state);
  return state;
}

export function isBuildingUnlocked(state: GameState, type: BuildingId): boolean {
  const def = BUILDINGS[type];
  if (!def) return false;

  if (def.requiresTech && !state.research.unlocked.includes(def.requiresTech)) {
    return false;
  }

  // Farm only after entering Farming Age
  if (type === "farm") {
    return state.age === "farming";
  }

  // Granary landmark can be built in Stone once Farming tech is researched
  if (type === "granary") {
    return state.research.unlocked.includes("farming");
  }

  return def.ages.includes(state.age) || def.ages.includes("stone");
}

export function canPlaceBuilding(
  state: GameState,
  type: BuildingId,
  x: number,
  y: number,
): { ok: true } | { ok: false; reason: string } {
  const def = BUILDINGS[type];
  if (!def) return { ok: false, reason: "Unknown building" };
  if (!isBuildingUnlocked(state, type)) return { ok: false, reason: "Not unlocked yet" };
  const tile = tileAt(state, x, y);
  if (!tile) return { ok: false, reason: "Out of bounds" };
  if (tile.terrain === "water") return { ok: false, reason: "Cannot build on water" };
  if (occupied(state, x, y)) return { ok: false, reason: "Tile occupied" };
  if (def.requiresDeposit && tile.deposit !== def.requiresDeposit) {
    return { ok: false, reason: `Needs ${def.requiresDeposit} deposit` };
  }
  if (!canAfford(state.resources, def.cost)) return { ok: false, reason: "Not enough resources" };
  return { ok: true };
}

export function placeBuilding(state: GameState, type: BuildingId, x: number, y: number): GameState {
  const check = canPlaceBuilding(state, type, x, y);
  if (!check.ok) return state;
  const def = BUILDINGS[type];
  const next = cloneState(state);
  spend(next.resources, def.cost);
  next.buildings.push({
    id: `b${nextBuildingSeq++}`,
    type,
    x,
    y,
    progress: 0,
    workers: 0,
  });
  return next;
}

export function setPriorities(state: GameState, priorities: Priorities): GameState {
  const next = cloneState(state);
  next.priorities = { ...priorities };
  return next;
}

export function setPaused(state: GameState, paused: boolean): GameState {
  const next = cloneState(state);
  next.paused = paused;
  return next;
}

export function isTechAvailable(state: GameState, techId: TechId): boolean {
  const tech = TECHS[techId];
  if (!tech) return false;
  if (state.research.unlocked.includes(techId)) return false;
  return tech.requires.every((r) => state.research.unlocked.includes(r));
}

export function startResearch(state: GameState, techId: TechId): GameState {
  if (!isTechAvailable(state, techId)) return state;
  if (state.research.active) return state;
  const tech = TECHS[techId];
  if (state.resources.knowledge < tech.costKnowledge) return state;
  const next = cloneState(state);
  next.resources.knowledge -= tech.costKnowledge;
  next.research.active = { techId, progress: 0 };
  return next;
}

export function ageUpRequirements(state: GameState): {
  ready: boolean;
  hasTech: boolean;
  hasLandmark: boolean;
  hasPopulation: boolean;
  canPay: boolean;
  nextAge: AgeId | null;
} {
  const age = AGES[state.age];
  if (!age?.next) {
    return {
      ready: false,
      hasTech: false,
      hasLandmark: false,
      hasPopulation: false,
      canPay: false,
      nextAge: null,
    };
  }
  const hasTech = !!age.keyTech && state.research.unlocked.includes(age.keyTech);
  const hasLandmark =
    !!age.landmark &&
    state.buildings.some((b) => b.type === age.landmark && b.progress >= 1);
  const hasPopulation = state.population.count >= (age.minPopulation ?? 0);
  const canPay = canAfford(state.resources, age.cost ?? {});
  return {
    ready: hasTech && hasLandmark && hasPopulation && canPay,
    hasTech,
    hasLandmark,
    hasPopulation,
    canPay,
    nextAge: age.next,
  };
}

export function advanceAge(state: GameState): GameState {
  const req = ageUpRequirements(state);
  if (!req.ready || !req.nextAge) return state;
  const age = AGES[state.age];
  const next = cloneState(state);
  spend(next.resources, age.cost ?? {});
  next.age = req.nextAge;
  next.population.housingCap = recalcHousing(next);
  return next;
}

function assignWorkers(state: GameState): {
  constructionWorkers: number;
  foragers: number;
} {
  for (const b of state.buildings) b.workers = 0;

  const weights = state.priorities;
  const totalWeight = Math.max(
    1,
    Object.values(weights).reduce((a, b) => a + b, 0),
  );
  const pop = state.population.count;
  const quota = (p: PriorityId) => Math.floor((pop * weights[p]) / totalWeight);

  let remaining = pop;
  const complete = state.buildings.filter((b) => b.progress >= 1);

  const staff = (priority: PriorityId, budget: number) => {
    const buildings = complete.filter((b) => BUILDINGS[b.type].priority === priority);
    let left = budget;
    for (const b of buildings) {
      const slots = BUILDINGS[b.type].workerSlots;
      const take = Math.min(slots, left, remaining);
      b.workers = take;
      left -= take;
      remaining -= take;
    }
  };

  staff("research", quota("research"));
  staff("food", quota("food"));
  staff("production", quota("production"));

  // Fill remaining open slots
  for (const b of complete) {
    const def = BUILDINGS[b.type];
    if (def.workerSlots <= 0) continue;
    const room = def.workerSlots - b.workers;
    const take = Math.min(room, remaining);
    b.workers += take;
    remaining -= take;
  }

  const constructionWorkers = Math.min(quota("construction"), remaining);
  remaining -= constructionWorkers;
  const foragers = Math.min(quota("food"), remaining);

  return { constructionWorkers, foragers };
}

export function tick(state: GameState): GameState {
  if (state.paused) return state;
  const next = cloneState(state);
  next.tick += 1;
  const { constructionWorkers } = assignWorkers(next);

  // Wood / stone / food / knowledge from gather buildings are delivered by
  // workers walking to resource tiles and depositing carry loads (see game/citizens).
  // Keep a tiny knowledge trickle so Fire can be started before a research hut.
  next.resources.knowledge += 0.04 + next.population.count * 0.015;

  next.resources.food -= next.population.count * FOOD_PER_CITIZEN;
  const starving = next.resources.food < 0;
  if (starving) next.resources.food = 0;

  if (constructionWorkers > 0) {
    const sites = next.buildings.filter((b) => b.progress < 1);
    if (sites.length > 0) {
      const per = constructionWorkers / sites.length;
      for (const b of sites) {
        const def = BUILDINGS[b.type];
        b.progress = Math.min(1, b.progress + per / def.buildTicks);
      }
    }
  }

  if (next.research.active) {
    const tech = TECHS[next.research.active.techId];
    const researchWorkers = next.buildings
      .filter((b) => b.progress >= 1 && BUILDINGS[b.type].priority === "research")
      .reduce((sum, b) => sum + b.workers, 0);
    const rate = 0.45 + researchWorkers * 0.5;
    next.research.active.progress += rate / tech.researchTicks;
    if (next.research.active.progress >= 1) {
      next.research.unlocked.push(next.research.active.techId);
      next.research.active = null;
    }
  }

  next.population.housingCap = recalcHousing(next);
  if (
    !starving &&
    next.resources.food >= GROWTH_FOOD_BUFFER &&
    next.population.count < next.population.housingCap &&
    next.tick % 8 === 0
  ) {
    next.population.count += 1;
    next.resources.food -= 2;
  }

  return next;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function getBuildableTypes(state: GameState): BuildingId[] {
  return (Object.keys(BUILDINGS) as BuildingId[]).filter((id) => isBuildingUnlocked(state, id));
}

export function syncBuildingSeq(state: GameState): void {
  let max = 0;
  for (const b of state.buildings) {
    const m = /^b(\d+)$/.exec(b.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  nextBuildingSeq = max + 1;
}
