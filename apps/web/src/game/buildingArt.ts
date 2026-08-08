import type { GameObjects } from "phaser";
import type { AgeId, BuildingId } from "../sim/types";
import { TILE_HEIGHT, TILE_WIDTH } from "./iso";

type Pt = { x: number; y: number };

const HW = TILE_WIDTH / 2;
const HH = TILE_HEIGHT / 2;

function fillPoly(g: GameObjects.Graphics, pts: Pt[], color: number, alpha: number) {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
}

function strokePoly(
  g: GameObjects.Graphics,
  pts: Pt[],
  color: number,
  alpha: number,
  width = 1,
) {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.strokePath();
}

/** Diamond footprint matching the tile's 2:1 isometric ratio. */
function diamond(cx: number, cy: number, hw: number, hh: number) {
  return {
    N: { x: cx, y: cy - hh },
    E: { x: cx + hw, y: cy },
    S: { x: cx, y: cy + hh },
    W: { x: cx - hw, y: cy },
  };
}

function lift(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h };
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function isoShadow(g: GameObjects.Graphics, alpha: number, scale = 1) {
  // Soft contact shadow — ellipse wash + diamond core (strategy-map depth cue)
  g.fillStyle(0x000000, 0.12 * alpha);
  g.fillEllipse(1, 3, (HW - 2) * 2 * scale, (HH + 2) * 2 * scale);
  const d = diamond(0, 2, (HW - 4) * scale, (HH - 2) * scale);
  fillPoly(g, [d.N, d.E, d.S, d.W], 0x000000, 0.2 * alpha);
}

/** Extruded isometric box with optional flat top and rim lighting. */
function isoBox(
  g: GameObjects.Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  height: number,
  color: number,
  alpha: number,
  opts?: { top?: number; stroke?: boolean; rim?: boolean },
) {
  const base = diamond(cx, cy, hw, hh);
  const top = {
    N: lift(base.N, height),
    E: lift(base.E, height),
    S: lift(base.S, height),
    W: lift(base.W, height),
  };
  const left = shade(color, 0.68);
  const right = shade(color, 0.88);
  const lid = opts?.top ?? shade(color, 1.14);

  fillPoly(g, [base.W, base.S, top.S, top.W], left, alpha);
  fillPoly(g, [base.S, base.E, top.E, top.S], right, alpha);
  fillPoly(g, [top.N, top.E, top.S, top.W], lid, alpha);

  // Soft NE rim so boxes read as lit solids, not flat stamps
  if (opts?.rim !== false) {
    g.lineStyle(1.2, shade(color, 1.35), 0.4 * alpha);
    g.lineBetween(top.N.x, top.N.y, top.E.x, top.E.y);
    g.lineStyle(1, shade(color, 1.2), 0.22 * alpha);
    g.lineBetween(top.N.x, top.N.y, top.W.x, top.W.y);
  }

  if (opts?.stroke !== false) {
    strokePoly(g, [top.N, top.E, top.S, top.W], shade(color, 0.5), 0.4 * alpha, 1);
    g.lineStyle(1, shade(color, 0.42), 0.32 * alpha);
    g.lineBetween(base.S.x, base.S.y, top.S.x, top.S.y);
  }

  return { base, top };
}

/** Warm lit window on the SE (right) face of an iso box. */
function isoWindow(
  g: GameObjects.Graphics,
  base: { E: Pt; S: Pt },
  wallH: number,
  alpha: number,
  opts?: { lit?: boolean; ox?: number; oy?: number; w?: number; h?: number },
) {
  const lit = opts?.lit !== false;
  const ox = opts?.ox ?? -8;
  const oy = opts?.oy ?? -wallH * 0.45;
  const w = opts?.w ?? 4.5;
  const h = opts?.h ?? 4.5;
  const cx = base.E.x + ox;
  const cy = base.E.y + oy;
  fillPoly(
    g,
    [
      { x: cx - w * 0.5, y: cy },
      { x: cx + w * 0.5, y: cy - w * 0.25 },
      { x: cx + w * 0.5, y: cy - w * 0.25 - h },
      { x: cx - w * 0.5, y: cy - h },
    ],
    lit ? 0xf0d080 : 0x3a4a58,
    (lit ? 0.75 : 0.55) * alpha,
  );
  if (lit) {
    g.fillStyle(0xfff3c4, 0.35 * alpha);
    g.fillCircle(cx, cy - h * 0.45, w * 0.55);
  }
}

/** Simple chimney stack rising from a roof ridge. */
function isoChimney(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  alpha: number,
  color = 0x6a4a3a,
) {
  isoBox(g, x, y, 3.2, 1.6, 8, color, alpha, { top: shade(color, 0.85), rim: true });
  g.fillStyle(0x3a2818, 0.55 * alpha);
  g.fillEllipse(x, y - 9, 4.5, 2);
}

/** Gabled roof with ridge along the W–E axis (screen-horizontal). */
function isoGableRoof(
  g: GameObjects.Graphics,
  top: { N: Pt; E: Pt; S: Pt; W: Pt },
  roofH: number,
  color: number,
  alpha: number,
) {
  const ridgeW = lift(top.W, roofH);
  const ridgeE = lift(top.E, roofH);
  const north = shade(color, 0.85);
  const south = shade(color, 1.05);
  const edge = shade(color, 0.55);

  fillPoly(g, [top.N, top.E, ridgeE, ridgeW], north, alpha);
  fillPoly(g, [top.W, top.S, ridgeE, ridgeW], south, alpha);
  // Thin ridge highlight
  g.lineStyle(1.5, shade(color, 1.25), 0.55 * alpha);
  g.lineBetween(ridgeW.x, ridgeW.y, ridgeE.x, ridgeE.y);
  strokePoly(g, [top.N, top.E, ridgeE, ridgeW], edge, 0.4 * alpha, 1);
  strokePoly(g, [top.W, top.S, ridgeE, ridgeW], edge, 0.35 * alpha, 1);
}

