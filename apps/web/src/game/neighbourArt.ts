import type { GameObjects } from "phaser";
import { STANCE_INFO } from "../data/neighbours";
import type { NeighbourDef, ResourceId, StanceId } from "../sim/types";
import { drawResourceMark } from "./resourceArt";
import { TILE_HEIGHT, TILE_WIDTH } from "./iso";

const HW = TILE_WIDTH / 2;
const HH = TILE_HEIGHT / 2;

/** Ring colour under a camp, so stance reads at a glance from the map. */
const STANCE_TINT: Record<StanceId, number> = {
  hostile: 0xc4523a,
  wary: 0xc98a3a,
  neutral: 0x8a8f98,
  cordial: 0x6aa85a,
  allied: 0x5ac4a8,
};

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function tent(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  color: number,
) {
  const w = 11 * scale;
  const h = 15 * scale;
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x, y + 1, w * 2.1, 5 * scale);
  g.fillStyle(shade(color, 0.78), 1);
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w, y + 2);
  g.lineTo(x - w, y + 2);
  g.closePath();
  g.fillPath();
  g.fillStyle(shade(color, 1.15), 1);
  g.beginPath();
  g.moveTo(x, y - h);
  g.lineTo(x + w, y + 2);
  g.lineTo(x + w * 0.15, y + 2);
  g.closePath();
  g.fillPath();
  // Door flap
  g.fillStyle(0x241a12, 0.75);
  g.beginPath();
  g.moveTo(x - 1 * scale, y - h * 0.5);
  g.lineTo(x + 3.5 * scale, y + 2);
  g.lineTo(x - 4.5 * scale, y + 2);
  g.closePath();
  g.fillPath();
}

/**
 * A neighbouring settlement's camp. Drawn at the tile top, origin-centred,
 * the same way building art is.
 */
export function drawNeighbourCamp(
  g: GameObjects.Graphics,
  def: NeighbourDef,
  stance: StanceId,
  pulse: number,
) {
  const tint = STANCE_TINT[stance];

  // Trodden ground ring in the stance colour
  g.fillStyle(0x000000, 0.16);
  g.fillEllipse(0, 3, (HW + 6) * 2, (HH + 3) * 2);
  g.fillStyle(shade(def.color, 0.5), 0.45);
  g.fillEllipse(0, 3, (HW + 2) * 2, (HH + 1) * 2);
  g.lineStyle(2, tint, 0.55 + 0.2 * Math.sin(pulse));
  g.strokeEllipse(0, 3, (HW + 5) * 2, (HH + 2.5) * 2);

  tent(g, -13, 6, 0.85, def.color);
  tent(g, 12, 8, 0.8, shade(def.color, 0.9));
  tent(g, -1, -2, 1.05, shade(def.color, 1.08));

  // Cook fire between the tents
  g.fillStyle(0x3a2a1c, 1);
  g.fillEllipse(9, -3, 9, 4);
  const flame = 0.7 + 0.3 * Math.sin(pulse * 2.3);
  g.fillStyle(0xd06a2a, 0.9 * flame);
  g.fillCircle(9, -6, 3.2 * flame + 1);
  g.fillStyle(0xf5c96a, 0.8 * flame);
  g.fillCircle(9, -7, 1.6 * flame + 0.6);

  // Standard: their colour, ringed in their current mood
  g.fillStyle(0x5a3d22, 1);
  g.fillRect(-1, -40, 2, 18);
  g.fillStyle(def.color, 0.95);
  g.beginPath();
  g.moveTo(1, -40);
  g.lineTo(13, -35.5);
  g.lineTo(1, -31);
  g.closePath();
  g.fillPath();
  g.fillStyle(tint, 0.9);
  g.fillCircle(0, -42, 2.6);
}

export interface CaravanDraw {
  x: number;
  y: number;
  facingDx: number;
  bobPhase: number;
  resource: ResourceId;
  color: number;
}

/** A laden cart trundling between your trade post and a camp. */
export function drawCaravan(g: GameObjects.Graphics, c: CaravanDraw) {
  const face = c.facingDx >= 0 ? 1 : -1;
  const bob = Math.sin(c.bobPhase) * 1.2;
  const x = c.x;
  const y = c.y + bob;

  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(x, c.y + 4, 20, 7);

  // Drover
  g.fillStyle(0x3a2a1c, 1);
  g.fillRect(x - face * 11, y - 11, 3.4, 8);
  g.fillStyle(0xd4a574, 1);
  g.fillCircle(x - face * 9.4, y - 13, 2.8);

  // Cart bed and canopy in the neighbour's colours
  g.fillStyle(0x6a4a2a, 1);
  g.fillRect(x - 7, y - 8, 15, 6);
  g.fillStyle(shade(c.color, 1.15), 0.95);
  g.beginPath();
  g.moveTo(x - 7, y - 8);
  g.lineTo(x + 0.5, y - 15);
  g.lineTo(x + 8, y - 8);
  g.closePath();
  g.fillPath();

  // Wheels
  g.fillStyle(0x2a1c10, 1);
  g.fillCircle(x - 4, y - 1.5, 3);
  g.fillCircle(x + 5, y - 1.5, 3);
  g.fillStyle(0x8a6a44, 1);
  g.fillCircle(x - 4, y - 1.5, 1.1);
  g.fillCircle(x + 5, y - 1.5, 1.1);

  drawResourceMark(g, x + face * 1, y - 22, c.resource, 0.42);
}

export function stanceLabel(stance: StanceId): string {
  return STANCE_INFO[stance].label;
}
