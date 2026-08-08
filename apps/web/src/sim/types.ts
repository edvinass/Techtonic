export type AgeId = "stone" | "farming" | "metal" | "industrial" | "atomic" | "space";

export type ResourceId = "food" | "wood" | "stone" | "metal" | "energy" | "knowledge";

export type PriorityId =
  | "food"
  | "wood"
  | "stone"
  | "metal"
  | "energy"
  | "construction"
  | "research"
  | "defence"
  | "trade";

export type TerrainId = "grass" | "forest" | "rock" | "water" | "sand" | "fertile";

export type DepositId = "wood" | "stone" | "metal";

export type BuildingId =
  | "house"
  | "stockpile"
  | "lumber_camp"
  | "quarry"
  | "research_hut"
  | "farm"
  | "granary"
  | "mine"
  | "forge"
  | "workshop"
  | "factory"
  | "boiler_house"
  | "power_station"
  | "substation"
  | "laboratory"
  | "reactor"
  | "observatory"
  | "launch_pad"
  | "watchtower"
  | "palisade"
  | "storehouse"
  | "grove_sanctuary"
  | "trade_post"
  | "envoy_hall"
  | "assembly_hall";

export type TechId =
  | "fire"
  | "primitive_tools"
  | "farming"
  | "fortifications"
  | "metallurgy"
  | "steam_power"
  | "electricity"
  | "grid_wiring"
  | "high_voltage"
  | "atomic_theory"
  | "cooling_towers"
  | "rocketry"
  | "selective_cuts"
  | "clearcutting"
  | "stewardship"
  | "trade"
  | "caravan_charter"
  | "border_watch"
  | "diplomacy"
  | "concord";

export type VictoryKind = "ascent" | "harmony" | "concord";

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export type OutcomeId = "playing" | "victory" | "defeat";

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
  /** Which neighbour sent the incoming / most recent raid */
  raidSource: NeighbourId | null;
}

export type NeighbourId = "ridgeback" | "reed_folk" | "ash_wardens";

/** How a neighbour currently regards the settlement. */
export type StanceId = "hostile" | "wary" | "neutral" | "cordial" | "allied";

export interface NeighbourDef {
  id: NeighbourId;
  name: string;
  epithet: string;
  blurb: string;
  /** Direction from map centre used to site their camp */
  dir: { dx: number; dy: number };
  /** Goods they can spare — these are what you can import */
  surplus: ResourceId[];
  /** Goods they are short of — exporting these earns better rates */
  wants: ResourceId[];
  standingStart: number;
  /** How quickly grievance builds while they dislike you (per tick) */
  aggressionRate: number;
  /** How much your Land Strain offends them (0–1) */
  strainSensitivity: number;
  /** Raid weight — how hard their warbands hit */
  might: number;
  color: number;
}

export interface NeighbourState {
  id: NeighbourId;
  /** −100 (blood feud) … 100 (sworn allies) */
  standing: number;
  /** 0–1 grievance; drives tribute demands and raids */
  aggression: number;
  /** Ticks before they will demand or raid again */
  patience: number;
  /** Ticks before another gift will move them */
  giftCooldown: number;
  /** Total goods delivered along routes with this neighbour */
  traded: number;
  /** Camp location on the map */
  x: number;
  y: number;
}

export interface TradeRoute {
  id: string;
  neighbourId: NeighbourId;
  /** Resource you send out each tick */
  give: ResourceId;
  /** Resource their caravan brings back */
  take: ResourceId;
  /** Volume tier 1–3 */
  weight: number;
  /** Import accumulated so far, delivered when the caravan arrives */
  pending: number;
  /** 0–1 progress through the current caravan round trip */
  progress: number;
  /** Consecutive ticks the export could not be paid */
  starvedTicks: number;
  suspended: boolean;
}

export interface TributeDemand {
  neighbourId: NeighbourId;
  cost: Partial<Resources>;
  /** Flavour line shown in the modal */
  text: string;
}

export interface DiplomacyState {
  neighbours: NeighbourState[];
  routes: TradeRoute[];
  /** Pending tribute ultimatum — pauses the game until answered */
  demand: TributeDemand | null;
  nextRouteSeq: number;
  lastEnvoy: string | null;
}

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainId;
  deposit?: DepositId | null;
  /** Remaining gatherable units (deposit stock or fertile forage) */
  stock?: number;
  /** Terrain height for visuals / walk feel (0–4) */
  elev?: number;
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