/** Horizontal construction bar floating above the scaffold. */
function progressBar(g: GameObjects.Graphics, progress: number, aboveY: number) {
  const w = 30;
  const h = 5;
  const x = -w / 2;
  const y = -aboveY - 10;
  const t = Math.max(0, Math.min(1, progress));

  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 1, y + 1, w, h, 2);
  g.fillStyle(0x1b2618, 0.9);
  g.fillRoundedRect(x, y, w, h, 2);
  if (t > 0) {
    g.fillStyle(0xe8c95a, 1);
    g.fillRoundedRect(x + 1, y + 1, Math.max(2, (w - 2) * t), h - 2, 1.5);
  }
  g.lineStyle(1, 0x3a4a32, 0.85);
  g.strokeRoundedRect(x, y, w, h, 2);
}

function scaffold(g: GameObjects.Graphics, alpha: number, height: number) {
  // Soft posts + plank rails — reads as construction, not a wireframe glitch
  const d = diamond(0, 0, HW - 8, HH - 4);
  for (const p of [d.N, d.E, d.S, d.W]) {
    g.lineStyle(3, 0x6b4a2a, 0.55 * alpha);
    g.lineBetween(p.x, p.y, p.x, p.y - height);
    g.fillStyle(0x8a6a3a, 0.65 * alpha);
    g.fillCircle(p.x, p.y - height, 1.8);
  }
  const mid = height * 0.5;
  g.lineStyle(2.5, 0x8a6238, 0.5 * alpha);
  g.lineBetween(d.W.x, d.W.y - mid, d.E.x, d.E.y - mid);
  g.lineBetween(d.N.x, d.N.y - mid, d.S.x, d.S.y - mid);
}

/** Draw a building centered at (0,0) ground point, matching the iso tile diamond. */
export function drawBuildingArt(
  g: GameObjects.Graphics,
  type: BuildingId,
  opts: { alpha?: number; age?: AgeId; progress?: number; active?: boolean },
): void {
  const alpha = opts.alpha ?? 1;
  const progress = opts.progress ?? 1;
  const age = opts.age ?? "stone";
  isoShadow(g, alpha);

  switch (type) {
    case "house":
      drawHouse(g, alpha, age);
      break;
    case "stockpile":
      drawStockpile(g, alpha);
      break;
    case "lumber_camp":
      drawLumberCamp(g, alpha);
      break;
    case "quarry":
      drawQuarry(g, alpha);
      break;
    case "research_hut":
      drawResearchHut(g, alpha);
      break;
    case "farm":
      drawFarm(g, alpha);
      break;
    case "granary":
      drawGranary(g, alpha);
      break;
    case "mine":
      drawMine(g, alpha);
      break;
    case "forge":
      drawForge(g, alpha);
      break;
    case "workshop":
      drawWorkshop(g, alpha);
      break;
    case "factory":
      drawFactory(g, alpha);
      break;
    case "laboratory":
      drawLaboratory(g, alpha);
      break;
    case "reactor":
      drawReactor(g, alpha);
      break;
    case "observatory":
      drawObservatory(g, alpha);
      break;
    case "launch_pad":
      drawLaunchPad(g, alpha);
      break;
    case "watchtower":
      drawWatchtower(g, alpha);
      break;
    case "palisade":
      drawPalisade(g, alpha);
      break;
    case "storehouse":
      drawStorehouse(g, alpha);
      break;
    case "grove_sanctuary":
      drawGroveSanctuary(g, alpha);
      break;
  }

  if (progress < 1) {
    const tall =
      type === "granary" ||
      type === "factory" ||
      type === "reactor" ||
      type === "launch_pad" ||
      type === "grove_sanctuary";
    const scaffoldH = tall ? 36 : 28;
    scaffold(g, alpha, scaffoldH);
    progressBar(g, progress, scaffoldH);
  } else if (opts.active) {
    // Soft activity pulse — warm wash under the silhouette
    const glow = diamond(0, -8, 20, 11);
    fillPoly(g, [glow.N, glow.E, glow.S, glow.W], 0xfff3c4, 0.1 * alpha);
    g.fillStyle(0xe8c95a, 0.14 * alpha);
    g.fillEllipse(0, -6, 22, 10);
  }
}

