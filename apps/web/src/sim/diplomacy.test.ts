import { describe, expect, it } from "vitest";
import { NEIGHBOURS, TRADE_VALUE } from "../data/neighbours";
import {
  CONCORD_MIN_POP,
  CONCORD_MIN_STANDING,
  CONCORD_MIN_TRADE,
  canOpenRoute,
  canSendGift,
  closeRoute,
  concordRequirements,
  isNeighbourGround,
  openRoute,
  pickRaidSource,
  raidSourceMultiplier,
  applyRaidOutcome,
  resolveDemand,
  routeCapacity,
  routeRate,
  sendGift,
  stanceFor,
  tickDiplomacy,
} from "./diplomacy";
import { canPlaceBuilding, createNewGame } from "./engine";
import type { GameState, NeighbourId } from "./types";

/** Drop a finished building straight into the state, bypassing costs. */
function place(state: GameState, type: GameState["buildings"][number]["type"], x: number, y: number) {
  state.buildings.push({
    id: `test-${type}-${x}-${y}`,
    type,
    x,
    y,
    progress: 1,
    workers: 0,
  });
  return state.buildings[state.buildings.length - 1];
}

/** A settlement that can trade: Trade tech, a staffed Trade Post, deep stores. */
function tradingState(seed = 7): GameState {
  const state = createNewGame(seed);
  state.research.unlocked.push("trade");
  const post = place(state, "trade_post", state.buildings[0].x + 2, state.buildings[0].y);
  post.workers = 3;
  state.resources.food = 5000;
  state.resources.wood = 5000;
  state.resources.stone = 5000;
  return state;
}

function neighbourWith(state: GameState, id: NeighbourId) {
  const n = state.diplomacy.neighbours.find((x) => x.id === id);
  if (!n) throw new Error(`missing neighbour ${id}`);
  return n;
}

describe("stances", () => {
  it("bands standing into stances in order", () => {
    expect(stanceFor(-100)).toBe("hostile");
    expect(stanceFor(-20)).toBe("wary");
    expect(stanceFor(0)).toBe("neutral");
    expect(stanceFor(50)).toBe("cordial");
    expect(stanceFor(90)).toBe("allied");
  });
});

describe("neighbour camps", () => {
  it("sites every people on dry ground inside the map", () => {
    const state = createNewGame(3);
    expect(state.diplomacy.neighbours.length).toBe(Object.keys(NEIGHBOURS).length);
    for (const n of state.diplomacy.neighbours) {
      const tile = state.map.tiles[n.y * state.map.width + n.x];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe("water");
    }
  });

  it("places the same camps for the same map", () => {
    const a = createNewGame(44).diplomacy.neighbours.map((n) => `${n.id}:${n.x},${n.y}`);
    const b = createNewGame(44).diplomacy.neighbours.map((n) => `${n.id}:${n.x},${n.y}`);
    expect(a).toEqual(b);
  });

  it("refuses player buildings on camp ground", () => {
    const state = createNewGame(9);
    const camp = state.diplomacy.neighbours[0];
    expect(isNeighbourGround(state, camp.x, camp.y)).toBe(true);
    expect(canPlaceBuilding(state, "house", camp.x, camp.y).ok).toBe(false);
  });
});

