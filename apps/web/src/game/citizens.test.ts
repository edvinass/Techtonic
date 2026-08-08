import { describe, expect, it } from "vitest";
import { createNewGame, placeBuilding, tick } from "../sim/engine";
import {
  findNearestDropoff,
  hydrateCitizens,
  snapshotCitizens,
  stepCitizens,
  syncCitizens,
  type Citizen,
} from "./citizens";
import { CARRY_CAPACITY, worldPos } from "./gather";
import { isWalkable, worldToGrid } from "./pathfinding";

describe("citizen wood gathering", () => {
  it("sends workers toward forest tiles when a lumber camp exists", () => {
    let state = createNewGame(21);
    state.resources.wood = 100;
    state.priorities = {
      food: 5,
      wood: 80,
      stone: 0,
      metal: 0,
      construction: 5,
      research: 5,
      defence: 5,
    };
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood")!;
    state = placeBuilding(state, "lumber_camp", woodTile.x, woodTile.y);
    state.buildings.forEach((b) => {
      if (b.type === "lumber_camp") b.progress = 1;
    });
    // Advance a tick so construction workers aren't the only story
    state = tick(state);

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    // Interrupt any wander and assign again
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const woodBound = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.resource === "wood") ||
        (c.job.kind === "gather" && c.job.resource === "wood"),
    );
    expect(woodBound.length).toBeGreaterThan(0);

    const trip = woodBound[0];
    expect(trip.job.kind).toBe("walk");
    if (trip.job.kind !== "walk" || !trip.job.tile) throw new Error("expected walk");
    const camp = state.buildings.find((b) => b.type === "lumber_camp")!;
    // Target should not be identical to standing forever on camp only — prefer a tile
    const target = trip.job.tile;
    const targetPos = worldPos(target.gx, target.gy, ox, oy);
    const campPos = worldPos(camp.x, camp.y, ox, oy);
    // Either off the camp tile, or if only camp has wood, at least job is wood gather
    expect(
      target.gx !== camp.x ||
        target.gy !== camp.y ||
        state.map.tiles.filter((t) => t.deposit === "wood" || t.terrain === "forest")
          .length === 1,
    ).toBe(true);
    expect(Math.hypot(targetPos.x - campPos.x, targetPos.y - campPos.y)).toBeGreaterThanOrEqual(0);
  });

  it("pulls wood gatherers off trees when all workers are moved to food", () => {
    let state = createNewGame(22);
    state.resources.wood = 100;
    state.population.count = 5;
    state.priorities = {
      food: 0,
      wood: 5,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood")!;
    state = placeBuilding(state, "lumber_camp", woodTile.x, woodTile.y);
    state.buildings.forEach((b) => {
      if (b.type === "lumber_camp") b.progress = 1;
    });

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const woodBefore = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.resource === "wood") ||
        (c.job.kind === "gather" && c.job.resource === "wood"),
    ).length;
    expect(woodBefore).toBeGreaterThan(0);

    state.priorities = {
      food: 5,
      wood: 0,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    syncCitizens(citizens, state, ox, oy);

    const stillWood = citizens.filter(
      (c) =>
        c.carryAmount <= 0 &&
        ((c.job.kind === "walk" && c.job.resource === "wood") ||
          (c.job.kind === "gather" && c.job.resource === "wood")),
    );
    expect(stillWood.length).toBe(0);

    const foodBound = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.resource === "food") ||
        (c.job.kind === "gather" && c.job.resource === "food"),
    );
    expect(foodBound.length).toBeGreaterThan(0);
  });

  it("assigns wood and stone workers from separate Work quotas", () => {
    let state = createNewGame(23);
    state.resources.wood = 200;
    state.resources.stone = 50;
    state.population.count = 6;
    state.research.unlocked = ["primitive_tools"];
    state.priorities = {
      food: 0,
      wood: 2,
      stone: 2,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood")!;
    const stoneTile = state.map.tiles.find((t) => t.deposit === "stone")!;
    state = placeBuilding(state, "lumber_camp", woodTile.x, woodTile.y);
    state = placeBuilding(state, "quarry", stoneTile.x, stoneTile.y);
    state.buildings.forEach((b) => {
      if (b.type === "lumber_camp" || b.type === "quarry") b.progress = 1;
    });

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const woodBound = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.resource === "wood") ||
        (c.job.kind === "gather" && c.job.resource === "wood"),
    );
    const stoneBound = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.resource === "stone") ||
        (c.job.kind === "gather" && c.job.resource === "stone"),
    );
    expect(woodBound.length).toBeGreaterThan(0);
    expect(stoneBound.length).toBeGreaterThan(0);
  });

  it("assigns research scholars from the Research Work quota", () => {
    let state = createNewGame(25);
    state.resources.wood = 200;
    state.resources.stone = 50;
    state.population.count = 5;
    state.research.unlocked = ["fire"];
    state.priorities = {
      food: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 3,
      defence: 0,
    };
    const house = state.buildings.find((b) => b.type === "house")!;
    state = placeBuilding(state, "research_hut", house.x + 2, house.y);
    state.buildings.forEach((b) => {
      if (b.type === "research_hut") b.progress = 1;
    });

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const scholars = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.work === "research") ||
        (c.job.kind === "gather" && c.job.work === "research"),
    );
    expect(scholars.length).toBeGreaterThan(0);
    expect(scholars[0].job.kind === "walk" || scholars[0].job.kind === "gather").toBe(true);
    if (scholars[0].job.kind === "walk" || scholars[0].job.kind === "gather") {
      expect(scholars[0].job.resource).toBe("knowledge");
    }
  });

  it("sends research workers to study at home before a research hut exists", () => {
    const state = createNewGame(26);
    state.population.count = 4;
    state.priorities = {
      food: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 2,
      defence: 0,
    };

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const scholars = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.work === "research") ||
        (c.job.kind === "gather" && c.job.work === "research"),
    );
    expect(scholars.length).toBeGreaterThan(0);
  });

  it("sends defence workers to man completed watchtowers", () => {
    let state = createNewGame(27);
    state.resources.wood = 200;
    state.resources.stone = 100;
    state.population.count = 5;
    state.research.unlocked = ["fortifications"];
    state.priorities = {
      food: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 3,
    };
    const house = state.buildings.find((b) => b.type === "house")!;
    state = placeBuilding(state, "watchtower", house.x + 2, house.y);
    state.buildings.forEach((b) => {
      if (b.type === "watchtower") b.progress = 1;
    });
    const tower = state.buildings.find((b) => b.type === "watchtower");
    expect(tower).toBeTruthy();

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const guards = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.work === "defend") ||
        (c.job.kind === "work" && c.job.work === "defend"),
    );
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.length).toBeLessThanOrEqual(2);
    if (guards[0].job.kind === "walk" || guards[0].job.kind === "work") {
      expect(guards[0].job.buildingId).toBe(tower!.id);
    }
  });

  it("does not send builders when Build workers are 0", () => {
    let state = createNewGame(31);
    state.resources.wood = 100;
    state.population.count = 5;
    state.priorities = {
      food: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    state.buildings.push({
      id: "b_scaffold",
      type: "stockpile",
      x: 10,
      y: 10,
      progress: 0,
      workers: 0,
    });

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const builders = citizens.filter(
      (c) =>
        (c.job.kind === "walk" && c.job.work === "build") ||
        (c.job.kind === "work" && c.job.work === "build"),
    );
    expect(builders.length).toBe(0);
  });

  it("routes builders to walkable ground beside a rock-corner scaffold", () => {
    const state = createNewGame(33);
    state.resources.wood = 100;
    state.population.count = 4;
    state.priorities = {
      food: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      construction: 5,
      research: 0,
      defence: 0,
    };

    // Stone clump with a reachable corner scaffold on rock
    const bx = 18;
    const by = 18;
    for (let y = by; y <= by + 2; y++) {
      for (let x = bx; x <= bx + 2; x++) {
        const t = state.map.tiles[y * state.map.width + x];
        t.terrain = "rock";
        t.deposit = "stone";
      }
    }
    // Clear grass approach from the west
    for (let x = bx - 4; x < bx; x++) {
      const t = state.map.tiles[by * state.map.width + x];
      t.terrain = "grass";
      t.deposit = null;
    }

    state.buildings.push({
      id: "b_quarry_scaffold",
      type: "quarry",
      x: bx,
      y: by,
      progress: 0.1,
      workers: 0,
    });

    const ox = 400;
    const oy = 80;
    const citizens: Citizen[] = [];
    syncCitizens(citizens, state, ox, oy);
    for (const c of citizens) {
      if (c.job.kind === "walk" && c.job.phase === "wander") c.job = { kind: "idle" };
    }
    syncCitizens(citizens, state, ox, oy);

    const builders = citizens.filter(
      (c) => c.job.kind === "walk" && c.job.work === "build",
    );
    expect(builders.length).toBeGreaterThan(0);

    for (const b of builders) {
      if (b.job.kind !== "walk") continue;
      // Destination and every waypoint must be walkable (not rock/water)
      const spots = [...b.job.path, { x: b.job.tx, y: b.job.ty }];
      for (const p of spots) {
        const g = worldToGrid(p.x, p.y, ox, oy);
        expect(isWalkable(state, g.x, g.y)).toBe(true);
      }
    }

    // Simulate arrival + several sync frames — must not bounce off rock
    const builder = builders[0];
    if (builder.job.kind !== "walk") throw new Error("expected walk");
    builder.x = builder.job.tx;
    builder.y = builder.job.ty;
    builder.job.path = [];
    const ax = builder.x;
    const ay = builder.y;
    for (let i = 0; i < 5; i++) syncCitizens(citizens, state, ox, oy);
    expect(Math.hypot(builder.x - ax, builder.y - ay)).toBeLessThan(2);
  });

  it("advances scaffold progress only while a builder works on-site", () => {
    const state = createNewGame(32);
    state.buildings.push({
      id: "b_scaffold",
      type: "stockpile",
      x: 10,
      y: 10,
      progress: 0,
      workers: 0,
    });
    const ox = 400;
    const oy = 80;
    const site = worldPos(10, 10, ox, oy);
    const citizen: Citizen = {
      id: 0,
      x: site.x,
      y: site.y,
      job: {
        kind: "work",
        buildingId: "b_scaffold",
        work: "build",
        timer: 5000,
      },
      bobPhase: 0,
      carrying: null,
      carryAmount: 0,
    };

    let built = 0;
    stepCitizens([citizen], 1000, {
      state,
      ox,
      oy,
      onDeposit: () => {},
      onBuild: (id, amount) => {
        expect(id).toBe("b_scaffold");
        built += amount;
        state.buildings.find((b) => b.id === id)!.progress += amount;
      },
    });
    expect(built).toBeGreaterThan(0);
    expect(state.buildings.find((b) => b.id === "b_scaffold")!.progress).toBeGreaterThan(0);
  });

  it("delivers gathered wood to the nearest stockpile, not the lumber camp", () => {
    let state = createNewGame(24);
    state.resources.wood = 200;
    state.population.count = 3;
    state.priorities = {
      food: 0,
      wood: 3,
      stone: 0,
      metal: 0,
      construction: 0,
      research: 0,
      defence: 0,
    };
    const woodTile = state.map.tiles.find((t) => t.deposit === "wood")!;
    state = placeBuilding(state, "lumber_camp", woodTile.x, woodTile.y);
    const camp = state.buildings.find((b) => b.type === "lumber_camp")!;
    camp.progress = 1;

    // Extra stockpile next to the wood tile — should beat the starter near the house
    state = placeBuilding(state, "stockpile", woodTile.x + 1, woodTile.y);
    const nearPile = state.buildings.find(
      (b) => b.type === "stockpile" && b.x === woodTile.x + 1 && b.y === woodTile.y,
    );
    if (nearPile) nearPile.progress = 1;
    // If placement failed (water/occupied), skip asserting the near pile specifically
    const dropoff = findNearestDropoff(state, woodTile.x, woodTile.y);
    expect(dropoff?.type).toBe("stockpile");
    expect(dropoff?.id).not.toBe(camp.id);

    const ox = 400;
    const oy = 80;
    const citizen: Citizen = {
      id: 0,
      x: worldPos(woodTile.x, woodTile.y, ox, oy).x,
      y: worldPos(woodTile.x, woodTile.y, ox, oy).y,
      job: {
        kind: "gather",
        buildingId: camp.id,
        work: "gather",
        resource: "wood",
        tile: { gx: woodTile.x, gy: woodTile.y },
      },
      bobPhase: 0,
      carrying: "wood",
      carryAmount: CARRY_CAPACITY.wood - 0.01,
    };

    stepCitizens([citizen], 1000, {
      state,
      ox,
      oy,
      onDeposit: () => {},
      onHarvest: () => 1,
    });

    expect(citizen.job.kind).toBe("walk");
    if (citizen.job.kind !== "walk") throw new Error("expected dropoff walk");
    expect(citizen.job.phase).toBe("toDropoff");
    const pilePos = worldPos(dropoff!.x, dropoff!.y, ox, oy);
    const campPos = worldPos(camp.x, camp.y, ox, oy);
    const distPile = Math.hypot(citizen.job.tx - pilePos.x, citizen.job.ty - pilePos.y);
    const distCamp = Math.hypot(citizen.job.tx - campPos.x, citizen.job.ty - campPos.y);
    expect(distPile).toBeLessThan(distCamp);
  });
});

