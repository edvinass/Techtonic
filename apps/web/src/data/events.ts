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
    text: "The berry patches fail and stores look thin. Your people look to you — both options cost something.",
    choices: [
      {
        label: "Ration carefully",
        hint: "Spend food now; hunger stays worse for a while",
        effect: {
          result: "Rations stretch the stores — everyone eats less for a while.",
          resources: { food: -18 },
          foodMult: 1.28,
          foodMultTicks: 28,
        },
      },
      {
        label: "Send foragers farther",
        hint: "Spend wood on a wider search; small food return",
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
    text: "A fever spreads among the huts. Elders argue over quarantine versus remedies — neither choice is free.",
    choices: [
      {
        label: "Quarantine the sick",
        hint: "Stops growth for a long time; lose one villager",
        effect: {
          result: "The sick are kept apart. Growth pauses; one does not recover.",
          growthHaltTicks: 36,
          popDelta: -1,
        },
      },
      {
        label: "Brew healing draughts",
        hint: "Spend Knowledge and food; growth continues",
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
        hint: "Spend food & wood; fewer forest tiles burn",
        effect: {
          result: "Buckets and beaters spare most stands. Exhaustion costs food.",
          resources: { food: -14, wood: -8 },
          burnForests: 3,
        },
      },
      {
        label: "Cut a firebreak",
        hint: "Spend more wood; more forest still burns",
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
    text: "Eyes gleam beyond the firelight. The pack is hungry — so are you. Choose how to meet them.",
    choices: [
      {
        label: "Stand watch",
        hint: "Small food cost; outcome depends on Defence readiness",
        effect: {
          result: "Guards hold the line… if you kept Defence high.",
          resources: { food: -8 },
        },
      },
      {
        label: "Leave a tribute of meat",
        hint: "Heavy food cost; avoids a bloodier clash",
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
    text: "A child finds carved stones in a hollow. Scholars itch to study them — or you can leave well enough alone.",
    choices: [
      {
        label: "Study the stones",
        hint: "Gain Knowledge; population growth pauses briefly",
        effect: {
          result: "The markings hint at forgotten craft. Minds race; hands idle.",
          knowledgeDelta: 16,
          growthHaltTicks: 14,
        },
      },
      {
        label: "Leave them be",
        hint: "No risk — find a small food cache instead",
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
    text: "Creeks shrink. Farms wilt. Decide whether to spend materials softening the drought, or endure it.",
    choices: [
      {
        label: "Dig irrigation ditches",
        hint: "Spend wood & stone; hunger rises less",
        effect: {
          result: "Ditches buy time. Hunger still rises, but slower.",
          resources: { wood: -12, stone: -8 },
          foodMult: 1.2,
          foodMultTicks: 20,
        },
      },
      {
        label: "Endure the thirst",
        hint: "No wood/stone cost; harsher hunger for longer",
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
    text: "Elders point at bare hills where forests stood. Rest the woods to ease Land Strain, or push clearings for timber.",
    choices: [
      {
        label: "Rest the woods",
        hint: "Spend food; Land Strain falls",
        effect: {
          result: "Axes are hung. Bellies tighten, but the stands breathe.",
          resources: { food: -16 },
          strainDelta: -18,
        },
      },
      {
        label: "Push the clearings",
        hint: "Gain wood; Land Strain rises and forests burn",
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

/** Concrete bullet lines for challenge choice effects (shown in the modal). */
export function formatEventEffect(effect: EventEffect): string[] {
  const lines: string[] = [];
  if (effect.resources) {
    for (const [k, v] of Object.entries(effect.resources)) {
      if (v == null || v === 0) continue;
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      lines.push(v > 0 ? `Gain ${v} ${label}` : `Lose ${Math.abs(v)} ${label}`);
    }
  }
  if (effect.knowledgeDelta) {
    lines.push(
      effect.knowledgeDelta > 0
        ? `Gain ${effect.knowledgeDelta} Knowledge`
        : `Lose ${Math.abs(effect.knowledgeDelta)} Knowledge`,
    );
  }
  if (effect.popDelta) {
    lines.push(
      effect.popDelta > 0
        ? `Gain ${effect.popDelta} population`
        : `Lose ${Math.abs(effect.popDelta)} population`,
    );
  }
  if (effect.foodMult != null && effect.foodMultTicks) {
    const worse = effect.foodMult > 1;
    lines.push(
      worse
        ? `Hunger ×${effect.foodMult.toFixed(2)} for ${effect.foodMultTicks} ticks`
        : `Easier hunger ×${effect.foodMult.toFixed(2)} for ${effect.foodMultTicks} ticks`,
    );
  }
  if (effect.growthHaltTicks) {
    lines.push(`Population growth paused for ${effect.growthHaltTicks} ticks`);
  }
  if (effect.burnForests) {
    lines.push(`Burns about ${effect.burnForests} forest tiles`);
  }
  if (effect.strainDelta) {
    lines.push(
      effect.strainDelta > 0
        ? `Land Strain +${effect.strainDelta}`
        : `Land Strain ${effect.strainDelta}`,
    );
  }
  return lines;
}
