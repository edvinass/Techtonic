import { stanceFor } from "../sim/diplomacy";
import { AGE_ORDER, AGES } from "./ages";
import { BUILDING_LIST } from "./buildings";
import { CHALLENGE_EVENTS, SEASON_INFO, SEASON_ORDER } from "./events";
import { NEIGHBOUR_LIST, STANCE_INFO } from "./neighbours";
import { RESOURCE_ORDER, RESOURCES } from "./resources";
import { TECH_LIST } from "./techs";

export type LibraryCategoryId =
  | "basics"
  | "resources"
  | "workers"
  | "buildings"
  | "tech"
  | "ages"
  | "pressure"
  | "neighbours"
  | "events";

export interface LibraryCategory {
  id: LibraryCategoryId;
  label: string;
  blurb: string;
}

export interface LibraryEntry {
  id: string;
  category: LibraryCategoryId;
  title: string;
  /** One-line list preview */
  summary: string;
  /** Full explanation shown in the detail pane */
  body: string;
}

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  {
    id: "basics",
    label: "How to play",
    blurb: "The core loop and controls — start here.",
  },
  {
    id: "resources",
    label: "Resources",
    blurb: "What each resource does and how you get it.",
  },
  {
    id: "workers",
    label: "Workers",
    blurb: "Assign people to food, lumber, building, research, and defence.",
  },
  {
    id: "buildings",
    label: "Buildings",
    blurb: "Every structure you can place on the map.",
  },
  {
    id: "tech",
    label: "Technology",
    blurb: "Research unlocks buildings and doctrines that shape your path.",
  },
  {
    id: "ages",
    label: "Ages & victory",
    blurb: "Age ascent, Ascent victory, and the Harmony path.",
  },
  {
    id: "pressure",
    label: "Seasons & danger",
    blurb: "Winter, raids, Land Strain, and map terrain.",
  },
  {
    id: "neighbours",
    label: "The valley",
    blurb: "Neighbouring peoples, caravan trade, tribute, and the Concord path.",
  },
  {
    id: "events",
    label: "Challenges",
    blurb: "Random crises that pause the game until you choose.",
  },
];

const BASICS: LibraryEntry[] = [
  {
    id: "basics-goal",
    category: "basics",
    title: "Your goal",
    summary: "Grow a Stone Age camp into a lasting people — or leave the planet.",
    body: "Start with a small camp. Gather finite resources, house your people, research technology, and either climb the ages to launch into space (Ascent) or steward the forests for Harmony. Starve for too long and the settlement collapses.",
  },
  {
    id: "basics-loop",
    category: "basics",
    title: "The core loop",
    summary: "Gather → house → assign workers → build & research → survive pressure.",
    body: "1) Place a Stockpile near forests and rock so gatherers deliver goods quickly.\n2) Build Houses so population can grow.\n3) Open the Work tab and assign people to Food, Wood, Stone, Build, Research, and Defence.\n4) Research Fire early, then Fortifications before raids arrive.\n5) Watch the season pill and Strain meter — winter and thin Defence punish careless camps.",
  },
  {
    id: "basics-controls",
    category: "basics",
    title: "Controls",
    summary: "Pan, zoom, place buildings, pause, and inspect.",
    body: "• WASD or right-drag to pan the map\n• Scroll wheel to zoom\n• Left-click to place a selected building\n• Click a finished building to inspect its stats\n• Esc cancels placement or closes inspect / Library\n• P pauses or resumes\n• Library button (or ? ) opens this reference at any time",
  },
  {
    id: "basics-map",
    category: "basics",
    title: "Map & deposits",
    summary: "Forests, rock, ore, fertile soil, and water shape what you can build.",
    body: "Forest and rock tiles hold finite wood and stone. Metal ore appears later ages. Farms need fertile soil — usually near the river. Hover a tile briefly to see what it offers. Deposits run out; empty stands do not refill instantly, though forests can slowly regrow if Strain stays low and you chose Selective Cuts.",
  },
  {
    id: "basics-food",
    category: "basics",
    title: "Food & starvation",
    summary: "Empty food while people remain will end the run.",
    body: "People eat every tick. Early on, Food workers forage — especially on fertile ground. Farms are steadier than foraging but still need staffing and prefer fertile soil; hunger also climbs each age. Granaries / Storehouses cut winter and event food drain. If food hits zero with population still alive, starvation ticks accumulate until defeat. Keep Food workers high before winter.",
  },
];