describe("trade routes", () => {
  it("needs Trade research and a Trade Post before a route opens", () => {
    const bare = createNewGame(5);
    expect(canOpenRoute(bare, "reed_folk", "wood", "food", 2).ok).toBe(false);

    const researched = createNewGame(5);
    researched.research.unlocked.push("trade");
    expect(routeCapacity(researched)).toBe(0);
    expect(canOpenRoute(researched, "reed_folk", "wood", "food", 2).ok).toBe(false);

    const ready = tradingState();
    expect(routeCapacity(ready)).toBeGreaterThan(0);
    expect(canOpenRoute(ready, "reed_folk", "wood", "food", 2).ok).toBe(true);
  });

  it("refuses goods the neighbour cannot spare and duplicate routes", () => {
    const state = tradingState();
    expect(canOpenRoute(state, "reed_folk", "wood", "metal", 2).ok).toBe(false);
    const opened = openRoute(state, "reed_folk", "wood", "food", 2);
    expect(opened.diplomacy.routes.length).toBe(1);
    expect(canOpenRoute(opened, "reed_folk", "wood", "food", 2).ok).toBe(false);
  });

  it("refuses to deal with hostile peoples", () => {
    const state = tradingState();
    neighbourWith(state, "reed_folk").standing = -80;
    expect(canOpenRoute(state, "reed_folk", "wood", "food", 2).ok).toBe(false);
  });

  it("pays better for goods a people wants", () => {
    const state = tradingState();
    // Compare exchange rates net of what the goods are simply worth
    const margin = (give: "food" | "knowledge") =>
      routeRate(state, "ridgeback", give, "stone", 2).ratio *
      (TRADE_VALUE.stone / TRADE_VALUE[give]);
    expect(NEIGHBOURS.ridgeback.wants).toContain("food");
    expect(NEIGHBOURS.ridgeback.wants).not.toContain("knowledge");
    expect(margin("food")).toBeGreaterThan(margin("knowledge"));
  });

  it("pays better as standing improves", () => {
    const state = tradingState();
    neighbourWith(state, "reed_folk").standing = 0;
    const cool = routeRate(state, "reed_folk", "wood", "food", 2).take;
    neighbourWith(state, "reed_folk").standing = 90;
    const warm = routeRate(state, "reed_folk", "wood", "food", 2).take;
    expect(warm).toBeGreaterThan(cool);
  });

  it("moves goods across a caravan cycle and credits the run stats", () => {
    let state = tradingState();
    state = openRoute(state, "reed_folk", "wood", "food", 3);
    const startWood = state.resources.wood;
    const startFood = state.resources.food;

    for (let i = 0; i < 120; i++) tickDiplomacy(state);

    const route = state.diplomacy.routes[0];
    expect(route.suspended).toBe(false);
    expect(state.resources.wood).toBeLessThan(startWood);
    expect(state.resources.food).toBeGreaterThan(startFood);
    expect(state.stats.goodsTraded).toBeGreaterThan(0);
    expect(neighbourWith(state, "reed_folk").traded).toBeGreaterThan(0);
  });

  it("ships nothing while no Trade workers are assigned", () => {
    let state = tradingState();
    state = openRoute(state, "reed_folk", "wood", "food", 2);
    for (const b of state.buildings) b.workers = 0;
    const startWood = state.resources.wood;
    for (let i = 0; i < 40; i++) tickDiplomacy(state);
    expect(state.resources.wood).toBe(startWood);
    expect(state.stats.goodsTraded).toBe(0);
  });

  it("suspends a route you cannot keep supplied, and the neighbour resents it", () => {
    let state = tradingState();
    state = openRoute(state, "reed_folk", "wood", "food", 3);
    state.resources.wood = 0;
    const before = neighbourWith(state, "reed_folk").standing;

    for (let i = 0; i < 40; i++) tickDiplomacy(state);

    expect(state.diplomacy.routes[0].suspended).toBe(true);
    expect(neighbourWith(state, "reed_folk").standing).toBeLessThan(before);
  });

  it("closing a route returns half the load and costs standing", () => {
    let state = tradingState();
    state = openRoute(state, "reed_folk", "wood", "food", 2);
    state.diplomacy.routes[0].pending = 10;
    const before = neighbourWith(state, "reed_folk").standing;
    const food = state.resources.food;

    state = closeRoute(state, state.diplomacy.routes[0].id);

    expect(state.diplomacy.routes).toEqual([]);
    expect(state.resources.food).toBeCloseTo(food + 5, 5);
    expect(neighbourWith(state, "reed_folk").standing).toBeLessThan(before);
  });

  it("open trade pulls standing upward over time", () => {
    let traded = tradingState(11);
    traded = openRoute(traded, "reed_folk", "wood", "food", 2);
    const idle = tradingState(11);
    for (let i = 0; i < 600; i++) {
      tickDiplomacy(traded);
      tickDiplomacy(idle);
    }
    expect(neighbourWith(traded, "reed_folk").standing).toBeGreaterThan(
      neighbourWith(idle, "reed_folk").standing,
    );
  });
});

describe("gifts", () => {
  it("buys standing, costs goods, and then goes on cooldown", () => {
    let state = tradingState();
    const before = neighbourWith(state, "ridgeback").standing;
    const food = state.resources.food;
    expect(canSendGift(state, "ridgeback", "food").ok).toBe(true);

    state = sendGift(state, "ridgeback", "food");

    const n = neighbourWith(state, "ridgeback");
    expect(n.standing).toBeGreaterThan(before);
    expect(state.resources.food).toBeLessThan(food);
    expect(n.giftCooldown).toBeGreaterThan(0);
    expect(canSendGift(state, "ridgeback", "food").ok).toBe(false);
  });

  it("refuses a gift you cannot afford", () => {
    const state = tradingState();
    state.resources.food = 0;
    expect(canSendGift(state, "ridgeback", "food").ok).toBe(false);
    expect(sendGift(state, "ridgeback", "food")).toBe(state);
  });
});