function drawHouse(g: GameObjects.Graphics, a: number, age: AgeId) {
  const era =
    age === "stone"
      ? 0
      : age === "farming" || age === "metal"
        ? 1
        : age === "industrial"
          ? 2
          : 3;

  const wall =
    era === 0 ? 0xb8956a : era === 1 ? 0xd4b896 : era === 2 ? 0xb8a090 : 0xc8d0d8;
  const roof =
    era === 0 ? 0x6b8f4e : era === 1 ? 0x8f6a3a : era === 2 ? 0x4a5560 : 0x3a4a58;
  const hw = HW - 8;
  const hh = HH - 4;
  const wallH = era >= 2 ? 18 : 16;

  // Stone/plaster foundation pad for later ages
  if (era >= 1) {
    const pad = diamond(0, 2, hw + 2, hh + 1);
    fillPoly(g, [pad.N, pad.E, pad.S, pad.W], era >= 2 ? 0x7a8088 : 0x8a7a60, 0.7 * a);
  }

  const { base, top } = isoBox(g, 0, 0, hw, hh, wallH, wall, a, {
    top: shade(wall, 0.95),
  });

  // Timber / masonry detail on faces
  if (era <= 1) {
    g.lineStyle(1.2, 0x5a3d22, 0.55 * a);
    g.lineBetween(base.W.x + 4, base.W.y - 2, top.W.x + 4, top.W.y + 2);
    g.lineBetween(base.E.x - 4, base.E.y - 2, top.E.x - 4, top.E.y + 2);
    g.lineBetween(
      (base.W.x + base.S.x) / 2,
      (base.W.y + base.S.y) / 2 - wallH * 0.45,
      (base.S.x + base.E.x) / 2,
      (base.S.y + base.E.y) / 2 - wallH * 0.45,
    );
  } else {
    // Brick / panel courses
    g.lineStyle(1, shade(wall, 0.65), 0.4 * a);
    for (let i = 1; i <= 3; i++) {
      const yOff = wallH * (i / 4);
      g.lineBetween(base.W.x, base.W.y - yOff, base.S.x, base.S.y - yOff);
      g.lineBetween(base.S.x, base.S.y - yOff, base.E.x, base.E.y - yOff);
    }
  }

  // Door on south-west face
  const doorBase = {
    x: (base.S.x + base.W.x) * 0.5 + 2,
    y: (base.S.y + base.W.y) * 0.5 - 1,
  };
  const doorH = era >= 2 ? 11 : 10;
  fillPoly(
    g,
    [
      { x: doorBase.x - 3, y: doorBase.y },
      { x: doorBase.x + 3, y: doorBase.y - 1.5 },
      { x: doorBase.x + 3, y: doorBase.y - doorH },
      { x: doorBase.x - 3, y: doorBase.y - doorH + 1.5 },
    ],
    era >= 3 ? 0x2a3540 : 0x3a2818,
    a,
  );
  if (era >= 1) {
    g.fillStyle(0xc9a227, 0.7 * a);
    g.fillCircle(doorBase.x + 1.5, doorBase.y - doorH * 0.45, 0.9);
  }

  isoWindow(g, base, wallH, a, { lit: true, ox: -9, w: era >= 2 ? 5 : 4.5 });
  if (era >= 2) {
    isoWindow(g, base, wallH, a, { lit: true, ox: -16, oy: -wallH * 0.55, w: 3.5, h: 3.5 });
  }

  if (era >= 3) {
    // Flat modern roof slab with solar / metal accent
    isoBox(g, 0, -wallH, hw + 1, hh + 0.5, 3, roof, a, { top: shade(0x6a8aaa, 1.1) });
    g.fillStyle(0x4a80c0, 0.55 * a);
    g.fillEllipse(-4, -wallH - 4, 8, 3);
    g.fillEllipse(5, -wallH - 3, 6, 2.5);
  } else {
    isoGableRoof(g, top, era === 0 ? 10 : 11, roof, a);
    if (era >= 1) {
      isoChimney(g, top.E.x - 6, top.E.y - 2, a, era === 2 ? 0x5a6068 : 0x6a4a3a);
    }
  }
}

function drawStockpile(g: GameObjects.Graphics, a: number) {
  // Open yard pad
  const pad = diamond(0, 2, HW - 6, HH - 3);
  fillPoly(g, [pad.N, pad.E, pad.S, pad.W], 0x6a5a40, 0.55 * a);
  strokePoly(g, [pad.N, pad.E, pad.S, pad.W], 0x4a3d28, 0.45 * a);

  // Resource crates / piles — wood, stone, mixed goods
  isoBox(g, -8, 2, 7, 3.5, 6, 0x7a5230, a, { top: 0x9a6a3a, stroke: true });
  isoBox(g, 5, 3, 7, 3.5, 5, 0x8a8f98, a, { top: 0xa8adb6, stroke: true });
  isoBox(g, -1, 6, 6, 3, 4, 0xc4a574, a, { top: 0xd4b584, stroke: true });

  // Corner posts + rope line
  for (const p of [pad.N, pad.E, pad.S, pad.W]) {
    g.lineStyle(2, 0x5a3d22, a);
    g.lineBetween(p.x, p.y, p.x, p.y - 8);
    g.fillStyle(shade(0x5a3d22, 1.15), a);
    g.fillCircle(p.x, p.y - 8, 1.4);
  }
  g.lineStyle(1.2, 0x8a7040, 0.65 * a);
  g.lineBetween(pad.N.x, pad.N.y - 7, pad.E.x, pad.E.y - 7);
  g.lineBetween(pad.E.x, pad.E.y - 7, pad.S.x, pad.S.y - 7);
}