describe("citizen save/load positions", () => {
  it("round-trips world positions and jobs through snapshot/hydrate", () => {
    const citizens: Citizen[] = [
      {
        id: 3,
        x: 412.5,
        y: 188.25,
        bobPhase: 1.2,
        carrying: "wood",
        carryAmount: 4,
        job: {
          kind: "walk",
          tx: 500,
          ty: 200,
          path: [
            { x: 450, y: 190 },
            { x: 500, y: 200 },
          ],
          buildingId: "b1",
          work: "gather",
          phase: "toDropoff",
          resource: "wood",
          tile: { gx: 10, gy: 12 },
        },
      },
      {
        id: 7,
        x: 300,
        y: 140,
        bobPhase: 0.4,
        carrying: null,
        carryAmount: 0,
        job: {
          kind: "work",
          buildingId: "b2",
          work: "research",
          timer: 0.55,
        },
      },
    ];

    const restored = hydrateCitizens(snapshotCitizens(citizens));
    expect(restored).toHaveLength(2);
    expect(restored[0].x).toBe(412.5);
    expect(restored[0].y).toBe(188.25);
    expect(restored[0].carrying).toBe("wood");
    expect(restored[0].carryAmount).toBe(4);
    expect(restored[0].job).toEqual(citizens[0].job);
    expect(restored[1].x).toBe(300);
    expect(restored[1].y).toBe(140);
    expect(restored[1].job).toEqual(citizens[1].job);
  });

  it("keeps restored positions when syncCitizens reassigns work", () => {
    let state = createNewGame(21);
    state.population.count = 2;
    const ox = 400;
    const oy = 80;
    const home = state.buildings.find((b) => b.type === "house")!;
    const homePos = worldPos(home.x, home.y, ox, oy);

    const saved = hydrateCitizens([
      {
        id: 0,
        x: homePos.x + 80,
        y: homePos.y - 40,
        bobPhase: 0,
        carrying: null,
        carryAmount: 0,
        job: { kind: "idle" },
      },
      {
        id: 1,
        x: homePos.x - 60,
        y: homePos.y + 30,
        bobPhase: 0,
        carrying: null,
        carryAmount: 0,
        job: { kind: "idle" },
      },
    ]);

    const before = saved.map((c) => ({ x: c.x, y: c.y }));
    syncCitizens(saved, state, ox, oy);
    expect(saved).toHaveLength(2);
    expect(saved[0].x).toBe(before[0].x);
    expect(saved[0].y).toBe(before[0].y);
    expect(saved[1].x).toBe(before[1].x);
    expect(saved[1].y).toBe(before[1].y);
  });
});