describe("tribute demands", () => {
  it("raises a demand from an angry people and pauses the game", () => {
    const state = createNewGame(13);
    state.tick = 500;
    const n = neighbourWith(state, "ridgeback");
    n.standing = -60;
    n.aggression = 0.95;
    n.patience = 0;

    tickDiplomacy(state);

    expect(state.diplomacy.demand?.neighbourId).toBe("ridgeback");
    expect(state.paused).toBe(true);
  });

  it("paying costs goods, buys standing and delays the next raid", () => {
    const state = createNewGame(13);
    state.tick = 500;
    state.resources.food = 900;
    state.resources.wood = 900;
    const n = neighbourWith(state, "ridgeback");
    n.standing = -60;
    n.aggression = 0.95;
    n.patience = 0;
    tickDiplomacy(state);
    const cost = state.diplomacy.demand?.cost.food ?? 0;
    expect(cost).toBeGreaterThan(0);

    const paid = resolveDemand(state, true);

    expect(paid.diplomacy.demand).toBeNull();
    expect(paid.resources.food).toBe(900 - cost);
    expect(neighbourWith(paid, "ridgeback").standing).toBeGreaterThan(n.standing);
    expect(neighbourWith(paid, "ridgeback").aggression).toBeLessThan(n.aggression);
    expect(paid.stats.tributesPaid).toBe(1);
    expect(paid.pressure.nextRaidAt).toBeGreaterThan(paid.tick);
  });

  it("refusing keeps the goods and sends a warband", () => {
    const state = createNewGame(13);
    state.tick = 500;
    state.resources.food = 900;
    state.resources.wood = 900;
    const n = neighbourWith(state, "ridgeback");
    n.standing = -60;
    n.aggression = 0.95;
    n.patience = 0;
    tickDiplomacy(state);

    const refused = resolveDemand(state, false);

    expect(refused.resources.food).toBe(900);
    expect(neighbourWith(refused, "ridgeback").aggression).toBe(1);
    expect(refused.pressure.raidSource).toBe("ridgeback");
    expect(refused.pressure.nextRaidAt).toBeLessThan(refused.tick + 30);
  });

  it("treats an unaffordable payment as a refusal", () => {
    const state = createNewGame(13);
    state.tick = 500;
    state.resources.food = 0;
    state.resources.wood = 0;
    const n = neighbourWith(state, "ridgeback");
    n.standing = -60;
    n.aggression = 0.95;
    n.patience = 0;
    tickDiplomacy(state);

    const paid = resolveDemand(state, true);

    expect(paid.stats.tributesPaid).toBe(0);
    expect(paid.pressure.raidSource).toBe("ridgeback");
  });
});

describe("raid ownership", () => {
  it("picks the angriest people who is not a friend", () => {
    const state = createNewGame(17);
    for (const n of state.diplomacy.neighbours) {
      n.standing = 0;
      n.aggression = 0.1;
    }
    neighbourWith(state, "ash_wardens").aggression = 0.8;
    expect(pickRaidSource(state)).toBe("ash_wardens");

    // Friends stay home even when they are the most aggrieved
    neighbourWith(state, "ash_wardens").standing = CONCORD_MIN_STANDING;
    expect(pickRaidSource(state)).not.toBe("ash_wardens");
  });

  it("scales raid harshness by the attacker's might and grievance", () => {
    const state = createNewGame(17);
    neighbourWith(state, "ridgeback").aggression = 1;
    expect(raidSourceMultiplier(state, null)).toBe(1);
    expect(raidSourceMultiplier(state, "ridgeback")).toBeGreaterThan(1);
  });

  it("feeds the raid result back into standing and grievance", () => {
    const state = createNewGame(17);
    const n = neighbourWith(state, "ridgeback");
    n.aggression = 0.8;

    applyRaidOutcome(state, "ridgeback", true);
    expect(n.aggression).toBeLessThan(0.8);
    expect(n.patience).toBeGreaterThan(0);

    const after = n.aggression;
    applyRaidOutcome(state, "ridgeback", false);
    expect(n.aggression).toBeGreaterThan(after);
  });

  it("a successful raid scatters the caravans it passes", () => {
    let state = tradingState(19);
    state = openRoute(state, "reed_folk", "wood", "food", 2);
    state.diplomacy.routes[0].pending = 12;
    state.diplomacy.routes[0].progress = 0.6;

    applyRaidOutcome(state, "reed_folk", false);

    expect(state.diplomacy.routes[0].pending).toBe(0);
    expect(state.diplomacy.routes[0].progress).toBe(0);
  });
});

describe("concord victory", () => {
  it("lists every unmet requirement on a fresh game", () => {
    const req = concordRequirements(createNewGame(23));
    expect(req.ready).toBe(false);
    expect(req.hasTech).toBe(false);
    expect(req.hasLandmark).toBe(false);
    expect(req.allCordial).toBe(false);
  });

  it("is ready once tech, hall, people, standing and trade all land", () => {
    const state = createNewGame(23);
    state.research.unlocked.push("concord");
    place(state, "assembly_hall", state.buildings[0].x + 3, state.buildings[0].y + 1);
    state.population.count = CONCORD_MIN_POP;
    state.stats.goodsTraded = CONCORD_MIN_TRADE;
    for (const n of state.diplomacy.neighbours) n.standing = CONCORD_MIN_STANDING;

    const req = concordRequirements(state);

    expect(req.lowestStanding).toBe(CONCORD_MIN_STANDING);
    expect(req.ready).toBe(true);
  });
});
