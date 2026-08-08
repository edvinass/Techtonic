import type { NeighbourDef, NeighbourId, ResourceId, StanceId } from "../sim/types";

/**
 * The three peoples who share this valley. Each holds a different surplus,
 * wants different goods, and forms its own opinion of your settlement.
 */
export const NEIGHBOURS: Record<NeighbourId, NeighbourDef> = {
  ridgeback: {
    id: "ridgeback",
    name: "Ridgeback Clan",
    epithet: "Stoneholders of the high scree",
    blurb:
      "Hard people on hard ground. They quarry more stone and ore than they can eat, and they take what they need from anyone soft enough to allow it.",
    dir: { dx: 1, dy: -1 },
    surplus: ["stone", "metal"],
    wants: ["food", "wood"],
    standingStart: -18,
    aggressionRate: 0.0016,
    strainSensitivity: 0.15,
    might: 1.25,
    color: 0x9a6a4a,
  },
  reed_folk: {
    id: "reed_folk",
    name: "Reed Folk",
    epithet: "Fishers of the lower water",
    blurb:
      "Marsh farmers with full drying racks and empty tool sheds. They would rather trade than fight, but a hungry winter can change anyone.",
    dir: { dx: -1, dy: 1 },
    surplus: ["food"],
    wants: ["wood", "stone", "metal"],
    standingStart: 12,
    aggressionRate: 0.0007,
    strainSensitivity: 0.35,
    might: 0.8,
    color: 0x5a9a8a,
  },
  ash_wardens: {
    id: "ash_wardens",
    name: "Ash Wardens",
    epithet: "Keepers of the burned grove",
    blurb:
      "They remember every stand that ever fell. Their archives are deep and their patience is not — scar the land and they will read it as a threat.",
    dir: { dx: -1, dy: -1 },
    surplus: ["knowledge"],
    wants: ["food", "metal"],
    standingStart: 0,
    aggressionRate: 0.001,
    strainSensitivity: 0.9,
    might: 1.0,
    color: 0x7a6aaa,
  },
};

export const NEIGHBOUR_LIST = Object.values(NEIGHBOURS);
export const NEIGHBOUR_IDS = NEIGHBOUR_LIST.map((n) => n.id);

/** Relative worth used to price one good against another. */
export const TRADE_VALUE: Record<ResourceId, number> = {
  food: 1,
  wood: 1.1,
  stone: 1.5,
  metal: 2.6,
  knowledge: 3.2,
};

/** Export volume per tick for each route weight tier. */
export const ROUTE_TIERS = [0, 0.6, 1.2, 2.0];

export const STANCE_INFO: Record<
  StanceId,
  { label: string; blurb: string; color: string }
> = {
  hostile: {
    label: "Hostile",
    blurb: "They raid on sight and refuse every envoy.",
    color: "#d16a6a",
  },
  wary: {
    label: "Wary",
    blurb: "They will trade at poor rates and demand tribute when confident.",
    color: "#d1a05a",
  },
  neutral: {
    label: "Neutral",
    blurb: "Business is business. Fair rates, no favours.",
    color: "#b8bcc4",
  },
  cordial: {
    label: "Cordial",
    blurb: "Good rates and no demands while it lasts.",
    color: "#8fd18a",
  },
  allied: {
    label: "Allied",
    blurb: "Best rates, and they will never march on you.",
    color: "#6ac4e8",
  },
};

export function neighbourDef(id: NeighbourId): NeighbourDef {
  return NEIGHBOURS[id];
}