const RESOURCE_BLURBS: Record<string, { summary: string; body: string }> = {
  food: {
    summary: "Keeps people alive. Drains harder in winter.",
    body: "Produced by foragers (Food workers) and later by Farms. Farms help, but each age eats more per person. Winter multiplies hunger; Granaries and Storehouses reduce that drain. Running out while people remain causes starvation defeat.",
  },
  wood: {
    summary: "Main building material from finite forests.",
    body: "Chopped from forest deposits. Lumber Camps work faster on wood deposits. Every axe swing raises Land Strain. Selective Cuts eases Strain; Clearcutting speeds harvest at a heavy cost.",
  },
  stone: {
    summary: "Solid building material from rock deposits.",
    body: "Needs Primitive Tools to unlock Quarries. Place Quarries on stone deposits. Used heavily for defence buildings and age-up costs.",
  },
  metal: {
    summary: "Ore for forges, industry, and late ages.",
    body: "Appears once you reach the Metal Age path. Mines sit on metal deposits; Forges and factories consume it for progress toward Ascent.",
  },
  energy: {
    summary: "Powers industry. Flow grid with a small battery.",
    body: "From the Metal Age onward, Boiler Houses (and later Power Stations and Reactors) generate Energy each tick when staffed. Workshops, labs, factories, and other wired buildings draw from the grid. Surplus fills a short battery; if demand exceeds supply the settlement browns out and powered work slows. Grid Wiring, High Voltage, and Cooling Towers upgrade the whole network. Energy is not hauled by citizens — assign Energy workers on the Work tab.",
  },
  knowledge: {
    summary: "Spent to research technologies.",
    body: "Generated by Research workers and Research Huts / Laboratories. Assign Research workers and build a Research Hut (needs Fire) to advance the tech tree faster. Electrified labs need Energy or they stall.",
  },
};

const WORKERS: LibraryEntry[] = [
  {
    id: "workers-overview",
    category: "workers",
    title: "Assigning workers",
    summary: "The Work tab splits your population across jobs.",
    body: "Each person can only do one job. Use + / − on the Work tab to set how many work Food, Wood, Stone, Metal, Energy, Build, Research, Defence, and Trade. Idle people do nothing — leave a few idle only if you have spare mouths. Assigned workers need the right buildings or terrain to be effective (e.g. Wood workers want forests or a Lumber Camp; Energy workers staff Boiler Houses and Power Stations).",
  },
  {
    id: "workers-food",
    category: "workers",
    title: "Food workers",
    summary: "Forage early; staff Farms when unlocked.",
    body: "Without farms, Food workers forage the land — fertile river soil is best. Farms are steadier and shorter hauls, but weaker on grass and never fully remove the need to staff Food as the settlement grows. Always raise Food before winter.",
  },
  {
    id: "workers-build",
    category: "workers",
    title: "Build workers",
    summary: "Advance scaffolds until buildings finish.",
    body: "Selecting a building and clicking the map starts a scaffold that costs resources up front. Build workers walk to the site and raise progress. Cancel refunds the full cost. Landmarks and houses must finish before they count for age-up or housing.",
  },
  {
    id: "workers-research",
    category: "workers",
    title: "Research workers",
    summary: "Spend Knowledge on the Tech tab; huts speed the work.",
    body: "Pick a tech on the Tech tab (costs Knowledge). Research workers advance it over time. Without a Research Hut they study slowly at home — build the hut after Fire for a real pace.",
  },
  {
    id: "workers-trade",
    category: "workers",
    title: "Trade workers",
    summary: "Staff the Trade Post or your caravans crawl.",
    body: "Trade workers man the Trade Post and walk the caravan roads. Route rates scale with how fully your trade buildings are staffed, so a route with nobody on it moves almost nothing. Assign Trade only once a route is open — until then those people are better used elsewhere.",
  },
  {
    id: "workers-defence",
    category: "workers",
    title: "Defence workers & coverage",
    summary: "Readiness and housing coverage decide raid outcomes.",
    body: "Defence workers plus Watchtowers and Palisades raise readiness. Coverage is the share of Houses within range (towers reach 5 tiles, palisades 3). Spread defence near homes — stacking towers far from houses helps little. Research Fortifications to unlock walls and towers.",
  },
  {
    id: "workers-energy",
    category: "workers",
    title: "Energy workers",
    summary: "Staff boilers, stations, and reactors to feed the grid.",
    body: "Energy workers stand post at Boiler Houses, Power Stations, and Reactors. Generation is tick-based (not hauled). Keep enough Energy workers that supply covers your workshops and labs — a brownout shows as a critical Energy chip and slows powered research and gathering.",
  },
];

