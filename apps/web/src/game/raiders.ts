import type { GameState } from "../sim/types";
import { worldPos } from "./gather";

/** Matches pressure.ts raid warning length. */
export const RAID_WARN_TICKS = 10;

export interface Raider {
  id: number;
  x: number;
  y: number;
  bobPhase: number;
  /** Formation offset from pack center (world px). */
  offsetX: number;
  offsetY: number;
  /** Screen-x delta used for facing. */
  facingDx: number;
  moving: boolean;
  alpha: number;
}

export type RaiderGangPhase = "approach" | "clash" | "flee" | "done";

export interface RaiderGang {
  phase: RaiderGangPhase;
  raiders: Raider[];
  /** Pack path start (map edge). */
  sx: number;
  sy: number;
  /** Pack path end (near house). */
  tx: number;
  ty: number;
  /** Smooth 0..1 approach progress. */
  t: number;
  /** ms in clash/flee. */
  resolveAge: number;
  won: boolean;
  /** Last seen warning ticks — detects rising/falling edges. */
  lastWarning: number;
  /** Snapshot so we can tell win vs lose after banner is cleared. */
  survivedAtSpawn: number;
}

const FORMATION: { ox: number; oy: number }[] = [
  { ox: 0, oy: 0 },
  { ox: -22, oy: 10 },
  { ox: 20, oy: 12 },
  { ox: -12, oy: -14 },
  { ox: 16, oy: -10 },
  { ox: -28, oy: -2 },
];

function settlementTarget(
  state: GameState,
  ox: number,
  oy: number,
): { x: number; y: number; gx: number; gy: number } {
  const house =
    state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
  const gx = house?.x ?? Math.floor(state.map.width / 2);
  const gy = house?.y ?? Math.floor(state.map.height / 2);
  const p = worldPos(gx, gy, ox, oy);
  return { x: p.x, y: p.y, gx, gy };
}

/** Pick a map-edge spawn so the pack marches in toward the house. */
function edgeSpawn(
  state: GameState,
  targetGx: number,
  targetGy: number,
  ox: number,
  oy: number,
  seed: number,
): { x: number; y: number } {
  const w = state.map.width;
  const h = state.map.height;
  const side = seed % 4;
  let gx: number;
  let gy: number;
  if (side === 0) {
    // North-ish (low y)
    gx = Math.max(1, Math.min(w - 2, targetGx + ((seed % 7) - 3)));
    gy = 1;
  } else if (side === 1) {
    // East-ish (high x)
    gx = w - 2;
    gy = Math.max(1, Math.min(h - 2, targetGy + ((seed % 7) - 3)));
  } else if (side === 2) {
    // South-ish
    gx = Math.max(1, Math.min(w - 2, targetGx + ((seed % 5) - 2)));
    gy = h - 2;
  } else {
    // West-ish
    gx = 1;
    gy = Math.max(1, Math.min(h - 2, targetGy + ((seed % 5) - 2)));
  }
  return worldPos(gx, gy, ox, oy);
}

function placeRaiders(gang: RaiderGang): void {
  const cx = gang.sx + (gang.tx - gang.sx) * gang.t;
  const cy = gang.sy + (gang.ty - gang.sy) * gang.t;
  const facingDx = gang.tx - gang.sx;
  for (const r of gang.raiders) {
    r.x = cx + r.offsetX;
    r.y = cy + r.offsetY;
    r.facingDx = facingDx;
    r.moving = gang.phase === "approach" || gang.phase === "flee";
  }
}

