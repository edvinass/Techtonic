import { AGES, HOUSE_AGE_BONUS, ageReached } from "../data/ages";
import {
  FOOD_PER_CITIZEN,
  GROWTH_FOOD_BUFFER,
  GROWTH_FOOD_COST,
  GROWTH_INTERVAL,
  STARVE_DEATH_TICKS,
  foodAgeMultiplier,
  knowledgeTrickle,
} from "../data/balance";
import { BUILDINGS } from "../data/buildings";
import { TECHS } from "../data/techs";
import { DEPOSIT_STOCK, generateMap } from "./mapgen";
import { defaultPressure, seasonFoodMultiplier, tickPressure } from "./pressure";
import { workerQuota } from "./priorities";
import {
  applyStrainGain,
  easeStrain,
  harmonyRequirements,
  isTechExcluded,
  techModifiers,
} from "./strategy";
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

const MAP_SIZE = 36;
let nextBuildingSeq = 1;

/** Starting headcounts for a village of 5. */
function defaultPriorities(): Priorities {
  return { food: 2, construction: 1, research: 0, production: 2, defence: 0 };
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
  const houseBonus = HOUSE_AGE_BONUS[state.age] ?? 0;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    const def = BUILDINGS[b.type];
    if (def?.housing) {
      const ageBonus = b.type === "house" ? houseBonus : 0;
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

export function foodStorageMultiplier(state: GameState): number {
  let bonus = 0;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    bonus += BUILDINGS[b.type]?.foodStorageBonus ?? 0;
  }
  // Each storehouse / granary softens winter & event drain
  return Math.max(0.72, 1 - bonus);
}

export function createNewGame(seed = Date.now() % 1_000_000): GameState {
  nextBuildingSeq = 1;
  const tiles = generateMap(MAP_SIZE, MAP_SIZE, seed);
  const cx = Math.floor(MAP_SIZE / 2);
  const cy = Math.floor(MAP_SIZE / 2);

  const state: GameState = {
    schemaVersion: 4,
    tick: 0,
    age: "stone",
    resources: { food: 48, wood: 40, stone: 16, metal: 0, knowledge: 4 },
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
    pressure: defaultPressure(seed),
    rngSeed: seed,
    paused: false,
    outcome: "playing",
    starvationTicks: 0,
    stats: { peakPop: 5, raidsSurvived: 0, raidsFailed: 0, woodHarvested: 0 },
    strain: 0,
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

  // Current age's advancement landmark can be placed once its tech is ready
  const ageDef = AGES[state.age];
  if (def.isLandmark && ageDef?.landmark === type) {
    return true;
  }

  // Available from the earliest listed age onward (ages[0] is the unlock age)
  return ageReached(state.age, def.ages[0]);
}

export function canPlaceBuilding(
  state: GameState,
  type: BuildingId,
  x: number,
  y: number,
): { ok: true } | { ok: false; reason: string } {
  if (state.outcome !== "playing") return { ok: false, reason: "Game over" };
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
  // Farms prefer fertile soil (still allow grass)
  if (type === "farm" && tile.terrain !== "fertile" && tile.terrain !== "grass") {
    return { ok: false, reason: "Farms need grass or fertile soil" };
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
  if (isTechExcluded(state, techId)) return false;
  return tech.requires.every((r) => state.research.unlocked.includes(r));
}

export function startResearch(state: GameState, techId: TechId): GameState {
  if (state.outcome !== "playing") return state;
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
  if (state.outcome !== "playing") return state;
  const req = ageUpRequirements(state);
  if (!req.ready || !req.nextAge) return state;
  const age = AGES[state.age];
  const next = cloneState(state);
  spend(next.resources, age.cost ?? {});
  next.age = req.nextAge;
  next.population.housingCap = recalcHousing(next);
  if (next.age === "space") {
    next.outcome = "victory";
    next.paused = true;
    next.stats.victoryKind = "ascent";
    next.pressure.lastBanner = "Ascent — launch succeeds! Your people reach the stars!";
  }
  return next;
}

/** Claim Harmony victory when stewardship path conditions are met. */
export function claimHarmonyVictory(state: GameState): GameState {
  if (state.outcome !== "playing") return state;
  const req = harmonyRequirements(state);
  if (!req.ready) return state;
  const next = cloneState(state);
  next.outcome = "victory";
  next.paused = true;
  next.stats.victoryKind = "harmony";
  next.pressure.lastBanner =
    "Harmony — the woods endure and your people choose the living world over the void.";
  return next;
}

/** Reduce deposit stock; clear terrain when exhausted. Mutates `state`. */
export function harvestDeposit(state: GameState, gx: number, gy: number, amount: number): number {
  const tile = tileAt(state, gx, gy);
  if (!tile || !tile.deposit || amount <= 0) return 0;
  if (tile.stock === undefined) {
    tile.stock = DEPOSIT_STOCK[tile.deposit];
  }
  const taken = Math.min(tile.stock, amount);
  tile.stock -= taken;
  if (tile.deposit === "wood") state.stats.woodHarvested += taken;
  if (taken > 0) {
    applyStrainGain(state, tile.deposit, taken);
  }
  if (tile.stock <= 0) {
    tile.stock = 0;
    const depleted = tile.deposit;
    tile.deposit = null;
    if (tile.terrain === "forest") {
      tile.terrain = "grass";
      tile.elev = Math.min(tile.elev ?? 1, 1);
    }
    // Clear-cutting a whole stand spikes strain harder than drip harvesting
    if (depleted === "wood") {
      applyStrainGain(state, "wood", 4);
    }
  }
  return taken;
}

function assignWorkers(state: GameState): {
  constructionWorkers: number;
  foragers: number;
} {
  for (const b of state.buildings) b.workers = 0;

  const pop = state.population.count;
  const quota = (p: PriorityId) => workerQuota(state.priorities, pop, p);

  let remaining = pop;
  const sites = state.buildings.filter((b) => b.progress < 1);
  const complete = state.buildings.filter((b) => b.progress >= 1);

  // Reserve builders first so scaffolds actually complete (citizens already walk to sites)
  let constructionWorkers = 0;
  if (sites.length > 0) {
    constructionWorkers = Math.min(
      Math.max(sites.length, quota("construction")),
      remaining,
      sites.length * 2,
    );
    remaining -= constructionWorkers;
  }

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
  staff("defence", quota("defence"));

  // Do not auto-fill leftover people into open slots — Work quotas are hard caps.

  const foragers = Math.min(quota("food"), remaining);

  return { constructionWorkers, foragers };
}

/** Slow forest regrowth on empty grass next to living forest (autumn/spring). */
function tickRegrowth(state: GameState): void {
  // High strain slows the world's recovery even outside growth seasons
  if (state.tick % 8 === 0) {
    easeStrain(state, state.strain > 60 ? 0.35 : 0.7);
  }

  if (state.pressure.season !== "spring" && state.pressure.season !== "autumn") return;
  const mods = techModifiers(state);
  // Clearcutting / high strain stretch the regrowth interval
  const interval = Math.max(6, Math.round(12 / mods.regrowthMult + state.strain / 25));
  if (state.tick % interval !== 0) return;
  const { width, height, tiles } = state.map;
  const candidates: Tile[] = [];
  for (const t of tiles) {
    if (t.terrain !== "grass" || t.deposit) continue;
    let nearForest = false;
    for (let dy = -1; dy <= 1 && !nearForest; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = tiles[ny * width + nx];
        if (n.terrain === "forest" && (n.stock ?? 0) > 10) nearForest = true;
      }
    }
    if (nearForest) candidates.push(t);
  }
  if (!candidates.length) return;
  const picks = Math.min(candidates.length, mods.regrowthMult >= 1.4 ? 2 : 1);
  for (let i = 0; i < picks; i++) {
    const idx = Math.floor((state.rngSeed + state.tick * 7 + i * 13) % candidates.length);
    const pick = candidates.splice(idx % candidates.length, 1)[0];
    if (!pick) break;
    pick.terrain = "forest";
    pick.deposit = "wood";
    pick.stock = Math.floor(DEPOSIT_STOCK.wood * 0.45);
    easeStrain(state, 2.5);
  }
}

export function tick(state: GameState): GameState {
  if (state.paused || state.outcome !== "playing") return state;
  const next = cloneState(state);
  next.tick += 1;
  const { constructionWorkers } = assignWorkers(next);

  // Wood / stone / food / knowledge from gather buildings are delivered by
  // workers walking to resource tiles and depositing carry loads (see game/citizens).
  // Keep a tiny knowledge trickle so Fire can be started before a research hut.
  next.resources.knowledge += knowledgeTrickle(next.population.count);

  const storage = foodStorageMultiplier(next);
  const foodUse =
    next.population.count *
    FOOD_PER_CITIZEN *
    foodAgeMultiplier(next.age) *
    seasonFoodMultiplier(next) *
    storage;
  next.resources.food -= foodUse;
  const starving = next.resources.food < 0;
  if (starving) {
    next.resources.food = 0;
    next.starvationTicks += 1;
    if (next.starvationTicks >= STARVE_DEATH_TICKS && next.population.count > 1) {
      next.population.count -= 1;
      next.starvationTicks = Math.floor(STARVE_DEATH_TICKS / 2);
      next.pressure.lastBanner = "Starvation claims a villager.";
    }
    if (next.population.count <= 1 && next.starvationTicks >= STARVE_DEATH_TICKS + 10) {
      next.outcome = "defeat";
      next.paused = true;
      next.pressure.lastBanner = "The settlement collapses to hunger.";
    }
  } else {
    next.starvationTicks = 0;
  }

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
    const rate = 0.4 + researchWorkers * 0.45;
    next.research.active.progress += rate / tech.researchTicks;
    if (next.research.active.progress >= 1) {
      next.research.unlocked.push(next.research.active.techId);
      next.research.active = null;
    }
  }

  next.population.housingCap = recalcHousing(next);
  const growthOk = next.pressure.growthHaltTicks <= 0;
  if (
    growthOk &&
    !starving &&
    next.resources.food >= GROWTH_FOOD_BUFFER &&
    next.population.count < next.population.housingCap &&
    next.tick % GROWTH_INTERVAL === 0
  ) {
    next.population.count += 1;
    next.resources.food -= GROWTH_FOOD_COST;
  }

  next.stats.peakPop = Math.max(next.stats.peakPop, next.population.count);
  tickRegrowth(next);
  tickPressure(next);
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