const PRESSURE: LibraryEntry[] = [
  {
    id: "pressure-seasons",
    category: "pressure",
    title: "Seasons",
    summary: "The year cycles; winter is the hungry season.",
    body: "Spring eases forests and food slightly. Summer is baseline. Autumn softens hunger. Winter multiplies food drain — prepare stores and Food workers ahead of time. The top bar shows the current month and season.",
  },
  {
    id: "pressure-raids",
    category: "pressure",
    title: "Raids",
    summary: "Warned in advance; Defence and coverage matter.",
    body: "Raids announce a countdown in the top bar. When they hit, readiness (towers, walls, Defence workers) and housing coverage decide whether you lose people and goods. Fortify early — do not wait for the first warning.",
  },
  {
    id: "pressure-strain",
    category: "pressure",
    title: "Land Strain",
    summary: "0–100 meter of overharvest scarring the world.",
    body: "Chopping wood (and to a lesser extent mining) raises Strain. High Strain makes raids harsher and can kill forests. Regrowth, resting the woods, Selective Cuts, and Stewardship ease it. Harmony victory requires Strain ≤ 20.",
  },
  {
    id: "pressure-doctrines",
    category: "pressure",
    title: "Doctrines",
    summary: "Selective Cuts vs Clearcutting — pick one forever.",
    body: "After Fire you can research Selective Cuts (slower lumber, low Strain, fast regrowth → Harmony path) or Clearcutting (fast lumber, heavy Strain → Ascent path). Choosing one locks out the other. Stewardship later requires Selective Cuts.",
  },
  {
    id: "pressure-challenges",
    category: "pressure",
    title: "Challenge events",
    summary: "Binary choices that pause the simulation.",
    body: "Random challenges appear as a modal and pause the game until you pick. Each option lists concrete costs and risks (food lost, Strain change, forests burned, growth halted). Read both hints before choosing — there is rarely a free option.",
  },
];

const DIPLOMACY: LibraryEntry[] = [
  {
    id: "diplomacy-overview",
    category: "neighbours",
    title: "Standing & stance",
    summary: "Every people keeps a −100 to 100 opinion of you.",
    body: "Three peoples share the valley. Each holds a standing from −100 (blood feud) to 100 (sworn allies), shown on the Valley tab, which settles toward what your behaviour deserves: open trade routes, gifts of what they want, an Envoy Hall, and the Diplomacy doctrine all pull it up; heavy Land Strain, refused tribute, and closed routes pull it down. Stance — Hostile, Wary, Neutral, Cordial, Allied — is just a band of that number, and it decides who raids you and who trades with you.",
  },
  {
    id: "diplomacy-trade",
    category: "neighbours",
    title: "Caravan routes",
    summary: "Send a surplus, receive what you cannot dig up yourself.",
    body: "Research Trade and build a Trade Post — each post hosts a route, and Caravan Charter adds more. A route sends one resource out and brings another back on a round trip whose length depends on how far the camp is. Rates depend on the goods traded (they pay well for what they want), the volume tier you set, your standing, and how many Trade workers you have assigned; understaffed routes crawl, and a route that cannot pay its export suspends itself. Every delivery also nudges standing up, so trade is the cheapest road to peace.",
  },
  {
    id: "diplomacy-gifts",
    category: "neighbours",
    title: "Gifts",
    summary: "A direct payment of goodwill, on a cooldown.",
    body: "Gifting a people something they want raises standing immediately, then puts that people on a cooldown before another gift lands. Gifts are the fastest way to pull someone off a raid footing, but they are pure cost — trade routes buy the same goodwill while paying for themselves.",
  },
  {
    id: "diplomacy-demands",
    category: "neighbours",
    title: "Tribute demands",
    summary: "Hostile neighbours ask for goods before they take them.",
    body: "As grievance builds, a hostile or wary people sends an ultimatum and the game pauses. Paying costs real resources but raises standing, drains most of their grievance, and buys a long quiet. Refusing keeps the goods and sends their grievance to full — a warband arrives shortly after. Refusing is a reasonable play behind towers and walls; it is a disaster on an open camp.",
  },
  {
    id: "diplomacy-raids",
    category: "neighbours",
    title: "Who raids you",
    summary: "Raids now belong to a people, and results feed back.",
    body: "Raids are launched by a specific neighbour — usually the angriest one — and their might scales the damage. Beating off a raid drains their grievance but costs standing on both sides; being overrun emboldens them. Border Watch improves your defence against everyone, but the durable fix is that nobody wants to raid a trading partner.",
  },
];

