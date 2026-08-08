import { ageIndex } from "../data/ages";
import { BUILDINGS } from "../data/buildings";
import {
  NEIGHBOURS,
  NEIGHBOUR_LIST,
  ROUTE_TIERS,
  TRADE_VALUE,
} from "../data/neighbours";
import { createRng } from "./rng";
import { techModifiers } from "./strategy";
import type {
  DiplomacyState,
  GameState,
  NeighbourDef,
  NeighbourId,
  NeighbourState,
  ResourceId,
  StanceId,
  Tile,
  TradeRoute,
  TributeDemand,
} from "./types";

/** Standing boundaries between stances. */
export const STANCE_THRESHOLDS = {
  hostile: -40,
  wary: -10,
  neutral: 35,
  cordial: 75,
};

/** Standing every neighbour must reach for the Concord victory. */
export const CONCORD_MIN_STANDING = 60;
export const CONCORD_MIN_TRADE = 400;
export const CONCORD_MIN_POP = 40;

/** Ticks a route may go unpaid before it collapses. */
const ROUTE_GRACE_TICKS = 20;
/** Ticks between gifts that actually move a neighbour. */
const GIFT_COOLDOWN = 140;
/** Goods value carried by a single gift parcel. */
const GIFT_VALUE = 30;

export function stanceFor(standing: number): StanceId {
  if (standing < STANCE_THRESHOLDS.hostile) return "hostile";
  if (standing < STANCE_THRESHOLDS.wary) return "wary";
  if (standing < STANCE_THRESHOLDS.neutral) return "neutral";
  if (standing < STANCE_THRESHOLDS.cordial) return "cordial";
  return "allied";
}

const STANCE_TRADE_MULT: Record<StanceId, number> = {
  hostile: 0,
  wary: 0.8,
  neutral: 1,
  cordial: 1.18,
  allied: 1.35,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Site a neighbour camp out along its compass direction, skipping water.
 * Deterministic so a given map always places the same peoples in the same valleys.
 */
function siteCamp(
  map: { width: number; height: number; tiles: Tile[] },
  def: NeighbourDef,
): { x: number; y: number } {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  const reach = Math.floor(Math.min(map.width, map.height) * 0.36);
  const ideal = {
    x: clamp(cx + def.dir.dx * reach, 3, map.width - 4),
    y: clamp(cy + def.dir.dy * reach, 3, map.height - 4),
  };
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (t.terrain === "water") continue;
    if (t.x < 2 || t.y < 2 || t.x > map.width - 3 || t.y > map.height - 3) continue;
    const d = Math.abs(t.x - ideal.x) + Math.abs(t.y - ideal.y);
    if (d < bestDist) {
      bestDist = d;
      best = { x: t.x, y: t.y };
    }
  }
  return best ?? ideal;
}

export function createDiplomacy(map: {
  width: number;
  height: number;
  tiles: Tile[];
}): DiplomacyState {
  return {
    neighbours: NEIGHBOUR_LIST.map((def) => {
      const site = siteCamp(map, def);
      return {
        id: def.id,
        standing: def.standingStart,
        aggression: 0.12,
        patience: 380,
        giftCooldown: 0,
        traded: 0,
        x: site.x,
        y: site.y,
      };
    }),
    routes: [],
    demand: null,
    nextRouteSeq: 1,
    lastEnvoy: null,
  };
}

export function neighbourState(
  state: GameState,
  id: NeighbourId,
): NeighbourState | undefined {
  return state.diplomacy.neighbours.find((n) => n.id === id);
}

/** Tiles a neighbour camp occupies — the player cannot build on them. */
export function isNeighbourGround(state: GameState, x: number, y: number): boolean {
  return state.diplomacy.neighbours.some(
    (n) => Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1,
  );
}

/** Total routes the settlement can run, from completed Trade Posts / Envoy Halls. */
export function routeCapacity(state: GameState): number {
  const extra = techModifiers(state).extraRoutesPerPost;
  let capacity = 0;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    const slots = BUILDINGS[b.type]?.routeSlots ?? 0;
    if (slots > 0) capacity += slots + extra;
  }
  return capacity;
}

/** Workers currently manning trade buildings. */
export function tradeWorkers(state: GameState): number {
  return state.buildings
    .filter((b) => b.progress >= 1 && BUILDINGS[b.type]?.priority === "trade")
    .reduce((sum, b) => sum + b.workers, 0);
}

