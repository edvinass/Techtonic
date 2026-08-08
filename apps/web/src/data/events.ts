import type { Resources } from "../sim/types";

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export const SEASON_ORDER: SeasonId[] = ["spring", "summer", "autumn", "winter"];

/** Ticks per calendar month (1 tick ≈ 1s). Three months make a season. */
export const MONTH_LENGTH = 90;
/** Ticks per season (~4.5 min); full year ~18 min. */
export const SEASON_LENGTH = MONTH_LENGTH * 3;

/** Northern-hemisphere months, three per season starting in spring. */
export const MONTH_NAMES = [
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
] as const;

export function currentMonthName(season: SeasonId, seasonTick: number): string {
  const seasonIdx = SEASON_ORDER.indexOf(season);
  const monthInSeason = Math.min(2, Math.floor(Math.max(0, seasonTick) / MONTH_LENGTH));
  return MONTH_NAMES[seasonIdx * 3 + monthInSeason];
}

export const SEASON_INFO: Record<
  SeasonId,
  { label: string; blurb: string; foodMult: number }
> = {
  spring: { label: "Spring", blurb: "Mud and hope. Forests slowly reclaim clearings.", foodMult: 1.05 },
  summer: { label: "Summer", blurb: "Long days — but mouths still need filling.", foodMult: 1 },
  autumn: { label: "Autumn", blurb: "Harvest ease — less hunger for a while.", foodMult: 0.88 },
  winter: { label: "Winter", blurb: "Frost bites hard. Food drains fast without stores.", foodMult: 1.75 },
};

export type EventEffect = {
  /** Human-readable outcome shown after choice */
  result: string;
  resources?: Partial<Resources>;
  /** Multiply food for N ticks (poor harvest) */
  foodMult?: number;
  foodMultTicks?: number;
  /** Block population growth for N ticks */
  growthHaltTicks?: number;
  popDelta?: number;
  knowledgeDelta?: number;
  /** Burn this many forest tiles on the map */
  burnForests?: number;
  /** Adjust Land Strain (negative eases the land) */
  strainDelta?: number;
};

export type ChallengeEventDef = {
  id: string;
  title: string;
  text: string;
  choices: [
    { label: string; hint: string; effect: EventEffect },
    { label: string; hint: string; effect: EventEffect },
  ];
};

export const CHALLENGE_EVENTS: ChallengeEventDef[] = [
  {
    id: "poor_harvest",
    title: "Failed forage",
    text: "The berry patches fail and stores look thin. Your people look to you.",
    choices: [
      {
        label: "Ration carefully",
        hint: "−food now, harsher ongoing hunger",
        effect: {
          result: "Rations stretch the stores — everyone eats less for a while.",
          resources: { food: -18 },
          foodMult: 1.28,
          foodMultTicks: 28,
        },
      },
      {
        label: "Send foragers farther",
        hint: "−wood, gamble for food",
        effect: {
          result: "Foragers trek wide. Some return empty-handed.",
          resources: { wood: -14, food: 4 },
        },
      },
    ],
  },
  {
    id: "disease",
    title: "Sickness in the camp",
    text: "A fever spreads among the huts. Elders argue over quarantine versus remedies.",
    choices: [
      {
        label: "Quarantine the sick",
        hint: "Growth stalls hard; may lose a villager",
        effect: {
          result: "The sick are kept apart. Growth pauses; one does not recover.",
          growthHaltTicks: 36,
          popDelta: -1,
        },
      },
      {
        label: "Brew healing draughts",
        hint: "−knowledge & food, keep growing",
        effect: {
          result: "Healers spend hard-won lore on bitter medicines.",
          knowledgeDelta: -12,
          resources: { food: -10 },
        },
      },
    ],
  },
  {
    id: "wildfire",
    title: "Wildfire",
    text: "Sparks leap through dry timber near the settlement. Act now or lose the woods.",
    choices: [
      {
        label: "Fight the flames",
        hint: "−food (effort), fewer trees burn",
        effect: {
          result: "Buckets and beaters spare most stands. Exhaustion costs food.",
          resources: { food: -14, wood: -8 },
          burnForests: 3,
        },
      },
      {
        label: "Cut a firebreak",
        hint: "Sacrifice timber — fire still scars the map",
        effect: {
          result: "You fell trees for a break. The fire dies, but the woods are scarred.",
          resources: { wood: -28 },
          burnForests: 6,
        },
      },
    ],
  },
  {
    id: "wolves",
    title: "Wolves at the edge",
    text: "Eyes gleam beyond the firelight. The pack is hungry — so are you.",
    choices: [
      {
        label: "Stand watch",
        hint: "Needs strong Defence / towers; else lose people",
        effect: {
          result: "Guards hold the line… if you kept Defence high.",
          resources: { food: -8 },
        },
      },
      {
        label: "Leave a tribute of meat",
        hint: "Heavy −food, avoid a bloodier raid",
        effect: {
          result: "A carcass is left at the treeline. The wolves take it and fade.",
          resources: { food: -26 },
        },
      },
    ],
  },
  {
    id: "discovery",
    title: "Strange markings",
    text: "A child finds carved stones in a hollow. Scholars itch to study them.",
    choices: [
      {
        label: "Study the stones",
        hint: "+knowledge, briefly pause growth",
        effect: {
          result: "The markings hint at forgotten craft. Minds race; hands idle.",
          knowledgeDelta: 16,
          growthHaltTicks: 14,
        },
      },
      {
        label: "Leave them be",
        hint: "Safe, small food find nearby",
        effect: {
          result: "You seal the hollow. Foragers notice an overlooked cache instead.",
          resources: { food: 12 },
        },
      },
    ],
  },
  {
    id: "drought",
    title: "Dry season",
    text: "Creeks shrink. Farms wilt. Someone must decide how hard to push the land.",
    choices: [
      {
        label: "Dig irrigation ditches",
        hint: "−wood & stone, soften the drought",
        effect: {
          result: "Ditches buy time. Hunger still rises, but slower.",
          resources: { wood: -12, stone: -8 },
          foodMult: 1.2,
          foodMultTicks: 20,
        },
      },
      {
        label: "Endure the thirst",
        hint: "Harsh hunger, no material cost",
        effect: {
          result: "Lips crack. The settlement scrapes by on thin porridge.",
          foodMult: 1.4,
          foodMultTicks: 30,
          resources: { food: -10 },
        },
      },
    ],
  },
  {
    id: "scarred_land",
    title: "Scarred land",
    text: "Elders point at bare hills where forests stood. The soil itself seems thinner. How will you answer the axe?",
    choices: [
      {
        label: "Rest the woods",
        hint: "−food now; ease Land Strain",
        effect: {
          result: "Axes are hung. Bellies tighten, but the stands breathe.",
          resources: { food: -16 },
          strainDelta: -18,
        },
      },
      {
        label: "Push the clearings",
        hint: "+wood now; Land Strain rises",
        effect: {
          result: "Crews fell the last shade. Timber piles high — for a price.",
          resources: { wood: 22, food: -6 },
          burnForests: 2,
          strainDelta: 14,
        },
      },
    ],
  },
];

export function getEventDef(id: string): ChallengeEventDef | undefined {
  return CHALLENGE_EVENTS.find((e) => e.id === id);
}