const AGES_VICTORY: LibraryEntry[] = [
  {
    id: "victory-ascent",
    category: "ages",
    title: "Ascent victory",
    summary: "Climb ages and complete the Launch Pad.",
    body: "Each age needs a key technology, a landmark building, and a resource payment. Finish the chain through Atomic into Space by building the Launch Pad after Rocketry. This is the industrial / spacefaring win.",
  },
  {
    id: "victory-harmony",
    category: "ages",
    title: "Harmony victory",
    summary: "Steward the woods instead of leaving them.",
    body: "Research Selective Cuts, then Stewardship. Build the Grove Sanctuary. Reach population ≥ 48, keep forest cover ≥ 30%, and Land Strain ≤ 20, then Claim Harmony on the Age tab. You do not need the Launch Pad.",
  },
  {
    id: "victory-concord",
    category: "ages",
    title: "Concord victory",
    summary: "Win the valley over instead of leaving it or out-living it.",
    body: "Research Diplomacy then Concord, and build the Assembly Hall. Every neighbouring people must stand at Cordial or better, you need enough population to matter, and enough goods must have moved along your caravan routes to prove the peace is real, not bought yesterday. Then Claim Concord on the Age tab. It is the slowest path — trade and gifts take time to move standing — but it needs no rocket and no pristine forest.",
  },
];

function resourceEntries(): LibraryEntry[] {
  return RESOURCE_ORDER.map((id) => {
    const blurb = RESOURCE_BLURBS[id];
    return {
      id: `resource-${id}`,
      category: "resources" as const,
      title: RESOURCES[id].label,
      summary: blurb.summary,
      body: blurb.body,
    };
  });
}

function buildingEntries(): LibraryEntry[] {
  return BUILDING_LIST.map((b) => {
    const bits: string[] = [b.description];
    const cost = Object.entries(b.cost)
      .map(([k, v]) => `${v} ${RESOURCES[k as keyof typeof RESOURCES].label}`)
      .join(", ");
    bits.push(`Cost: ${cost}.`);
    if (b.housing) bits.push(`Housing: +${b.housing}.`);
    if (b.workerSlots > 0) bits.push(`Staff slots: ${b.workerSlots}.`);
    if (b.requiresDeposit) {
      bits.push(`Must be placed on a ${RESOURCES[b.requiresDeposit].label.toLowerCase()} deposit.`);
    }
    if (b.requiresTech) bits.push(`Requires tech before it appears in Build.`);
    if (b.isLandmark) bits.push("Landmark — required for age ascent or a victory path.");
    if (b.defenceBonus) bits.push("Adds defence readiness; place near houses for coverage.");
    if (b.foodStorageBonus) bits.push("Reduces winter and event food drain.");
    if (b.acceptsDropoff) bits.push("Gatherers deliver carried goods here.");
    if (b.producesEnergy) {
      bits.push(`Generates ${b.producesEnergy} Energy per worker each tick.`);
    }
    if (b.consumesEnergy) {
      bits.push(
        b.workerSlots > 0
          ? `Draws up to ${b.consumesEnergy} Energy per tick when fully staffed.`
          : `Draws ${b.consumesEnergy} Energy per tick while complete.`,
      );
    }
    if (b.energyBattery) bits.push(`Adds ${b.energyBattery} to the grid battery.`);
    if (b.fuelWoodPerEnergy) {
      bits.push(`Burns about ${b.fuelWoodPerEnergy} wood per Energy produced.`);
    }
    return {
      id: `building-${b.id}`,
      category: "buildings" as const,
      title: b.name,
      summary: b.description,
      body: bits.join(" "),
    };
  });
}