function drawLumberCamp(g: GameObjects.Graphics, a: number) {
  const hw = HW - 6;
  const hh = HH - 3;
  const base = diamond(0, 0, hw, hh);
  const postH = 14;
  const postColor = 0x6b4a2a;

  // Corner posts
  for (const p of [base.N, base.E, base.S, base.W]) {
    g.lineStyle(3, postColor, a);
    g.lineBetween(p.x, p.y, p.x, p.y - postH);
    g.fillStyle(shade(postColor, 1.1), a);
    g.fillCircle(p.x, p.y - postH, 1.6);
  }

  // Open roof slab (slightly larger than footprint)
  const roofBase = diamond(0, -postH, hw + 3, hh + 1.5);
  const ridgeW = lift(roofBase.W, 6);
  const ridgeE = lift(roofBase.E, 6);
  fillPoly(g, [roofBase.N, roofBase.E, ridgeE, ridgeW], 0x7a5230, a);
  fillPoly(g, [roofBase.W, roofBase.S, ridgeE, ridgeW], 0x8a6238, a);
  g.lineStyle(1.5, 0x5c3d20, 0.7 * a);
  g.lineBetween(ridgeW.x, ridgeW.y, ridgeE.x, ridgeE.y);

  // Log pile — small iso cylinders as stacked diamonds
  isoBox(g, -6, 4, 8, 4, 5, 0x7a5230, a, { top: 0x9a6a3a, stroke: true });
  isoBox(g, 4, 6, 7, 3.5, 4, 0x6b4420, a, { top: 0x8a5a30, stroke: true });

  // Chopping stump
  isoBox(g, 12, 5, 5, 2.5, 4, 0x5a3d22, a, { top: 0x8a6a3a });
  // Axe
  g.lineStyle(1.5, 0x4a3020, a);
  g.lineBetween(14, 1, 18, -8);
  g.fillStyle(0x8a8f98, a);
  g.fillTriangle(16, -10, 22, -5, 15, -4);
}

function drawQuarry(g: GameObjects.Graphics, a: number) {
  // Cut into the tile — darker diamond pit
  const pit = diamond(0, 2, HW - 10, HH - 5);
  fillPoly(g, [pit.N, pit.E, pit.S, pit.W], 0x4a4e56, 0.85 * a);
  strokePoly(g, [pit.N, pit.E, pit.S, pit.W], 0x2e3238, 0.5 * a);

  // Rock blocks as iso cubes
  isoBox(g, -8, 0, 9, 4.5, 8, 0x8a8f98, a, { top: 0xa8adb6 });
  isoBox(g, 6, 2, 8, 4, 6, 0x6f747c, a, { top: 0x9aa0a8 });
  isoBox(g, 2, -4, 6, 3, 10, 0x7a7f88, a, { top: 0xb0b4bc });

  // Wooden crane — posts follow iso verticals from diamond points
  g.lineStyle(2.5, 0x6b4a2a, a);
  g.lineBetween(pit.W.x, pit.W.y, pit.W.x, pit.W.y - 22);
  g.lineBetween(pit.W.x, pit.W.y - 22, pit.E.x - 4, pit.E.y - 10);
  g.lineStyle(1.5, 0xc0c4cc, 0.85 * a);
  g.lineBetween(pit.W.x, pit.W.y - 20, 4, -2);
  g.fillStyle(0xa8adb6, a);
  g.fillCircle(4, -1, 2.5);
}

function drawResearchHut(g: GameObjects.Graphics, a: number) {
  const hw = HW - 7;
  const hh = HH - 3.5;
  const base = diamond(0, 2, hw, hh);
  const peak = { x: 0, y: -30 };
  const hide = 0x8b6914;
  const hideDark = shade(hide, 0.75);
  const hideLit = shade(hide, 0.95);

  // Ground ring / ritual circle
  const ring = diamond(0, 4, hw + 3, hh + 1.5);
  strokePoly(g, [ring.N, ring.E, ring.S, ring.W], 0xc9a227, 0.25 * a, 1.5);

  // Four hide faces meeting at peak — conical tent on diamond base
  fillPoly(g, [base.W, base.N, peak], hideDark, a);
  fillPoly(g, [base.N, base.E, peak], hideLit, a);
  fillPoly(g, [base.E, base.S, peak], shade(hide, 1.05), a);
  fillPoly(g, [base.S, base.W, peak], shade(hide, 0.82), a);
  strokePoly(g, [base.N, base.E, base.S, base.W], shade(hide, 0.5), 0.45 * a);
  // Lit ridge
  g.lineStyle(1.2, shade(hide, 1.3), 0.4 * a);
  g.lineBetween(base.N.x, base.N.y, peak.x, peak.y);

  // Entrance flap on south
  fillPoly(
    g,
    [
      base.S,
      { x: (base.S.x + base.W.x) / 2, y: (base.S.y + base.W.y) / 2 },
      { x: peak.x - 2, y: peak.y + 18 },
      { x: peak.x + 2, y: peak.y + 18 },
      { x: (base.S.x + base.E.x) / 2, y: (base.S.y + base.E.y) / 2 },
    ],
    0x3a2818,
    0.8 * a,
  );

  // Fire pit in front (south of footprint)
  const fire = diamond(0, 12, 6, 3);
  fillPoly(g, [fire.N, fire.E, fire.S, fire.W], 0x3a2818, 0.7 * a);
  g.fillStyle(0xff8a3a, 0.55 * a);
  g.fillCircle(0, 11, 4.5);
  g.fillStyle(0xff8a3a, 0.7 * a);
  g.fillCircle(0, 11, 3.2);
  g.fillStyle(0xffd27a, 0.8 * a);
  g.fillCircle(0, 10, 1.6);

  // Totem post at east corner
  g.lineStyle(3, 0x5a3d22, a);
  g.lineBetween(base.E.x, base.E.y, base.E.x, base.E.y - 20);
  g.fillStyle(0xc9a227, 0.9 * a);
  g.fillCircle(base.E.x, base.E.y - 22, 3.5);
  g.fillStyle(0xf0e2b0, 0.55 * a);
  g.fillCircle(base.E.x - 0.5, base.E.y - 23, 1.4);
}