/**
 * Share of route throughput the current Trade crew can actually move.
 * One worker keeps one route running; an unstaffed post ships nothing.
 */
export function tradeStaffRatio(state: GameState): number {
  const active = state.diplomacy.routes.filter((r) => !r.suspended).length;
  if (active === 0) return 0;
  return clamp(tradeWorkers(state) / active, 0, 1);
}

/** Manhattan distance from the nearest trade building to a neighbour camp. */
export function campDistance(state: GameState, id: NeighbourId): number {
  const n = neighbourState(state, id);
  if (!n) return 30;
  let best = Infinity;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    const def = BUILDINGS[b.type];
    if (!def?.routeSlots && !def?.acceptsDropoff) continue;
    best = Math.min(best, Math.abs(b.x - n.x) + Math.abs(b.y - n.y));
  }
  return Number.isFinite(best) ? best : 30;
}

/** Ticks for one caravan round trip on this route. */
export function caravanCycleTicks(state: GameState, route: TradeRoute): number {
  return Math.max(12, Math.round(14 + campDistance(state, route.neighbourId) * 0.55));
}

export interface RouteRate {
  give: number;
  take: number;
  /** take / give, for display */
  ratio: number;
}

/** Per-tick goods flow for a hypothetical or live route, before staffing. */
export function routeRate(
  state: GameState,
  id: NeighbourId,
  give: ResourceId,
  take: ResourceId,
  weight: number,
): RouteRate {
  const def = NEIGHBOURS[id];
  const n = neighbourState(state, id);
  const out = ROUTE_TIERS[clamp(Math.round(weight), 1, 3)];
  if (!def || !n) return { give: out, take: 0, ratio: 0 };
  const stanceMult = STANCE_TRADE_MULT[stanceFor(n.standing)];
  const wantsIt = def.wants.includes(give) ? 1.25 : 0.9;
  const sparesIt = def.surplus.includes(take) ? 1.25 : 0.8;
  const mult =
    0.6 * stanceMult * wantsIt * sparesIt * techModifiers(state).tradeRateMult;
  const back = out * (TRADE_VALUE[give] / TRADE_VALUE[take]) * mult;
  return { give: out, take: back, ratio: out > 0 ? back / out : 0 };
}

export type RouteCheck = { ok: true } | { ok: false; reason: string };

export function canOpenRoute(
  state: GameState,
  id: NeighbourId,
  give: ResourceId,
  take: ResourceId,
  weight: number,
): RouteCheck {
  if (state.outcome !== "playing") return { ok: false, reason: "Game over" };
  const def = NEIGHBOURS[id];
  const n = neighbourState(state, id);
  if (!def || !n) return { ok: false, reason: "Unknown people" };
  if (!state.research.unlocked.includes("trade")) {
    return { ok: false, reason: "Research Trade first" };
  }
  if (stanceFor(n.standing) === "hostile") {
    return { ok: false, reason: `${def.name} refuse to deal with you` };
  }
  if (!def.surplus.includes(take)) {
    return { ok: false, reason: `${def.name} have no ${take} to spare` };
  }
  if (give === take) return { ok: false, reason: "Pick different goods" };
  if (state.diplomacy.routes.some((r) => r.neighbourId === id && r.give === give)) {
    return { ok: false, reason: "That route already runs" };
  }
  if (state.diplomacy.routes.length >= routeCapacity(state)) {
    return { ok: false, reason: "No free Trade Post route" };
  }
  if (ROUTE_TIERS[clamp(Math.round(weight), 1, 3)] === undefined) {
    return { ok: false, reason: "Bad volume" };
  }
  return { ok: true };
}

export function openRoute(
  state: GameState,
  id: NeighbourId,
  give: ResourceId,
  take: ResourceId,
  weight: number,
): GameState {
  if (!canOpenRoute(state, id, give, take, weight).ok) return state;
  const next = structuredClone(state);
  const seq = next.diplomacy.nextRouteSeq++;
  next.diplomacy.routes.push({
    id: `r${seq}`,
    neighbourId: id,
    give,
    take,
    weight: clamp(Math.round(weight), 1, 3),
    pending: 0,
    progress: 0,
    starvedTicks: 0,
    suspended: false,
  });
  next.diplomacy.lastEnvoy = `Caravan route opened with the ${NEIGHBOURS[id].name}.`;
  return next;
}

