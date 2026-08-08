/**
 * Offline estimate of Ascent / Harmony playtime from balance constants.
 * Run: node scripts/estimate-pacing.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function num(src, re) {
  const m = src.match(re);
  if (!m) throw new Error(`Missing ${re}`);
  return Number(m[1]);
}

const balance = read("src/data/balance.ts");
const ages = read("src/data/ages.ts");
const techs = read("src/data/techs.ts");
const buildings = read("src/data/buildings.ts");
const gather = read("src/game/gather.ts");
const pressure = read("src/sim/pressure.ts");
const events = read("src/data/events.ts");
const strategy = read("src/sim/strategy.ts");

const GROWTH_INTERVAL = num(balance, /GROWTH_INTERVAL = (\d+)/);
const FOOD_PER = num(balance, /FOOD_PER_CITIZEN = ([\d.]+)/);
const foodAgeStep = num(balance, /ageIndex\(age\) \* ([\d.]+)/);

const ascentPops = [...ages.matchAll(/minPopulation: (\d+)/g)].map((m) => Number(m[1]));
const finalPop = ascentPops[ascentPops.length - 1];
const popFloor = (finalPop - 5) * GROWTH_INTERVAL;

const techIds = [
  "fire",
  "primitive_tools",
  "farming",
  "metallurgy",
  "steam_power",
  "electricity",
  "atomic_theory",
  "rocketry",
];
function techNums(id) {
  const block = techs.split(`\n  ${id}:`)[1]?.slice(0, 500) ?? "";
  return {
    know: num(block, /costKnowledge: (\d+)/),
    ticks: num(block, /researchTicks: (\d+)/),
  };
}
const crit = techIds.map(techNums);
const knowSum = crit.reduce((s, t) => s + t.know, 0);
const tickSum = crit.reduce((s, t) => s + t.ticks, 0);

const ageKnow = [...ages.matchAll(/knowledge: (\d+)/g)].map((m) => Number(m[1]));
const ageKnowSum = ageKnow.reduce((a, b) => a + b, 0);

function buildingField(id, field) {
  const block = buildings.split(`\n  ${id}:`)[1]?.slice(0, 600) ?? "";
  return num(block, new RegExp(`${field}: ([\\d.]+)`));
}

const landmarkBuild = ["granary", "forge", "factory", "reactor", "launch_pad"].reduce(
  (s, id) => s + buildingField(id, "buildTicks"),
  0,
);

const foodGather = num(gather, /GATHER_PER_SEC[\s\S]*?food: ([\d.]+)/);
const farmMult = num(buildings.split("\n  farm:")[1]?.slice(0, 400) ?? "", /produces: \{ food: ([\d.]+)/);
const seasonLen = num(events, /SEASON_LENGTH = (\d+)/);
const winterMult = num(events.split("winter:")[1]?.slice(0, 200) ?? "", /foodMult: ([\d.]+)/);
const raidHarshStep = num(pressure, /const ageHarsh = 1 \+ ageIndex\(state\.age\) \* ([\d.]+)/);
const eventChanceStep = num(
  pressure,
  /const eventChance = 0\.\d+ \+ ageIndex\(state\.age\) \* ([\d.]+)/,
);
const harmonyPop = num(strategy, /HARMONY_MIN_POP = (\d+)/);

const researchRate = 1.55;
const researchWall = tickSum / researchRate;
const knowGatherRate = 1.1;
const knowWall = (knowSum + ageKnowSum) / knowGatherRate;
const buildWall = (landmarkBuild + 320) / 2.0;

// Typical play is gated by the slowest chain with substantial setbacks.
const sequentialish = popFloor * 0.62 + Math.max(researchWall, knowWall) * 0.9 + buildWall * 0.5;
const withSetbacks = sequentialish * 1.4;

const harmonyFloor = (harmonyPop - 5) * GROWTH_INTERVAL;
const harmonyKnow =
  techNums("fire").know + techNums("farming").know + techNums("selective_cuts" in {} ? "fire" : "fire").know;
// selective_cuts + stewardship
const sel = techNums("selective_cuts");
const stew = techNums("stewardship");
const harmonyKnowTotal =
  techNums("fire").know + techNums("farming").know + sel.know + stew.know;
const harmonyEst =
  (harmonyFloor * 0.55 +
    harmonyKnowTotal / knowGatherRate +
    (sel.ticks + stew.ticks + techNums("farming").ticks) / researchRate +
    80) *
  1.3;

function fmt(ticks) {
  return `${Math.round(ticks / 60)} min (${(ticks / 3600).toFixed(2)} h)`;
}

function demand(pop, ageIdx, season = 1, storage = 0.9) {
  return pop * FOOD_PER * (1 + ageIdx * foodAgeStep) * season * storage;
}
function farmNet(workers) {
  return workers * foodGather * farmMult * 0.55;
}
function wildNet(workers) {
  return workers * foodGather * 0.7 * 0.5;
}

const samples = [
  { label: "Stone pop8 / 3 wild foragers", demand: demand(8, 0), supply: wildNet(3) },
  { label: "Farming pop32 / 8 farm summer", demand: demand(32, 1), supply: farmNet(8) },
  { label: "Farming pop32 / 11 farm winter+store", demand: demand(32, 1, winterMult, 0.82), supply: farmNet(11) },
  { label: "Atomic pop72 / 20 farm summer", demand: demand(72, 4), supply: farmNet(20) },
  { label: "Atomic pop72 / 28 farm winter+store", demand: demand(72, 4, winterMult, 0.82), supply: farmNet(28) },
];

console.log("=== Techtonic pacing estimate ===");
console.log(`Growth interval: ${GROWTH_INTERVAL} ticks`);
console.log(`Ascent final minPop: ${finalPop} → pop floor ${popFloor} ticks (${fmt(popFloor)})`);
console.log(`Critical-path knowledge: ${knowSum} tech + ${ageKnowSum} age-up = ${knowSum + ageKnowSum}`);
console.log(`Critical-path researchTicks: ${tickSum} → ~${Math.round(researchWall)} ticks at rate ${researchRate}`);
console.log(`Landmark buildTicks sum: ${landmarkBuild}`);
console.log(`Season length: ${seasonLen} (year ${seasonLen * 4}s)`);
console.log(`Raid harshness /age: ${raidHarshStep}; event chance /age: ${eventChanceStep}`);
console.log(`Food gather ${foodGather}/s × farm ${farmMult}`);
console.log("");
console.log(`Estimated Ascent (typical): ${fmt(withSetbacks)}`);
console.log(`  band: ${fmt(withSetbacks * 0.85)} – ${fmt(withSetbacks * 1.2)}`);
console.log(`Estimated Harmony (typical): ${fmt(harmonyEst)}`);
console.log("");
console.log("Food supply vs demand (net food/tick ≈ /sec):");
for (const s of samples) {
  const ratio = s.supply / s.demand;
  const tag = ratio < 0.95 ? "TIGHT/SHORT" : ratio < 1.25 ? "balanced" : "surplus";
  console.log(
    `  ${s.label}: demand ${s.demand.toFixed(2)} supply ${s.supply.toFixed(2)} (${ratio.toFixed(2)}x) [${tag}]`,
  );
}

const ascentOk = withSetbacks >= 6000 && withSetbacks <= 9600;
const rising =
  raidHarshStep >= 0.22 &&
  eventChanceStep >= 0.05 &&
  foodAgeStep >= 0.12 &&
  ascentPops.every((p, i) => i === 0 || p > ascentPops[i - 1]);
const foodOk = samples.every((s) => {
  if (s.label.includes("wild")) return s.supply / s.demand >= 0.65 && s.supply / s.demand <= 1.35;
  if (s.label.includes("winter")) return s.supply / s.demand >= 0.8 && s.supply / s.demand <= 1.35;
  return s.supply / s.demand >= 0.95 && s.supply / s.demand <= 1.45;
});

// Guaranteed metal veins × stock should cover age + landmark metal spend
const metalStock = num(read("src/sim/mapgen.ts"), /metal: (\d+),/);
const guaranteedMetalVeins = 7; // ensureDepositNear metal calls
const ageMetal = [...ages.matchAll(/metal: (\d+)/g)].map((m) => Number(m[1]));
function costMetal(id) {
  const block = buildings.split(`\n  ${id}:`)[1]?.slice(0, 600) ?? "";
  const m = block.match(/cost: \{[^}]*metal: (\d+)/);
  return m ? Number(m[1]) : 0;
}
const metalNeed =
  ageMetal.reduce((a, b) => a + b, 0) +
  ["forge", "factory", "reactor", "launch_pad"].reduce((s, id) => s + costMetal(id), 0);
const metalSupply = guaranteedMetalVeins * metalStock;
const materialsOk = metalSupply >= metalNeed * 0.9;

console.log("");
console.log(`Metal need (ages+landmarks) ≈ ${metalNeed}; guaranteed supply ≈ ${metalSupply}`);
console.log(`CRITERION ascent~2h: ${ascentOk ? "PASS" : "FAIL"} (target 100–160 min)`);
console.log(`CRITERION rising difficulty: ${rising ? "PASS" : "FAIL"}`);
console.log(`CRITERION food balance: ${foodOk ? "PASS" : "FAIL"}`);
console.log(`CRITERION materials winnable: ${materialsOk ? "PASS" : "FAIL"}`);

if (!ascentOk || !rising || !foodOk || !materialsOk) process.exit(1);
