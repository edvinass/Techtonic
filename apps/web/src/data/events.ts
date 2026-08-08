import type { Resources } from "../sim/types";

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export const SEASON_ORDER: SeasonId[] = ["spring", "summer", "autumn", "winter"];
export const SEASON_LENGTH = 40; // ticks per season

export const SEASON_INFO: Record<
  SeasonId,
  { label: string; blurb: string; foodMult: number }
> = {
  spring: { label: "Spring", blurb: "Growth returns.", foodMult: 1 },
  summer: { label: "Summer", blurb: "Long days, steady foraging.", foodMult: 0.95 },
  autumn: { label: "Autumn", blurb: "Harvest ease — less hunger.", foodMult: 0.8 },
  winter: { label: "Winter", blurb: "Cold bites. Food drains faster.", foodMult: 1.45 },
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
    title: "Poor harvest",
    text: "The berry patches fail and stores look thin. Your people look to you.",
    choices: [
      {
        label: "Ration carefully",
        hint: "−food now, milder ongoing hunger",
        effect: {
          result: "Rations stretch the stores — everyone eats less for a while.",
          resources: { food: -12 },
          foodMult: 1.15,
          foodMultTicks: 24,
        },
      },
      {
        label: "Send foragers farther",
        hint: "−wood, chance to recover food",
        effect: {
          result: "Foragers trek wide and bring back what they can.",
          resources: { wood: -10, food: 8 },
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
        hint: "Growth stalls; saves knowledge",
        effect: {
          result: "The sick are kept apart. Growth pauses, but wisdom is preserved.",
          growthHaltTicks: 30,
        },
      },
      {
        label: "Brew healing draughts",
        hint: "−knowledge, keep growing",
        effect: {
          result: "Healers spend hard-won lore on bitter medicines.",
          knowledgeDelta: -8,
          resources: { food: -5 },
        },
      },
    ],
  },
  {
    id: "wildfire",
    title: "Brush fire",
    text: "Sparks leap through dry grass near the settlement. Act now or lose timber.",
    choices: [
      {
        label: "Fight the flames",
        hint: "−food (effort), save most wood",
        effect: {
          result: "Buckets and beaters spare the stores. Exhaustion costs food.",
          resources: { food: -10, wood: -4 },
        },
      },
      {
        label: "Cut a firebreak",
        hint: "Sacrifice wood to stop the spread",
        effect: {
          result: "You fell trees for a break. The fire dies, but timber burns with it.",
          resources: { wood: -22 },
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
        hint: "Needs Defence priority; else lose food",
        effect: {
          result: "Guards hold the line… if you kept Defence high.",
          // Special-cased in resolve using defence readiness
          resources: { food: -6 },
        },
      },
      {
        label: "Leave a tribute of meat",
        hint: "−food, avoid a worse raid",
        effect: {
          result: "A carcass is left at the treeline. The wolves take it and fade.",
          resources: { food: -18 },
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
          knowledgeDelta: 14,
          growthHaltTicks: 12,
        },
      },
      {
        label: "Leave them be",
        hint: "Safe, small food find nearby",
        effect: {
          result: "You seal the hollow. Foragers notice a overlooked cache instead.",
          resources: { food: 10 },
        },
      },
    ],
  },
];

export function getEventDef(id: string): ChallengeEventDef | undefined {
  return CHALLENGE_EVENTS.find((e) => e.id === id);
}
