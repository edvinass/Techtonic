import { BUILDINGS } from "../data/buildings";
import type { GameState, NeighbourId, ResourceId } from "../sim/types";
import { worldPos } from "./gather";

export interface Caravan {
  routeId: string;
  neighbourId: NeighbourId;
  x: number;
  y: number;
  /** Screen-x delta used for facing */
  facingDx: number;
  bobPhase: number;
  /** True while walking out to the camp with your goods */
  outbound: boolean;
  /** What the cart is carrying right now */
  resource: ResourceId;
  /** Eased 0–1 along the current leg */
  t: number;
}

/** Where a route's caravans set out from — a trade building, else any drop-off. */
export function routeOrigin(
  state: GameState,
  id: NeighbourId,
): { x: number; y: number } | null {
  const camp = state.diplomacy.neighbours.find((n) => n.id === id);
  if (!camp) return null;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const b of state.buildings) {
    if (b.progress < 1) continue;
    const def = BUILDINGS[b.type];
    if (!def) continue;
    const isTrade = (def.routeSlots ?? 0) > 0;
    if (!isTrade && !def.acceptsDropoff) continue;
    // Trade buildings always win over a plain stockpile
    const score =
      Math.abs(b.x - camp.x) + Math.abs(b.y - camp.y) + (isTrade ? 0 : 1000);
    if (score < bestScore) {
      bestScore = score;
      best = { x: b.x, y: b.y };
    }
  }
  return best;
}

/**
 * Rebuild the visible caravan carts from live route progress.
 * Purely cosmetic — the sim moves the goods; this shows them on the road.
 */
export function stepCaravans(
  caravans: Caravan[],
  state: GameState,
  delta: number,
  ox: number,
  oy: number,
): Caravan[] {
  const paused = state.paused || state.outcome !== "playing";
  const byRoute = new Map(caravans.map((c) => [c.routeId, c]));
  const next: Caravan[] = [];

  for (const route of state.diplomacy.routes) {
    if (route.suspended) continue;
    const camp = state.diplomacy.neighbours.find((n) => n.id === route.neighbourId);
    const origin = routeOrigin(state, route.neighbourId);
    if (!camp || !origin) continue;

    const home = worldPos(origin.x, origin.y, ox, oy);
    const away = worldPos(camp.x, camp.y, ox, oy);

    // First half of the cycle walks out loaded, second half walks home loaded
    const outbound = route.progress < 0.5;
    const legT = outbound ? route.progress * 2 : (route.progress - 0.5) * 2;
    const from = outbound ? home : away;
    const to = outbound ? away : home;

    const prior = byRoute.get(route.id);
    const cart: Caravan = prior ?? {
      routeId: route.id,
      neighbourId: route.neighbourId,
      x: from.x,
      y: from.y,
      facingDx: to.x - from.x,
      bobPhase: Math.random() * Math.PI * 2,
      outbound,
      resource: route.give,
      t: legT,
    };

    // Snap on leg change, otherwise ease toward the tick-quantised position
    const legChanged = cart.outbound !== outbound;
    cart.outbound = outbound;
    cart.resource = outbound ? route.give : route.take;
    cart.t = legChanged ? legT : Math.max(cart.t, legT);
    if (!paused) {
      cart.bobPhase += delta * 0.011;
      // Creep forward between ticks so the cart never looks stepped
      cart.t = Math.min(1, cart.t + (delta / 1000) * 0.02);
    }

    cart.x = from.x + (to.x - from.x) * cart.t;
    cart.y = from.y + (to.y - from.y) * cart.t;
    cart.facingDx = to.x - from.x;
    next.push(cart);
  }

  return next;
}
