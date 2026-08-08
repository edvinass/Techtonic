import type { GameState } from "./types";
import { syncBuildingSeq } from "./engine";

export interface SavedGamePayload {
  schemaVersion: 1;
  tick: number;
  age: GameState["age"];
  resources: GameState["resources"];
  priorities: GameState["priorities"];
  map: GameState["map"];
  buildings: GameState["buildings"];
  population: GameState["population"];
  research: GameState["research"];
  rngSeed: number;
}

export function serialize(state: GameState): SavedGamePayload {
  return {
    schemaVersion: 1,
    tick: state.tick,
    age: state.age,
    resources: state.resources,
    priorities: state.priorities,
    map: state.map,
    buildings: state.buildings,
    population: state.population,
    research: state.research,
    rngSeed: state.rngSeed,
  };
}

export function deserialize(payload: SavedGamePayload): GameState {
  if (payload.schemaVersion !== 1) {
    throw new Error(`Unsupported save schema version: ${payload.schemaVersion}`);
  }
  const state: GameState = {
    schemaVersion: 1,
    tick: payload.tick,
    age: payload.age,
    resources: payload.resources,
    priorities: payload.priorities,
    map: payload.map,
    buildings: payload.buildings,
    population: payload.population,
    research: payload.research,
    rngSeed: payload.rngSeed,
    paused: false,
  };
  syncBuildingSeq(state);
  return state;
}
