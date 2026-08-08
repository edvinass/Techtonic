export type AgeId = "stone" | "farming" | "metal" | "industrial" | "atomic" | "space";

export type ResourceId = "food" | "wood" | "stone" | "metal" | "knowledge";

export type PriorityId = "food" | "construction" | "research" | "production" | "defence";

export type TerrainId = "grass" | "forest" | "rock" | "water";

export type DepositId = "wood" | "stone" | "metal";

export type BuildingId =
  | "house"
  | "lumber_camp"
  | "quarry"
  | "research_hut"
  | "farm"
  | "granary"
  | "mine"
  | "forge"
  | "workshop"
  | "factory"
  | "laboratory"
  | "reactor"
  | "observatory"
  | "launch_pad";

export type TechId =
  | "fire"
  | "primitive_tools"
  | "farming"
  | "metallurgy"
  | "steam_power"
  | "electricity"
  | "atomic_theory"
  | "rocketry";

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export type Resources = Record<ResourceId, number>;
export type Priorities = Record<PriorityId, number>;

export interface PressureState {
  season: SeasonId;
  seasonTick: number;
  nextRaidAt: number;
  /** Countdown; >0 means raid warning active */
  raidWarningTicks: number;
  pendingEventId: string | null;
  eventCooldown: number;
  growthHaltTicks: number;
  /** Extra food consumption multiplier from events */
  foodMult: number;
  foodMultTicks: number;
  lastBanner: string | null;
}

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainId;
  deposit?: DepositId | null;
}

export interface BuildingInstance {
  id: string;
  type: BuildingId;
  x: number;
  y: number;
  /** 0–1 while under construction; 1 when complete */
  progress: number;
  workers: number;
}

export interface ActiveResearch {
  techId: TechId;
  progress: number;
}

export interface GameState {
  schemaVersion: 2;
  tick: number;
  age: AgeId;
  resources: Resources;
  priorities: Priorities;
  map: {
    width: number;
    height: number;
    tiles: Tile[];
  };
  buildings: BuildingInstance[];
  population: {
    count: number;
    housingCap: number;
  };
  research: {
    unlocked: TechId[];
    active: ActiveResearch | null;
  };
  pressure: PressureState;
  rngSeed: number;
  paused: boolean;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  cost: Partial<Resources>;
  buildTicks: number;
  housing?: number;
  workerSlots: number;
  /** Which priority category can staff this building */
  priority: PriorityId;
  produces?: Partial<Resources>;
  /** Required tile deposit, if any */
  requiresDeposit?: DepositId;
  /** Earliest age this building becomes placeable (and later ages) */
  ages: AgeId[];
  /** Tech required to unlock placement */
  requiresTech?: TechId;
  isLandmark?: boolean;
  color: number;
}

export interface TechDef {
  id: TechId;
  name: string;
  description: string;
  costKnowledge: number;
  researchTicks: number;
  requires: TechId[];
  unlocksBuildings?: BuildingId[];
}

export interface AgeDef {
  id: AgeId;
  name: string;
  /** Short blurb shown when this is the current (or final) age */
  blurb: string;
  next?: AgeId;
  keyTech?: TechId;
  landmark?: BuildingId;
  minPopulation?: number;
  cost?: Partial<Resources>;
}