function drawFarm(g: GameObjects.Graphics, a: number) {
  // Tilled plot — full tile diamond with soil banding
  const plot = diamond(0, 0, HW - 5, HH - 2);
  fillPoly(g, [plot.N, plot.E, plot.S, plot.W], 0x6b5a32, a);
  strokePoly(g, [plot.N, plot.E, plot.S, plot.W], 0x4a3d20, 0.55 * a);
  // Furrow shade strips
  g.lineStyle(2, 0x5a4a28, 0.35 * a);
  for (let i = -2; i <= 2; i++) {
    const t = i / 3.5;
    const p0 = {
      x: plot.W.x + (plot.S.x - plot.W.x) * ((t + 1) / 2),
      y: plot.W.y + (plot.S.y - plot.W.y) * ((t + 1) / 2),
    };
    const p1 = {
      x: plot.N.x + (plot.E.x - plot.N.x) * ((t + 1) / 2),
      y: plot.N.y + (plot.E.y - plot.N.y) * ((t + 1) / 2),
    };
    g.lineBetween(
      p0.x + (p1.x - p0.x) * 0.1,
      p0.y + (p1.y - p0.y) * 0.1,
      p0.x + (p1.x - p0.x) * 0.9,
      p0.y + (p1.y - p0.y) * 0.9,
    );
  }

  // Crop rows parallel to the NE–SW diamond edge (iso-aligned)
  g.lineStyle(1.2, 0xd4c05a, 0.75 * a);
  for (let i = -3; i <= 3; i++) {
    const t = i / 4;
    const p0 = {
      x: plot.W.x + (plot.S.x - plot.W.x) * ((t + 1) / 2),
      y: plot.W.y + (plot.S.y - plot.W.y) * ((t + 1) / 2),
    };
    const p1 = {
      x: plot.N.x + (plot.E.x - plot.N.x) * ((t + 1) / 2),
      y: plot.N.y + (plot.E.y - plot.N.y) * ((t + 1) / 2),
    };
    const inset = 0.12;
    g.lineBetween(
      p0.x + (p1.x - p0.x) * inset,
      p0.y + (p1.y - p0.y) * inset,
      p0.x + (p1.x - p0.x) * (1 - inset),
      p0.y + (p1.y - p0.y) * (1 - inset),
    );
  }

  // Crop tufts along rows
  g.fillStyle(0x8fbf4a, a);
  for (const [u, v] of [
    [0.25, 0.3],
    [0.45, 0.45],
    [0.65, 0.35],
    [0.35, 0.65],
    [0.55, 0.7],
    [0.7, 0.55],
  ] as const) {
    const alongNE = {
      x: plot.N.x + (plot.E.x - plot.N.x) * u,
      y: plot.N.y + (plot.E.y - plot.N.y) * u,
    };
    const alongWS = {
      x: plot.W.x + (plot.S.x - plot.W.x) * u,
      y: plot.W.y + (plot.S.y - plot.W.y) * u,
    };
    const px = alongNE.x + (alongWS.x - alongNE.x) * v;
    const py = alongNE.y + (alongWS.y - alongNE.y) * v;
    g.fillTriangle(px, py - 5, px - 2, py, px + 2, py);
  }

  // Small iso shed at north corner
  const { top } = isoBox(g, -2, -6, 9, 4.5, 8, 0xc4a574, a, { top: 0xb8956a });
  isoGableRoof(g, top, 5, 0x8f6a3a, a);
}

function drawGranary(g: GameObjects.Graphics, a: number) {
  const hw = HW - 9;
  const hh = HH - 4.5;
  const base = diamond(0, 4, hw, hh);
  const deckH = 10;
  const bodyH = 18;

  // Stilts at diamond corners
  g.lineStyle(3, 0x5a3d22, a);
  for (const p of [base.N, base.E, base.S, base.W]) {
    g.lineBetween(p.x, p.y, p.x, p.y - deckH);
  }

  // Raised platform
  const deck = {
    N: lift(base.N, deckH),
    E: lift(base.E, deckH),
    S: lift(base.S, deckH),
    W: lift(base.W, deckH),
  };
  fillPoly(g, [deck.N, deck.E, deck.S, deck.W], 0x8a6a3a, a);

  // Store body above platform
  const { top } = isoBox(g, 0, -deckH, hw - 1, hh - 0.5, bodyH, 0xe0c089, a, {
    top: 0xc4a060,
  });

  // Horizontal thatch bands on faces
  g.lineStyle(1.2, 0xc4a060, 0.55 * a);
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const yOff = bodyH * t;
    g.lineBetween(
      base.W.x,
      base.W.y - deckH - yOff,
      base.S.x,
      base.S.y - deckH - yOff,
    );
    g.lineBetween(
      base.S.x,
      base.S.y - deckH - yOff,
      base.E.x,
      base.E.y - deckH - yOff,
    );
  }

  isoGableRoof(g, top, 9, 0x8f6a3a, a);

  // Ladder on west face
  g.lineStyle(1.5, 0x6b4a2a, a);
  const lx = base.W.x + 3;
  g.lineBetween(lx - 2, base.W.y + 2, lx - 2, base.W.y - deckH - 8);
  g.lineBetween(lx + 2, base.W.y + 2, lx + 2, base.W.y - deckH - 8);
  for (let y = base.W.y; y > base.W.y - deckH - 6; y -= 4) {
    g.lineBetween(lx - 2, y, lx + 2, y);
  }
}