export function spawnRaiderGang(
  state: GameState,
  ox: number,
  oy: number,
): RaiderGang {
  const target = settlementTarget(state, ox, oy);
  const seed = (state.rngSeed + state.tick * 19) >>> 0;
  const start = edgeSpawn(state, target.gx, target.gy, ox, oy, seed);
  // Stop a little short of the house so they don't sit on top of citizens
  const tx = start.x + (target.x - start.x) * 0.82;
  const ty = start.y + (target.y - start.y) * 0.82;

  const count = 4 + (seed % 3);
  const raiders: Raider[] = [];
  for (let i = 0; i < count; i++) {
    const f = FORMATION[i % FORMATION.length];
    const jitter = ((seed + i * 13) % 7) - 3;
    raiders.push({
      id: i,
      x: start.x + f.ox,
      y: start.y + f.oy,
      bobPhase: i * 1.1,
      offsetX: f.ox + jitter,
      offsetY: f.oy - jitter * 0.5,
      facingDx: tx - start.x,
      moving: true,
      alpha: 1,
    });
  }

  const warn = state.pressure.raidWarningTicks;
  const gang: RaiderGang = {
    phase: "approach",
    raiders,
    sx: start.x,
    sy: start.y,
    tx,
    ty,
    // Mid-warning loads (saves) start partway along the approach
    t: Math.max(0, 1 - warn / RAID_WARN_TICKS),
    resolveAge: 0,
    won: false,
    lastWarning: warn,
    survivedAtSpawn: state.stats.raidsSurvived,
  };
  placeRaiders(gang);
  return gang;
}

/**
 * Drive the visual-only raider pack from `raidWarningTicks`.
 * Returns the gang to keep, or null when it should be destroyed.
 */
export function stepRaiderGang(
  gang: RaiderGang | null,
  state: GameState,
  delta: number,
  ox: number,
  oy: number,
): RaiderGang | null {
  const warning = state.pressure.raidWarningTicks;
  const paused = state.paused || state.outcome !== "playing";

  // Rising edge — spawn a fresh pack
  if (warning > 0 && (!gang || gang.phase === "done")) {
    gang = spawnRaiderGang(state, ox, oy);
  }

  if (!gang) return null;

  // Falling edge — raid resolved; win if survived count rose (banner is cleared by store)
  if (
    gang.phase === "approach" &&
    gang.lastWarning > 0 &&
    warning === 0
  ) {
    gang.won = state.stats.raidsSurvived > gang.survivedAtSpawn;
    gang.phase = gang.won ? "flee" : "clash";
    gang.resolveAge = 0;
    gang.t = 1;
  }

  gang.lastWarning = warning;

  if (!paused) {
    for (const r of gang.raiders) {
      const speed = r.moving ? 0.014 : 0.006;
      r.bobPhase += delta * speed;
    }
  }

  if (gang.phase === "approach") {
    // Smooth toward tick-based progress so motion isn't stepped once/sec
    const targetT = 1 - warning / RAID_WARN_TICKS;
    const rate = paused ? 0 : Math.min(1, delta / 280);
    gang.t += (Math.max(gang.t, targetT) - gang.t) * rate;
    // Keep easing forward slightly even between ticks
    if (!paused && warning > 0) {
      const tickPace = (1 / RAID_WARN_TICKS) * (delta / 1000);
      gang.t = Math.min(targetT + 0.08, gang.t + tickPace * 0.35);
    }
    placeRaiders(gang);
    return gang;
  }

  if (gang.phase === "clash" || gang.phase === "flee") {
    gang.resolveAge += delta;
    const dur = gang.phase === "flee" ? 1600 : 1100;

    if (gang.phase === "flee") {
      // March back toward the edge
      const fleeT = Math.min(1, gang.resolveAge / dur);
      gang.t = 1 - fleeT;
      placeRaiders(gang);
      for (const r of gang.raiders) {
        r.facingDx = gang.sx - gang.tx;
        r.alpha = 1 - fleeT * 0.85;
      }
    } else {
      // Rush the last stretch into camp, then fade
      const rush = Math.min(1, gang.resolveAge / 450);
      gang.t = 1 + rush * 0.12;
      placeRaiders(gang);
      const fade = Math.max(0, (gang.resolveAge - 400) / (dur - 400));
      for (const r of gang.raiders) {
        r.moving = rush < 1;
        r.alpha = 1 - fade;
        // Brief inward scramble without permanently mutating formation
        const pull = 1 - rush * 0.35;
        r.x = gang.sx + (gang.tx - gang.sx) * gang.t + r.offsetX * pull;
        r.y = gang.sy + (gang.ty - gang.sy) * gang.t + r.offsetY * pull;
      }
    }

    if (gang.resolveAge >= dur) {
      gang.phase = "done";
      return null;
    }
    return gang;
  }

  return null;
}