function techEntries(): LibraryEntry[] {
  return TECH_LIST.map((t) => {
    const bits: string[] = [t.description];
    bits.push(`Costs ${t.costKnowledge} Knowledge.`);
    if (t.requires.length) {
      bits.push(`Requires: ${t.requires.map((id) => TECH_LIST.find((x) => x.id === id)?.name ?? id).join(", ")}.`);
    }
    bits.push(`Available from the ${AGES[t.minAge].name}.`);
    if (t.unlocksBuildings?.length) {
      bits.push(
        `Unlocks: ${t.unlocksBuildings.map((id) => BUILDING_LIST.find((b) => b.id === id)?.name ?? id).join(", ")}.`,
      );
    }
    if (t.exclusiveWith?.length) {
      bits.push(
        `Exclusive with: ${t.exclusiveWith.map((id) => TECH_LIST.find((x) => x.id === id)?.name ?? id).join(", ")}.`,
      );
    }
    return {
      id: `tech-${t.id}`,
      category: "tech" as const,
      title: t.name,
      summary: t.description,
      body: bits.join(" "),
    };
  });
}

function ageEntries(): LibraryEntry[] {
  return AGE_ORDER.map((id) => {
    const age = AGES[id];
    const bits: string[] = [age.blurb];
    if (age.next) {
      const next = AGES[age.next];
      bits.push(`Next age: ${next.name}.`);
      if (age.keyTech) {
        const tech = TECH_LIST.find((t) => t.id === age.keyTech);
        bits.push(`Key tech: ${tech?.name ?? age.keyTech}.`);
      }
      if (age.landmark) {
        const b = BUILDING_LIST.find((x) => x.id === age.landmark);
        bits.push(`Landmark: ${b?.name ?? age.landmark}.`);
      }
    }
    return {
      id: `age-${id}`,
      category: "ages" as const,
      title: age.name,
      summary: age.blurb,
      body: bits.join(" "),
    };
  });
}

function seasonEntries(): LibraryEntry[] {
  return SEASON_ORDER.map((id) => {
    const s = SEASON_INFO[id];
    const hunger =
      s.foodMult > 1
        ? `Food drain ×${s.foodMult.toFixed(2)} (harsher).`
        : s.foodMult < 1
          ? `Food drain ×${s.foodMult.toFixed(2)} (easier).`
          : "Baseline food drain.";
    return {
      id: `season-${id}`,
      category: "pressure" as const,
      title: s.label,
      summary: s.blurb,
      body: `${s.blurb} ${hunger}`,
    };
  });
}

function eventEntries(): LibraryEntry[] {
  return CHALLENGE_EVENTS.map((e) => {
    const choices = e.choices
      .map((c, i) => `${i === 0 ? "A" : "B"}) ${c.label}: ${c.hint}`)
      .join("\n");
    return {
      id: `event-${e.id}`,
      category: "events" as const,
      title: e.title,
      summary: e.text,
      body: `${e.text}\n\nChoices:\n${choices}`,
    };
  });
}

function neighbourEntries(): LibraryEntry[] {
  return NEIGHBOUR_LIST.map((n) => {
    const spares = n.surplus.map((r) => RESOURCES[r].label).join(" and ");
    const wants = n.wants.map((r) => RESOURCES[r].label).join(" and ");
    return {
      id: `neighbour-${n.id}`,
      category: "neighbours" as const,
      title: n.name,
      summary: n.epithet,
      body: `${n.blurb} They can spare ${spares} and will pay well for ${wants}. They start out ${STANCE_INFO[stanceFor(n.standingStart)].label.toLowerCase()} toward you.`,
    };
  });
}

export const LIBRARY_ENTRIES: LibraryEntry[] = [
  ...BASICS,
  ...resourceEntries(),
  ...WORKERS,
  ...buildingEntries(),
  ...techEntries(),
  ...AGES_VICTORY,
  ...ageEntries(),
  ...PRESSURE,
  ...DIPLOMACY,
  ...neighbourEntries(),
  ...seasonEntries(),
  ...eventEntries(),
];

export function getLibraryEntry(id: string): LibraryEntry | undefined {
  return LIBRARY_ENTRIES.find((e) => e.id === id);
}

export function libraryEntriesFor(category: LibraryCategoryId): LibraryEntry[] {
  return LIBRARY_ENTRIES.filter((e) => e.category === category);
}