function drawMine(g: GameObjects.Graphics, a: number) {
  const pit = diamond(0, 2, HW - 9, HH - 4);
  fillPoly(g, [pit.N, pit.E, pit.S, pit.W], 0x3a3228, 0.9 * a);
  strokePoly(g, [pit.N, pit.E, pit.S, pit.W], 0x2a2218, 0.55 * a);
  // Timbered tunnel mouth
  const mouth = diamond(0, 4, 10, 5);
  fillPoly(g, [mouth.N, mouth.E, mouth.S, mouth.W], 0x1a1410, 0.85 * a);
  g.lineStyle(2.5, 0x5a3d22, a);
  g.lineBetween(mouth.W.x, mouth.W.y, mouth.W.x, mouth.W.y - 10);
  g.lineBetween(mouth.E.x, mouth.E.y, mouth.E.x, mouth.E.y - 10);
  g.lineBetween(mouth.W.x, mouth.W.y - 10, mouth.E.x, mouth.E.y - 10);
  isoBox(g, -8, 0, 7, 3.5, 6, 0xc08a4a, a, { top: 0xd4a86a });
  isoBox(g, 8, 2, 6, 3, 5, 0x8a6a3a, a, { top: 0xb08a4a });
  // Headframe crane
  g.lineStyle(2.5, 0x5a3d22, a);
  g.lineBetween(pit.N.x, pit.N.y, pit.N.x, pit.N.y - 20);
  g.lineBetween(pit.N.x, pit.N.y - 20, pit.S.x + 2, pit.S.y - 8);
  g.lineStyle(1.2, 0xc0c4cc, 0.75 * a);
  g.lineBetween(pit.N.x, pit.N.y - 18, 2, 2);
  g.fillStyle(0xc08a4a, a);
  g.fillCircle(2, 3, 2.2);
}

function drawForge(g: GameObjects.Graphics, a: number) {
  const { base, top } = isoBox(g, 0, 0, HW - 8, HH - 4, 14, 0x6a4a3a, a, {
    top: 0x8a5a3a,
  });
  // Furnace block
  isoBox(g, -2, -14, 9, 4.5, 11, 0xb45a3a, a, { top: 0xd47a4a });
  // Ember glow in furnace mouth
  g.fillStyle(0xff8a3a, 0.75 * a);
  g.fillCircle(-2, -18, 4.5);
  g.fillStyle(0xffd27a, 0.85 * a);
  g.fillCircle(-2, -19, 2.2);
  g.fillStyle(0xfff3c4, 0.45 * a);
  g.fillCircle(-1, -20, 1.1);
  // Chimney
  isoChimney(g, top.E.x - 4, top.E.y - 2, a, 0x4a3020);
  // Anvil silhouette
  isoBox(g, 10, 4, 5, 2.5, 4, 0x4a5058, a, { top: 0x6a7078 });
  g.fillStyle(0x3a4048, a);
  g.fillRect(8, 0, 5, 2);
  isoWindow(g, base, 14, a, { lit: true, ox: -7, oy: -8, w: 3.5, h: 3 });
}

function drawWorkshop(g: GameObjects.Graphics, a: number) {
  const { base, top } = isoBox(g, 0, 0, HW - 7, HH - 3.5, 16, 0x6a7a8a, a, {
    top: 0x8a9aaa,
  });
  // Lean-to shed
  isoBox(g, -6, 3, 7, 3.5, 7, 0x5a6570, a, { top: 0x7a8590 });
  // Roof rail / skylight band
  g.lineStyle(1.5, 0xc0c4cc, 0.7 * a);
  g.lineBetween(top.W.x + 4, top.W.y - 3, top.E.x - 4, top.E.y - 3);
  g.fillStyle(0xb8d0e0, 0.45 * a);
  g.fillEllipse(0, -18, 10, 4);
  // Workbench + tool glint
  isoBox(g, 8, 5, 5, 2.5, 4, 0x6b4a2a, a, { top: 0x8a6238 });
  g.fillStyle(0xe8c95a, 0.7 * a);
  g.fillCircle(top.N.x + 2, top.N.y - 1, 2);
  isoWindow(g, base, 16, a, { lit: true, ox: -9, oy: -9, w: 4, h: 4 });
}

function drawFactory(g: GameObjects.Graphics, a: number) {
  const { base } = isoBox(g, -4, 0, HW - 10, HH - 5, 18, 0x5a6570, a, {
    top: 0x7a8590,
  });
  isoBox(g, 9, 2, 11, 5.5, 14, 0x4a5560, a, { top: 0x6a7580 });
  // Window bands
  g.lineStyle(1.2, 0xa8c0d0, 0.45 * a);
  for (const yOff of [6, 11]) {
    g.lineBetween(base.W.x + 2, base.W.y - yOff, base.S.x - 2, base.S.y - yOff);
  }
  isoWindow(g, base, 18, a, { lit: true, ox: -8, oy: -10, w: 4, h: 3.5 });
  // Smokestacks with soft plumes
  for (const [sx, sy, h] of [
    [-8, -18, 16],
    [2, -14, 14],
    [12, -12, 10],
  ] as const) {
    g.lineStyle(4, 0x3a4048, a);
    g.lineBetween(sx, sy, sx, sy - h);
    g.fillStyle(0x3a4048, a);
    g.fillEllipse(sx, sy - h - 1, 5, 2.2);
    g.fillStyle(0xc0c4cc, 0.28 * a);
    g.fillCircle(sx - 1, sy - h - 5, 3.5);
    g.fillCircle(sx + 2, sy - h - 9, 2.8);
  }
}

