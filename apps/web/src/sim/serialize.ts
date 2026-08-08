import { createDiplomacy } from "./diplomacy";
import { DEPOSIT_STOCK, FERTILE_STOCK } from "./mapgen";
import { defaultPressure } from "./pressure";
import { normalizePriorities } from "./priorities";
import type {
  DiplomacyState,
  GameState,
  Priorities,
  PressureState,
  ResourceId,
  RunStats,
  Tile,
} from "./types";
import { ensureStarterStockpile, syncBuildingSeq } from "./engine";

/** Pre-v5 Work tab used a single Gather (`production`) quota. */
type LegacyPriorities = Partial<Priorities> & { production?: number };

/**
 * Phaser citizen runtime snapshot (schema v6+).
 * Positions are map-local (relative to map origin) so viewport size changes
 * don't shift workers. Legacy absolute `x`/`y` are still accepted on load.
 */
export interface SavedCitizen {
  id: number;
  /** Position relative to map origin (preferred). */
  lx?: number;
  ly?: number;
  /** Legacy absolute world coords from the first v6 patch. */
  x?: number;
  y?: number;
  bobPhase: number;
  carrying: ResourceId | null;
  carryAmount: number;
  job: unknown;
}

export interface SavedGamePayload {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  tick: number;
  age: GameState["age"];
  resources: GameState["resources"];
  priorities: GameState["priorities"] | LegacyPriorities;
  map: GameState["map"];
  buildings: GameState["buildings"];
  population: GameState["population"];
  research: GameState["research"];
  pressure?: PressureState;
  /** Neighbours, caravan routes, and pending ultimatums (schema v7+) */
  diplomacy?: DiplomacyState;
  rngSeed: number;
  outcome?: GameState["outcome"];
  starvationTicks?: number;
  stats?: RunStats;
  strain?: number;
  /** Worker world positions / jobs — restored into Phaser on load */
  citizens?: SavedCitizen[];
}

function migrateTiles(tiles: Tile[]): Tile[] {
  return tiles.map((t) => {
    const tile: Tile = {
      x: t.x,
      y: t.y,
      terrain: t.terrain === ("sand" as string) || t.terrain === ("fertile" as string)
        ? t.terrain
        : t.terrain,
      deposit: t.deposit ?? null,
      elev: t.elev ?? (t.terrain === "rock" ? 3 : t.terrain === "water" ? 0 : 1),
    };
    // Legacy terrains unknown to older saves stay as-is; ensure stock on deposits / fertile
    if (tile.deposit && (t.stock === undefined || t.stock === null)) {
      tile.stock = DEPOSIT_STOCK[tile.deposit];
    } else if (
      tile.terrain === "fertile" &&
      !tile.deposit &&
      (t.stock === undefined || t.stock === null)
    ) {
      tile.stock = FERTILE_STOCK;
    } else if (t.stock !== undefined) {
      tile.stock = t.stock;
    }
    return tile;
  });
}

export function serialize(state: GameState): SavedGamePayload {
  return {
    schemaVersion: 7,
    tick: state.tick,
    age: state.age,
    resources: state.resources,
    priorities: state.priorities,
    map: state.map,
    buildings: state.buildings,
    population: state.population,
    research: state.research,
    pressure: state.pressure,
    diplomacy: state.diplomacy,
    rngSeed: state.rngSeed,
    outcome: state.outcome,
    starvationTicks: state.starvationTicks,
    stats: state.stats,
    strain: state.strain,
  };
}

const SUPPORTED_SCHEMAS = [1, 2, 3, 4, 5, 6, 7];

/** Fill in neighbours / routes for saves written before the Neighbours update. */
function migrateDiplomacy(
  payload: SavedGamePayload,
  map: GameState["map"],
): DiplomacyState {
  const fresh = createDiplomacy(map);
  const saved = payload.diplomacy;
  if (!saved?.neighbours?.length) return fresh;
  return {
    // Keep freshly-sited camps for any people missing from an older blob
    neighbours: fresh.neighbours.map((base) => {
      const prior = saved.neighbours.find((n) => n.id === base.id);
      return prior ? { ...base, ...prior } : base;
    }),
    routes: saved.routes ?? [],
    demand: saved.demand ?? null,
    nextRouteSeq: saved.nextRouteSeq ?? (saved.routes?.length ?? 0) + 1,
    lastEnvoy: saved.lastEnvoy ?? null,
  };
}

export function deserialize(payload: SavedGamePayload): GameState {
  if (!SUPPORTED_SCHEMAS.includes(payload.schemaVersion)) {
    throw new Error(`Unsupported save schema version: ${payload.schemaVersion}`);
  }
  const map = {
    width: payload.map.width,
    height: payload.map.height,
    tiles: migrateTiles(payload.map.tiles),
  };
  const pressure = payload.pressure ?? defaultPressure(payload.rngSeed);
  const state: GameState = {
    schemaVersion: 7,
    tick: payload.tick,
    age: payload.age,
    resources: payload.resources,
    priorities: normalizePriorities(payload.priorities),
    map,
    buildings: payload.buildings,
    population: payload.population,
    research: payload.research,
    pressure: { ...pressure, raidSource: pressure.raidSource ?? null },
    diplomacy: migrateDiplomacy(payload, map),
    rngSeed: payload.rngSeed,
    paused: false,
    outcome: payload.outcome ?? "playing",
    starvationTicks: payload.starvationTicks ?? 0,
    stats: {
      peakPop: payload.stats?.peakPop ?? payload.population.count,
      raidsSurvived: payload.stats?.raidsSurvived ?? 0,
      raidsFailed: payload.stats?.raidsFailed ?? 0,
      woodHarvested: payload.stats?.woodHarvested ?? 0,
      goodsTraded: payload.stats?.goodsTraded ?? 0,
      tributesPaid: payload.stats?.tributesPaid ?? 0,
      ...(payload.stats?.victoryKind ? { victoryKind: payload.stats.victoryKind } : {}),
    },
    strain: payload.strain ?? 0,
  };
  syncBuildingSeq(state);
  ensureStarterStockpile(state);
  syncBuildingSeq(state);
  return state;
}