export interface RunStats {
  peakPop: number;
  raidsSurvived: number;
  raidsFailed: number;
  woodHarvested: number;
  /** Total goods delivered by caravans in both directions */
  goodsTraded: number;
  /** Tribute demands paid rather than refused */
  tributesPaid: number;
  victoryKind?: VictoryKind;
}

export interface GameState {
  schemaVersion: 4 | 5 | 6 | 7 | 8;
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
  diplomacy: DiplomacyState;
  rngSeed: number;
  paused: boolean;
  outcome: OutcomeId;
  /** Consecutive ticks with empty food while population > 1 */
  starvationTicks: number;
  stats: RunStats;
  /**
   * Land Strain (0–100): overharvest scars the world.
   * Raises raid harshness; eases with regrowth and stewardship doctrines.
   */
  strain: number;
  /**
   * Grid saturation last tick (0–1). Consumers run at this fraction when
   * demand exceeds supply + battery.
   */
  powerFactor: number;
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
  /** Energy generated per assigned worker each tick (grid sim, not haul) */
  producesEnergy?: number;
  /**
   * Energy demand each tick when complete.
   * Worker buildings scale by staffed fraction; zero-slot buildings are always-on.
   */
  consumesEnergy?: number;
  /** Wood burned per unit of energy produced */
  fuelWoodPerEnergy?: number;
  /** Adds to the settlement battery cap when complete */
  energyBattery?: number;
  /** Land Strain gained per unit of energy produced */
  strainPerEnergy?: number;
  /** Required tile deposit, if any */
  requiresDeposit?: DepositId;
  /** Earliest age this building becomes placeable (and later ages) */
  ages: AgeId[];
  /** Tech required to unlock placement */
  requiresTech?: TechId;
  isLandmark?: boolean;
  /** Adds to defence readiness when complete */
  defenceBonus?: number;
  /** Reduces food spoilage / winter drain when complete */
  foodStorageBonus?: number;
  /** Gatherers deliver carried resources here (not at the work camp) */
  acceptsDropoff?: boolean;
  /** Trade routes this building can host when complete */
  routeSlots?: number;
  /** Flat bonus to every neighbour's standing drift while complete */
  envoyBonus?: number;
  color: number;
}

export interface TechModifiersDef {
  /** Multiplier on strain gained from harvesting */
  strainGainMult?: number;
  /** Multiplier on wood gather speed */
  woodGatherMult?: number;
  /** Multiplier on forest regrowth / strain ease */
  regrowthMult?: number;
  /** Multiplier on goods received from trade routes */
  tradeRateMult?: number;
  /** Multiplier on defence readiness */
  defenceMult?: number;
  /** Multiplier on how fast standing improves over time */
  standingDriftMult?: number;
  /** Multiplier on standing gained from gifts */
  giftPowerMult?: number;
  /** Extra trade routes each Trade Post supports */
  extraRoutesPerPost?: number;
  /** Multiplier on energy generation */
  energyOutputMult?: number;
  /** Multiplier on energy demand from consumers */
  energyUseMult?: number;
  /** Flat bonus to battery capacity */
  energyBatteryBonus?: number;
  /** Multiplier on wood burned while generating */
  energyFuelMult?: number;
  /** Multiplier on Land Strain from energy generation */
  energyStrainMult?: number;
}

export interface TechDef {
  id: TechId;
  name: string;
  description: string;
  costKnowledge: number;
  researchTicks: number;
  requires: TechId[];
  /** Earliest age in which this tech can be researched */
  minAge: AgeId;
  unlocksBuildings?: BuildingId[];
  /** Mutually exclusive sibling techs — picking one locks the others out */
  exclusiveWith?: TechId[];
  modifiers?: TechModifiersDef;
}

export interface AgeDef {
  id: AgeId;
  name: string;
  /** Short blurb shown when this is the current (or final) age */
  blurb: string;
  next?: AgeId;
  keyTech?: TechId;
  landmark?: BuildingId;
  cost?: Partial<Resources>;
}