function drawLaboratory(g: GameObjects.Graphics, a: number) {
  const { base, top } = isoBox(g, 0, 0, HW - 8, HH - 4, 18, 0x4a8aaa, a, {
    top: 0x6ab0cc,
  });
  // Glass clerestory
  fillPoly(
    g,
    [
      { x: top.N.x - 5, y: top.N.y + 3 },
      { x: top.N.x + 5, y: top.N.y + 3 },
      { x: top.N.x + 5, y: top.N.y - 7 },
      { x: top.N.x - 5, y: top.N.y - 7 },
    ],
    0xb8e0f0,
    0.6 * a,
  );
  g.fillStyle(0xe8f6ff, 0.55 * a);
  g.fillEllipse(top.N.x, top.N.y - 2, 8, 3);
  // Antenna / dish
  g.lineStyle(2, 0x8a9aaa, a);
  g.lineBetween(top.E.x - 2, top.E.y, top.E.x - 2, top.E.y - 14);
  g.fillStyle(0xd4e8f0, 0.75 * a);
  g.fillCircle(top.E.x - 2, top.E.y - 16, 3.5);
  g.fillStyle(0xe8c95a, 0.65 * a);
  g.fillCircle(top.E.x - 2, top.E.y - 16, 1.4);
  isoWindow(g, base, 18, a, { lit: true, ox: -8, oy: -10, w: 4.5, h: 5 });
}

function drawReactor(g: GameObjects.Graphics, a: number) {
  // Containment base
  isoBox(g, 0, 4, HW - 10, HH - 5, 10, 0x2a3a38, a, { top: 0x3a4a48 });
  // Cooling ring
  const ring = diamond(0, -8, HW - 8, HH - 4);
  strokePoly(g, [ring.N, ring.E, ring.S, ring.W], 0x3ecf7a, 0.55 * a, 2);
  fillPoly(g, [ring.N, ring.E, ring.S, ring.W], 0x2a3a38, 0.55 * a);
  // Core glow
  g.fillStyle(0x3ecf7a, 0.5 * a);
  g.fillCircle(0, -12, 9);
  g.fillStyle(0xa8ffe0, 0.55 * a);
  g.fillCircle(0, -13, 5);
  g.fillStyle(0xe8fff4, 0.45 * a);
  g.fillCircle(0, -14, 2.2);
  // Twin cooling towers
  for (const ox of [-12, 12]) {
    isoBox(g, ox, 2, 5, 2.5, 16, 0x4a5558, a, { top: 0x6a7578 });
    g.fillStyle(0xc0d0d4, 0.25 * a);
    g.fillCircle(ox, -18, 3.5);
  }
}

function drawObservatory(g: GameObjects.Graphics, a: number) {
  const { base } = isoBox(g, 0, 4, HW - 9, HH - 4.5, 12, 0x3a4a8a, a, {
    top: 0x5a6aaa,
  });
  // Domed cupola (layered ellipses for volume)
  g.fillStyle(0x2a3a6a, a);
  g.fillEllipse(0, -14, 22, 14);
  g.fillStyle(0x3a4a8a, a);
  g.fillEllipse(0, -16, 18, 11);
  g.fillStyle(0xc0d0f0, 0.28 * a);
  g.fillEllipse(-4, -18, 8, 5);
  // Telescope slit + tube
  g.fillStyle(0x1a2848, 0.7 * a);
  g.fillRect(-1.5, -24, 3, 10);
  g.lineStyle(2.5, 0x8a9acc, a);
  g.lineBetween(1, -18, 12, -30);
  g.fillStyle(0xc9a227, 0.75 * a);
  g.fillCircle(12, -30, 2);
  isoWindow(g, base, 12, a, { lit: true, ox: -7, oy: -7, w: 3.5, h: 3 });
}

function drawLaunchPad(g: GameObjects.Graphics, a: number) {
  const pad = diamond(0, 4, HW - 5, HH - 2.5);
  fillPoly(g, [pad.N, pad.E, pad.S, pad.W], 0xd0d4dc, a);
  strokePoly(g, [pad.N, pad.E, pad.S, pad.W], 0x8a9098, 0.65 * a);
  // Pad markings
  g.lineStyle(1.5, 0xc94545, 0.55 * a);
  g.lineBetween(pad.N.x, pad.N.y, pad.S.x, pad.S.y);
  g.lineBetween(pad.W.x, pad.W.y, pad.E.x, pad.E.y);
  // Service gantry
  g.lineStyle(2.5, 0x6a7078, a);
  g.lineBetween(pad.W.x + 2, pad.W.y, pad.W.x + 2, pad.W.y - 28);
  g.lineBetween(pad.W.x + 2, pad.W.y - 26, 0, -20);
  g.lineStyle(1.2, 0xa8adb6, 0.7 * a);
  for (let y = 6; y < 26; y += 5) {
    g.lineBetween(pad.W.x + 2, pad.W.y - y, pad.W.x + 7, pad.W.y - y);
  }
  // Rocket body
  isoBox(g, 0, -2, 6, 3, 24, 0xe8ecf0, a, { top: 0xffffff });
  g.fillStyle(0x4a80c0, a);
  g.fillRect(-2, -14, 4, 5);
  g.fillStyle(0xc94545, a);
  g.fillTriangle(-5, -26, 5, -26, 0, -36);
  // Engine plume
  g.fillStyle(0xff8a3a, 0.7 * a);
  g.fillTriangle(-3.5, 2, 3.5, 2, 0, 12);
  g.fillStyle(0xffd27a, 0.55 * a);
  g.fillTriangle(-2, 2, 2, 2, 0, 8);
}