export function closeRoute(state: GameState, routeId: string): GameState {
  const route = state.diplomacy.routes.find((r) => r.id === routeId);
  if (!route) return state;
  const next = structuredClone(state);
  const doomed = next.diplomacy.routes.find((r) => r.id === routeId);
  // Goods already on the road come home; the neighbour resents the broken deal
  if (doomed) {
    next.resources[doomed.take] += doomed.pending * 0.5;
    const n = neighbourState(next, doomed.neighbourId);
    if (n) n.standing = clamp(n.standing - 4, -100, 100);
  }
  next.diplomacy.routes = next.diplomacy.routes.filter((r) => r.id !== routeId);
  next.diplomacy.lastEnvoy = "Caravan route closed.";
  return next;
}

export function setRouteWeight(
  state: GameState,
  routeId: string,
  weight: number,
): GameState {
  const route = state.diplomacy.routes.find((r) => r.id === routeId);
  if (!route) return state;
  const next = structuredClone(state);
  const target = next.diplomacy.routes.find((r) => r.id === routeId);
  if (target) {
    target.weight = clamp(Math.round(weight), 1, 3);
    target.suspended = false;
    target.starvedTicks = 0;
  }
  return next;
}

/** Goods handed over for one gift parcel of a given resource. */
export function giftAmount(resource: ResourceId): number {
  return Math.ceil(GIFT_VALUE / TRADE_VALUE[resource]);
}

/** Standing a gift of this resource would buy right now. */
export function giftStanding(state: GameState, resource: ResourceId): number {
  const power = techModifiers(state).giftPowerMult;
  const bonus = (giftAmount(resource) * TRADE_VALUE[resource]) / 3;
  return Math.min(24, Math.round(bonus * power));
}

export function canSendGift(
  state: GameState,
  id: NeighbourId,
  resource: ResourceId,
): RouteCheck {
  if (state.outcome !== "playing") return { ok: false, reason: "Game over" };
  const n = neighbourState(state, id);
  const def = NEIGHBOURS[id];
  if (!n || !def) return { ok: false, reason: "Unknown people" };
  if (n.giftCooldown > 0) {
    return { ok: false, reason: `They will hear you again in ${n.giftCooldown}s` };
  }
  if (state.resources[resource] < giftAmount(resource)) {
    return { ok: false, reason: "Not enough goods" };
  }
  return { ok: true };
}

export function sendGift(
  state: GameState,
  id: NeighbourId,
  resource: ResourceId,
): GameState {
  if (!canSendGift(state, id, resource).ok) return state;
  const def = NEIGHBOURS[id];
  const next = structuredClone(state);
  const n = neighbourState(next, id);
  if (!n) return state;
  const amount = giftAmount(resource);
  next.resources[resource] -= amount;
  // Goods they are short of land harder than goods they already have
  const keen = def.wants.includes(resource) ? 1.35 : def.surplus.includes(resource) ? 0.5 : 1;
  const gain = Math.round(giftStanding(next, resource) * keen);
  n.standing = clamp(n.standing + gain, -100, 100);
  n.aggression = clamp(n.aggression - 0.12, 0, 1);
  n.giftCooldown = GIFT_COOLDOWN;
  next.diplomacy.lastEnvoy = `${def.name} accept your gift (+${gain} standing).`;
  return next;
}

/** Where a neighbour's opinion of you is slowly heading. */
export function standingEquilibrium(state: GameState, id: NeighbourId): number {
  const def = NEIGHBOURS[id];
  const n = neighbourState(state, id);
  if (!def || !n) return 0;
  let target = def.standingStart;
  const live = state.diplomacy.routes.filter(
    (r) => r.neighbourId === id && !r.suspended,
  ).length;
  target += Math.min(2, live) * 18;
  // Envoy Hall / Assembly Hall keep a standing channel open
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    target += (BUILDINGS[b.type]?.envoyBonus ?? 0) * 900;
  }
  target -= def.strainSensitivity * state.strain * 0.9;
  return clamp(target, -100, 100);
}

function demandCost(state: GameState, def: NeighbourDef): Partial<Record<ResourceId, number>> {
  const idx = ageIndex(state.age);
  const cost: Partial<Record<ResourceId, number>> = {};
  const primary = def.wants[0] ?? "food";
  const secondary = def.wants[1];
  cost[primary] = Math.round((18 + idx * 14) * def.might);
  if (secondary) cost[secondary] = Math.round((10 + idx * 9) * def.might);
  return cost;
}

