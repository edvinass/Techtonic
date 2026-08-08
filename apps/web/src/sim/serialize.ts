import { DEPOSIT_STOCK } from "./mapgen";
import { defaultPressure } from "./pressure";
import { normalizePriorities } from "./priorities";
import type { GameState, Priorities, PressureState, RunStats, Tile } from "./types";
import { syncBuildingSeq } from "./engine";

/** Pre-v5 Work tab used a single Gather (`production`) quota. */
type LegacyPriorities = Partial<Priorities> & { production?: number };

export interface SavedGamePayload {
  schemaVersion: 1 | 2 | 3 | 4 | 5;
  tick: number;
  age: GameState["age"];
  resources: GameState["resources"];
  priorities: GameState["priorities"] | LegacyPriorities;
  map: GameState["map"];
  buildings: GameState["buildings"];
  population: GameState["population"];
  research: GameState["research"];
  pressure?: PressureState;
  rngSeed: number;
  outcome?: GameState["outcome"];
  starvationTicks?: number;
  stats?: RunStats;
  strain?: number;
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
    // Legacy terrains unknown to older saves stay as-is; ensure stock on deposits
    if (tile.deposit && (t.stock === undefined || t.stock === null)) {
      tile.stock = DEPOSIT_STOCK[tile.deposit];
    } else if (t.stock !== undefined) {
      tile.stock = t.stock;
    }
    return tile;
  });
}

export function serialize(state: GameState): SavedGamePayload {
  return {
    schemaVersion: 5,
    tick: state.tick,
    age: state.age,
    resources: state.resources,
    priorities: state.priorities,
    map: state.map,
    buildings: state.buildings,
    population: state.population,
    research: state.research,
    pressure: state.pressure,
    rngSeed: state.rngSeed,
    outcome: state.outcome,
    starvationTicks: state.starvationTicks,
    stats: state.stats,
    strain: state.strain,
  };
}

export function deserialize(payload: SavedGamePayload): GameState {
  if (
    payload.schemaVersion !== 1 &&
    payload.schemaVersion !== 2 &&
    payload.schemaVersion !== 3 &&
    payload.schemaVersion !== 4 &&
    payload.schemaVersion !== 5
  ) {
    throw new Error(`Unsupported save schema version: ${payload.schemaVersion}`);
  }
  const state: GameState = {
    schemaVersion: 5,
    tick: payload.tick,
    age: payload.age,
    resources: payload.resources,
    priorities: normalizePriorities(payload.priorities),
    map: {
      width: payload.map.width,
      height: payload.map.height,
      tiles: migrateTiles(payload.map.tiles),
    },
    buildings: payload.buildings,
    population: payload.population,
    research: payload.research,
    pressure: payload.pressure ?? defaultPressure(payload.rngSeed),
    rngSeed: payload.rngSeed,
    paused: false,
    outcome: payload.outcome ?? "playing",
    starvationTicks: payload.starvationTicks ?? 0,
    stats: payload.stats ?? {
      peakPop: payload.population.count,
      raidsSurvived: 0,
      raidsFailed: 0,
      woodHarvested: 0,
    },
    strain: payload.strain ?? 0,
  };
  syncBuildingSeq(state);
  return state;
}