function drawWatchtower(g: GameObjects.Graphics, a: number) {
  const { top } = isoBox(g, 0, 2, 10, 5, 28, 0x7a5230, a, { top: 0x8a6238 });
  // Cabin
  const cabin = isoBox(g, 0, -26, 14, 7, 9, 0x6b4a2a, a, { top: 0x9a7a4a });
  // Roof
  isoGableRoof(g, cabin.top, 5, 0x5a3d22, a);
  // Railing posts
  for (const p of [cabin.top.N, cabin.top.E, cabin.top.S, cabin.top.W]) {
    g.lineStyle(2, 0x5a3d22, a);
    g.lineBetween(p.x, p.y, p.x, p.y - 6);
  }
  g.lineStyle(1.5, 0x8a6a3a, 0.75 * a);
  g.lineBetween(cabin.top.N.x, cabin.top.N.y - 5, cabin.top.E.x, cabin.top.E.y - 5);
  g.lineBetween(cabin.top.E.x, cabin.top.E.y - 5, cabin.top.S.x, cabin.top.S.y - 5);
  // Banner
  g.fillStyle(0xc94545, 0.9 * a);
  g.fillTriangle(0, -42, -3, -36, 3, -36);
  g.lineStyle(1.5, 0x5a3d22, a);
  g.lineBetween(0, -34, 0, -42);
  // Ladder
  g.lineStyle(1.2, 0x5a3d22, 0.8 * a);
  g.lineBetween(top.S.x - 2, top.S.y + 2, top.S.x - 2, top.S.y - 24);
}

function drawPalisade(g: GameObjects.Graphics, a: number) {
  const base = diamond(0, 2, HW - 8, HH - 4);
  const posts = [
    base.W,
    { x: (base.W.x + base.N.x) / 2, y: (base.W.y + base.N.y) / 2 },
    base.N,
    { x: (base.N.x + base.E.x) / 2, y: (base.N.y + base.E.y) / 2 },
    base.E,
    { x: (base.E.x + base.S.x) / 2, y: (base.E.y + base.S.y) / 2 },
    base.S,
    { x: (base.S.x + base.W.x) / 2, y: (base.S.y + base.W.y) / 2 },
  ];
  for (const p of posts) {
    g.lineStyle(3.5, 0x5a3d22, a);
    g.lineBetween(p.x, p.y, p.x, p.y - 16);
    g.fillStyle(0x8a6a3a, a);
    g.fillCircle(p.x, p.y - 17, 2);
  }
  g.lineStyle(2.5, 0x6b4a2a, 0.85 * a);
  g.lineBetween(base.W.x, base.W.y - 10, base.N.x, base.N.y - 10);
  g.lineBetween(base.N.x, base.N.y - 10, base.E.x, base.E.y - 10);
  g.lineBetween(base.E.x, base.E.y - 10, base.S.x, base.S.y - 10);
  g.lineBetween(base.S.x, base.S.y - 10, base.W.x, base.W.y - 10);
}

function drawStorehouse(g: GameObjects.Graphics, a: number) {
  const { top } = isoBox(g, 0, 0, HW - 7, HH - 3.5, 14, 0xc4a574, a, { top: 0xb8956a });
  isoGableRoof(g, top, 8, 0x8f6a3a, a);
  // Grain sacks
  isoBox(g, -8, 4, 5, 2.5, 4, 0xd4c05a, a, { top: 0xe8d06a });
  isoBox(g, 6, 5, 5, 2.5, 4, 0xc4b04a, a, { top: 0xd8c45a });
  g.lineStyle(1.5, 0x5a3d22, 0.7 * a);
  g.lineBetween(top.W.x + 4, top.W.y + 2, top.E.x - 4, top.E.y + 2);
}

function drawGroveSanctuary(g: GameObjects.Graphics, a: number) {
  const ring = diamond(0, 2, HW - 4, HH - 2);
  fillPoly(g, [ring.N, ring.E, ring.S, ring.W], 0x2a4a32, 0.55 * a);
  strokePoly(g, [ring.N, ring.E, ring.S, ring.W], 0x4a8f5a, 0.7 * a);
  // Inner moss ring
  const inner = diamond(0, 2, HW - 10, HH - 5);
  fillPoly(g, [inner.N, inner.E, inner.S, inner.W], 0x3a6a42, 0.35 * a);
  // Standing stones
  isoBox(g, -10, 2, 3, 2, 12, 0x8a8f98, a, { top: 0xa8adb8 });
  isoBox(g, 10, 2, 3, 2, 12, 0x8a8f98, a, { top: 0xa8adb8 });
  isoBox(g, 0, 6, 3.5, 2, 10, 0x7a8088, a, { top: 0x9aa0a8 });
  // Central living tree — layered canopy
  g.fillStyle(0x000000, 0.18 * a);
  g.fillEllipse(0, 2, 18, 8);
  g.fillStyle(0x5a3d22, a);
  g.fillRect(-2, -18, 4, 16);
  g.fillStyle(0x3a6a40, a);
  g.fillCircle(0, -22, 11);
  g.fillStyle(0x4a8f5a, a);
  g.fillCircle(-4, -20, 7);
  g.fillStyle(0x6baf6a, 0.9 * a);
  g.fillCircle(4, -21, 6.5);
  g.fillStyle(0x8fcf7a, 0.55 * a);
  g.fillCircle(-1, -24, 4);
  g.fillStyle(0xc9a227, 0.65 * a);
  g.fillCircle(0, -8, 2.8);
  g.fillStyle(0xfff3c4, 0.35 * a);
  g.fillCircle(0, -9, 1.2);
}