function raiseDemand(state: GameState, n: NeighbourState): void {
  const def = NEIGHBOURS[n.id];
  const demand: TributeDemand = {
    neighbourId: n.id,
    cost: demandCost(state, def),
    text: `Riders from the ${def.name} halt at your boundary stones. Their speaker does not dismount. "You have grown fat on ground we also walk. Pay what we name, or we will come and take the naming from you."`,
  };
  state.diplomacy.demand = demand;
  state.paused = true;
  state.pressure.lastBanner = `${def.name} demand tribute.`;
}

/** Answer a standing ultimatum. Paying buys real peace; refusing buys a war. */
export function resolveDemand(state: GameState, pay: boolean): GameState {
  const demand = state.diplomacy.demand;
  if (!demand) return state;
  const def = NEIGHBOURS[demand.neighbourId];
  const next = structuredClone(state);
  const n = neighbourState(next, demand.neighbourId);
  next.diplomacy.demand = null;
  if (!n) return next;

  const affordable = (Object.keys(demand.cost) as ResourceId[]).every(
    (k) => next.resources[k] >= (demand.cost[k] ?? 0),
  );

  if (pay && affordable) {
    for (const key of Object.keys(demand.cost) as ResourceId[]) {
      next.resources[key] -= demand.cost[key] ?? 0;
    }
    n.standing = clamp(n.standing + 14, -100, 100);
    n.aggression = clamp(n.aggression - 0.55, 0, 1);
    n.patience = 420;
    next.stats.tributesPaid += 1;
    next.pressure.nextRaidAt = Math.max(next.pressure.nextRaidAt, next.tick + 300);
    next.diplomacy.lastEnvoy = `Tribute paid. The ${def.name} withdraw — for now.`;
    next.pressure.lastBanner = `Tribute paid to the ${def.name}. Their riders turn for home.`;
  } else {
    n.standing = clamp(n.standing - 10, -100, 100);
    n.aggression = 1;
    n.patience = 240;
    next.pressure.nextRaidAt = next.tick + 14;
    next.pressure.raidSource = n.id;
    next.diplomacy.lastEnvoy = `You refused the ${def.name}. They are coming.`;
    next.pressure.lastBanner = pay
      ? `You cannot pay the ${def.name}. They take the silence as an answer.`
      : `You send the ${def.name} away empty-handed. Warbands are already forming.`;
  }
  next.paused = next.outcome !== "playing";
  return next;
}

/** Which neighbour marches next — or null when nobody wants a fight. */
export function pickRaidSource(state: GameState): NeighbourId | null {
  let best: NeighbourState | null = null;
  for (const n of state.diplomacy.neighbours) {
    const stance = stanceFor(n.standing);
    if (stance === "allied" || stance === "cordial") continue;
    if (!best || n.aggression > best.aggression) best = n;
  }
  return best?.id ?? null;
}

/** Extra raid harshness contributed by the attacking people. */
export function raidSourceMultiplier(state: GameState, id: NeighbourId | null): number {
  if (!id) return 1;
  const def = NEIGHBOURS[id];
  const n = neighbourState(state, id);
  if (!def || !n) return 1;
  return def.might * (0.85 + n.aggression * 0.5);
}

/** Feed a resolved raid back into the attacker's standing and appetite. */
export function applyRaidOutcome(
  state: GameState,
  id: NeighbourId | null,
  repelled: boolean,
): void {
  if (!id) return;
  const n = neighbourState(state, id);
  if (!n) return;
  const mods = techModifiers(state);
  if (repelled) {
    // A bloodied nose buys lasting quiet; Border Watch makes the lesson stick
    n.aggression = clamp(n.aggression - 0.35 * mods.defenceMult, 0, 1);
    n.standing = clamp(n.standing - 4, -100, 100);
    n.patience = 240;
  } else {
    n.aggression = clamp(n.aggression + 0.15, 0, 1);
    n.standing = clamp(n.standing - 2, -100, 100);
    n.patience = 160;
    // Warbands strip the caravans on their way through
    const rng = createRng(state.rngSeed + state.tick * 23);
    for (const route of state.diplomacy.routes) {
      if (route.neighbourId === id || rng() < 0.4) {
        route.pending = 0;
        route.progress = 0;
      }
    }
  }
}

