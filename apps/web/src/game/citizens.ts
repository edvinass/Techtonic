import type { BuildingInstance, GameState } from "../sim/types";
import { BUILDINGS } from "../data/buildings";
import { gridToScreen } from "./iso";

export type WorkKind = "gather" | "build" | "research" | "farm" | "idle";

export type CitizenJob =
  | { kind: "idle" }
  | { kind: "walk"; tx: number; ty: number; buildingId: string; work: WorkKind }
  | { kind: "work"; buildingId: string; work: WorkKind; timer: number };

export interface Citizen {
  id: number;
  x: number;
  y: number;
  job: CitizenJob;
  bobPhase: number;
  carry: WorkKind | null;
}

function worldOf(gx: number, gy: number, ox: number, oy: number) {
  const { sx, sy } = gridToScreen(gx, gy);
  return { x: ox + sx, y: oy + sy };
}

function workKindFor(building: BuildingInstance): WorkKind {
  if (building.progress < 1) return "build";
  const def = BUILDINGS[building.type];
  if (def.priority === "research") return "research";
  if (building.type === "farm") return "farm";
  if (def.produces) return "gather";
  return "idle";
}

interface Slot {
  buildingId: string;
  x: number;
  y: number;
  work: WorkKind;
}

function buildSlots(state: GameState, ox: number, oy: number): Slot[] {
  const slots: Slot[] = [];
  for (const b of state.buildings) {
    const work = workKindFor(b);
    const wanted =
      b.progress < 1
        ? Math.max(1, Math.min(3, Math.ceil(state.priorities.construction / 30)))
        : Math.max(0, b.workers);
    if (wanted <= 0) continue;
    const pos = worldOf(b.x, b.y, ox, oy);
    for (let i = 0; i < wanted; i++) {
      slots.push({
        buildingId: b.id,
        x: pos.x + ((i % 3) - 1) * 10,
        y: pos.y + Math.floor(i / 3) * 7 - 2,
        work,
      });
    }
  }
  return slots;
}

export function syncCitizens(
  citizens: Citizen[],
  state: GameState,
  ox: number,
  oy: number,
): void {
  const targetCount = Math.min(48, Math.max(0, state.population.count));
  const home =
    state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
  const homePos = home
    ? worldOf(home.x, home.y, ox, oy)
    : worldOf(state.map.width / 2, state.map.height / 2, ox, oy);

  while (citizens.length < targetCount) {
    const id = citizens.length ? Math.max(...citizens.map((c) => c.id)) + 1 : 0;
    citizens.push({
      id,
      x: homePos.x + (Math.random() - 0.5) * 40,
      y: homePos.y + (Math.random() - 0.5) * 20,
      job: { kind: "idle" },
      bobPhase: Math.random() * Math.PI * 2,
      carry: null,
    });
  }
  if (citizens.length > targetCount) {
    citizens.length = targetCount;
  }

  const slots = buildSlots(state, ox, oy);
  const validBuildings = new Set(slots.map((s) => s.buildingId));

  // Drop jobs for removed buildings
  for (const c of citizens) {
    if (
      (c.job.kind === "walk" || c.job.kind === "work") &&
      !validBuildings.has(c.job.buildingId) &&
      c.job.work !== "idle"
    ) {
      c.job = { kind: "idle" };
      c.carry = null;
    }
  }

  const taken = new Map<string, number>();
  for (const c of citizens) {
    if (c.job.kind === "walk" || c.job.kind === "work") {
      if (c.job.work === "idle") continue;
      taken.set(c.job.buildingId, (taken.get(c.job.buildingId) ?? 0) + 1);
    }
  }

  const openSlots: Slot[] = [];
  const needByBuilding = new Map<string, Slot[]>();
  for (const s of slots) {
    const list = needByBuilding.get(s.buildingId) ?? [];
    list.push(s);
    needByBuilding.set(s.buildingId, list);
  }
  for (const [buildingId, list] of needByBuilding) {
    const have = taken.get(buildingId) ?? 0;
    for (let i = have; i < list.length; i++) openSlots.push(list[i]);
  }

  let si = 0;
  for (const c of citizens) {
    if (c.job.kind !== "idle") continue;
    const slot = openSlots[si++];
    if (!slot) break;
    c.job = {
      kind: "walk",
      tx: slot.x,
      ty: slot.y,
      buildingId: slot.buildingId,
      work: slot.work,
    };
  }

  // Idle wander near home
  for (const c of citizens) {
    if (c.job.kind === "idle" && Math.random() < 0.015) {
      c.job = {
        kind: "walk",
        tx: homePos.x + (Math.random() - 0.5) * 80,
        ty: homePos.y + (Math.random() - 0.5) * 40,
        buildingId: home?.id ?? "home",
        work: "idle",
      };
    }
  }

  // Refresh walk targets for workers if building offset slots moved
  for (const c of citizens) {
    if (c.job.kind !== "walk" || c.job.work === "idle") continue;
    const list = needByBuilding.get(c.job.buildingId);
    if (!list?.length) continue;
    // Keep roughly near building
    const anchor = list[0];
    const dist = Math.hypot(c.job.tx - anchor.x, c.job.ty - anchor.y);
    if (dist > 40) {
      c.job.tx = anchor.x + (Math.random() - 0.5) * 16;
      c.job.ty = anchor.y + (Math.random() - 0.5) * 10;
    }
  }
}

export function stepCitizens(citizens: Citizen[], dt: number): void {
  const speed = 0.06 * dt;
  for (const c of citizens) {
    c.bobPhase += dt * 0.014;
    if (c.job.kind === "walk") {
      const dx = c.job.tx - c.x;
      const dy = c.job.ty - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3.5) {
        if (c.job.work === "idle") {
          c.job = { kind: "idle" };
        } else {
          c.job = {
            kind: "work",
            buildingId: c.job.buildingId,
            work: c.job.work,
            timer: 700 + Math.random() * 1400,
          };
          c.carry = c.job.work;
        }
      } else {
        c.x += (dx / dist) * Math.min(speed, dist);
        c.y += (dy / dist) * Math.min(speed * 0.65, dist);
      }
    } else if (c.job.kind === "work") {
      c.job.timer -= dt;
      c.x += Math.sin(c.bobPhase * 2.2) * 0.1;
      c.y += Math.cos(c.bobPhase * 2.2) * 0.05;
      if (c.job.timer <= 0) {
        c.job = {
          kind: "walk",
          tx: c.x + (Math.random() - 0.5) * 22,
          ty: c.y + (Math.random() - 0.5) * 12,
          buildingId: c.job.buildingId,
          work: c.job.work,
        };
      }
    }
  }
}