/** Advance standing, grievance, and caravans by one tick. Mutates `state`. */
export function tickDiplomacy(state: GameState): void {
  if (state.outcome !== "playing") return;
  const dip = state.diplomacy;
  if (dip.demand) {
    state.paused = true;
    return;
  }

  const mods = techModifiers(state);
  const harshness = 1 + ageIndex(state.age) * 0.12;

  for (const n of dip.neighbours) {
    const def = NEIGHBOURS[n.id];
    if (!def) continue;

    const target = standingEquilibrium(state, n.id);
    n.standing = clamp(
      n.standing + (target - n.standing) * 0.0018 * mods.standingDriftMult,
      -100,
      100,
    );

    // Grievance grows while they resent you and fades once they warm up
    const dislike = clamp((20 - n.standing) / 120, 0, 1);
    n.aggression = clamp(
      n.aggression + def.aggressionRate * dislike * harshness - (n.standing >= 40 ? 0.0012 : 0),
      0,
      1,
    );

    if (n.patience > 0) n.patience -= 1;
    if (n.giftCooldown > 0) n.giftCooldown -= 1;
  }

  // Ultimatums come before warbands — there is always a chance to pay
  if (state.tick > 420) {
    for (const n of dip.neighbours) {
      const stance = stanceFor(n.standing);
      if (stance !== "hostile" && stance !== "wary") continue;
      if (n.aggression < 0.7 || n.patience > 0) continue;
      raiseDemand(state, n);
      break;
    }
  }

  tickRoutes(state);
}

function tickRoutes(state: GameState): void {
  const dip = state.diplomacy;
  if (!dip.routes.length) return;
  const staff = tradeStaffRatio(state);

  for (const route of dip.routes) {
    const n = neighbourState(state, route.neighbourId);
    const def = NEIGHBOURS[route.neighbourId];
    if (!n || !def) continue;

    if (stanceFor(n.standing) === "hostile") {
      route.suspended = true;
      continue;
    }
    if (route.suspended) continue;
    if (staff <= 0) continue;

    const rate = routeRate(state, route.neighbourId, route.give, route.take, route.weight);
    const out = rate.give * staff;
    if (state.resources[route.give] < out) {
      route.starvedTicks += 1;
      if (route.starvedTicks >= ROUTE_GRACE_TICKS) {
        route.suspended = true;
        n.standing = clamp(n.standing - 8, -100, 100);
        n.aggression = clamp(n.aggression + 0.08, 0, 1);
        dip.lastEnvoy = `${def.name} caravans wait empty — the deal is off (−8 standing).`;
        state.pressure.lastBanner = `You could not fill the ${def.name} caravan. The route collapses.`;
      }
      continue;
    }

    route.starvedTicks = 0;
    state.resources[route.give] -= out;
    state.stats.goodsTraded += out;
    route.pending += rate.take * staff;
    route.progress += 1 / caravanCycleTicks(state, route);

    if (route.progress >= 1) {
      const delivered = route.pending;
      state.resources[route.take] += delivered;
      state.stats.goodsTraded += delivered;
      n.traded += delivered;
      route.pending = 0;
      route.progress = 0;
    }
  }
}

export interface ConcordRequirements {
  ready: boolean;
  hasTech: boolean;
  hasLandmark: boolean;
  hasPopulation: boolean;
  allCordial: boolean;
  tradedEnough: boolean;
  lowestStanding: number;
  goodsTraded: number;
}

export function concordRequirements(state: GameState): ConcordRequirements {
  const hasTech = state.research.unlocked.includes("concord");
  const hasLandmark = state.buildings.some(
    (b) => b.type === "assembly_hall" && b.progress >= 1,
  );
  const hasPopulation = state.population.count >= CONCORD_MIN_POP;
  const lowestStanding = state.diplomacy.neighbours.reduce(
    (lowest, n) => Math.min(lowest, n.standing),
    100,
  );
  const allCordial =
    state.diplomacy.neighbours.length > 0 && lowestStanding >= CONCORD_MIN_STANDING;
  const tradedEnough = state.stats.goodsTraded >= CONCORD_MIN_TRADE;
  return {
    ready: hasTech && hasLandmark && hasPopulation && allCordial && tradedEnough,
    hasTech,
    hasLandmark,
    hasPopulation,
    allCordial,
    tradedEnough,
    lowestStanding,
    goodsTraded: state.stats.goodsTraded,
  };
}

export const CONCORD_THRESHOLDS = {
  minStanding: CONCORD_MIN_STANDING,
  minTrade: CONCORD_MIN_TRADE,
  minPopulation: CONCORD_MIN_POP,
};
