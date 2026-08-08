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
  const d = diamond(0, 2, (HW - 4) * scale, (HH - 2) * scale);
  fillPoly(g, [d.N, d.E, d.S, d.W], 0x000000, 0.22 * alpha);
}

/** Extruded isometric box with optional flat top. */
function isoBox(
  g: GameObjects.Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  height: number,
  color: number,
  alpha: number,
  opts?: { top?: number; stroke?: boolean },
) {
  const base = diamond(cx, cy, hw, hh);
  const top = {
    N: lift(base.N, height),
    E: lift(base.E, height),
    S: lift(base.S, height),
    W: lift(base.W, height),
  };
  const left = shade(color, 0.72);
  const right = shade(color, 0.9);
  const lid = opts?.top ?? shade(color, 1.12);

  fillPoly(g, [base.W, base.S, top.S, top.W], left, alpha);
  fillPoly(g, [base.S, base.E, top.E, top.S], right, alpha);
  fillPoly(g, [top.N, top.E, top.S, top.W], lid, alpha);

  if (opts?.stroke !== false) {
    strokePoly(g, [top.N, top.E, top.S, top.W], shade(color, 0.55), 0.45 * alpha, 1);
    g.lineStyle(1, shade(color, 0.45), 0.35 * alpha);
    g.lineBetween(base.S.x, base.S.y, top.S.x, top.S.y);
  }

  return { base, top };
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

function progressBar(g: GameObjects.Graphics, progress: number) {
  const bar = diamond(0, 14, 20, 8);
  fillPoly(g, [bar.N, bar.E, bar.S, bar.W], 0x1b2618, 0.75);
  const t = Math.max(0.05, Math.min(1, progress));
  if (t <= 0.5) {
    const u = t * 2;
    const fillN = {
      x: bar.W.x + (bar.N.x - bar.W.x) * u,
      y: bar.W.y + (bar.N.y - bar.W.y) * u,
    };
    const fillS = {
      x: bar.W.x + (bar.S.x - bar.W.x) * u,
      y: bar.W.y + (bar.S.y - bar.W.y) * u,
    };
    fillPoly(g, [bar.W, fillN, fillS], 0xe8c95a, 1);
  } else {
    const u = (t - 0.5) * 2;
    const n2 = {
      x: bar.N.x + (bar.E.x - bar.N.x) * u,
      y: bar.N.y + (bar.E.y - bar.N.y) * u,
    };
    const s2 = {
      x: bar.S.x + (bar.E.x - bar.S.x) * u,
      y: bar.S.y + (bar.E.y - bar.S.y) * u,
    };
    fillPoly(g, [bar.W, bar.N, n2, s2, bar.S], 0xe8c95a, 1);
  }
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
  const evolved = opts.age !== undefined && opts.age !== "stone";
  isoShadow(g, alpha);

  switch (type) {
    case "house":
      drawHouse(g, alpha, evolved);
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
  }

  if (progress < 1) {
    const tall =
      type === "granary" ||
      type === "factory" ||
      type === "reactor" ||
      type === "launch_pad";
    scaffold(g, alpha, tall ? 36 : 28);
    progressBar(g, progress);
  } else if (opts.active) {
    const glow = diamond(0, -10, 18, 10);
    fillPoly(g, [glow.N, glow.E, glow.S, glow.W], 0xfff3c4, 0.12 * alpha);
  }
}

function drawHouse(g: GameObjects.Graphics, a: number, evolved: boolean) {
  const wall = evolved ? 0xd2b48c : 0xb8956a;
  const roof = evolved ? 0x8f6a3a : 0x6b8f4e;
  const hw = HW - 8;
  const hh = HH - 4;
  const wallH = 16;

  const { base, top } = isoBox(g, 0, 0, hw, hh, wallH, wall, a, {
    top: shade(wall, 0.95),
  });

  // Timber beams on faces
  g.lineStyle(1.2, 0x5a3d22, 0.55 * a);
  g.lineBetween(base.W.x + 4, base.W.y - 2, top.W.x + 4, top.W.y + 2);
  g.lineBetween(base.E.x - 4, base.E.y - 2, top.E.x - 4, top.E.y + 2);
  g.lineBetween(
    (base.W.x + base.S.x) / 2,
    (base.W.y + base.S.y) / 2 - wallH * 0.45,
    (base.S.x + base.E.x) / 2,
    (base.S.y + base.E.y) / 2 - wallH * 0.45,
  );

  // Door on south corner face
  const doorBase = {
    x: (base.S.x + base.W.x) * 0.5 + 2,
    y: (base.S.y + base.W.y) * 0.5 - 1,
  };
  fillPoly(
    g,
    [
      { x: doorBase.x - 3, y: doorBase.y },
      { x: doorBase.x + 3, y: doorBase.y - 1.5 },
      { x: doorBase.x + 3, y: doorBase.y - 10 },
      { x: doorBase.x - 3, y: doorBase.y - 8.5 },
    ],
    0x3a2818,
    a,
  );

  // Warm window on right face
  fillPoly(
    g,
    [
      { x: base.E.x - 10, y: base.E.y - 8 },
      { x: base.E.x - 5, y: base.E.y - 6 },
      { x: base.E.x - 5, y: base.E.y - 11 },
      { x: base.E.x - 10, y: base.E.y - 13 },
    ],
    0xf0d080,
    0.65 * a,
  );

  isoGableRoof(g, top, 10, roof, a);
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

  // Four hide faces meeting at peak — conical tent on diamond base
  fillPoly(g, [base.W, base.N, peak], hideDark, a);
  fillPoly(g, [base.N, base.E, peak], hideLit, a);
  fillPoly(g, [base.E, base.S, peak], shade(hide, 1.05), a);
  fillPoly(g, [base.S, base.W, peak], shade(hide, 0.82), a);
  strokePoly(g, [base.N, base.E, base.S, base.W], shade(hide, 0.5), 0.45 * a);

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
  g.fillStyle(0xff8a3a, 0.6 * a);
  g.fillCircle(0, 11, 3.5);
  g.fillStyle(0xffd27a, 0.75 * a);
  g.fillCircle(0, 10, 1.8);

  // Totem post at east corner
  g.lineStyle(3, 0x5a3d22, a);
  g.lineBetween(base.E.x, base.E.y, base.E.x, base.E.y - 20);
  g.fillStyle(0xc9a227, 0.9 * a);
  g.fillCircle(base.E.x, base.E.y - 22, 3.5);
  g.fillStyle(0xf0e2b0, 0.55 * a);
  g.fillCircle(base.E.x - 0.5, base.E.y - 23, 1.4);
}

function drawFarm(g: GameObjects.Graphics, a: number) {
  // Tilled plot — full tile diamond
  const plot = diamond(0, 0, HW - 5, HH - 2);
  fillPoly(g, [plot.N, plot.E, plot.S, plot.W], 0x6b5a32, a);
  strokePoly(g, [plot.N, plot.E, plot.S, plot.W], 0x4a3d20, 0.55 * a);

  // Crop rows parallel to the NE–SW diamond edge (iso-aligned)
  g.lineStyle(1.2, 0xd4c05a, 0.7 * a);
  for (let i = -3; i <= 3; i++) {
    // Offset along NW–SE, draw lines parallel to W→N / S→E
    const t = i / 4;
    const p0 = {
      x: plot.W.x + (plot.S.x - plot.W.x) * ((t + 1) / 2),
      y: plot.W.y + (plot.S.y - plot.W.y) * ((t + 1) / 2),
    };
    const p1 = {
      x: plot.N.x + (plot.E.x - plot.N.x) * ((t + 1) / 2),
      y: plot.N.y + (plot.E.y - plot.N.y) * ((t + 1) / 2),
    };
    // Inset a bit from edges
    const inset = 0.12;
    const a0 = {
      x: p0.x + (p1.x - p0.x) * inset,
      y: p0.y + (p1.y - p0.y) * inset,
    };
    const a1 = {
      x: p0.x + (p1.x - p0.x) * (1 - inset),
      y: p0.y + (p1.y - p0.y) * (1 - inset),
    };
    g.lineBetween(a0.x, a0.y, a1.x, a1.y);
  }

  // Crop tufts along rows
  g.fillStyle(0x8fbf4a, a);
  for (const [u, v] of [
    [0.25, 0.3],
    [0.45, 0.45],
    [0.65, 0.35],
    [0.35, 0.65],
    [0.55, 0.7],
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
  isoBox(g, -6, 1, 8, 4, 7, 0xc08a4a, a, { top: 0xd4a86a });
  isoBox(g, 7, 3, 7, 3.5, 5, 0x8a6a3a, a, { top: 0xb08a4a });
  g.lineStyle(2.5, 0x5a3d22, a);
  g.lineBetween(pit.N.x, pit.N.y, pit.N.x, pit.N.y - 18);
  g.lineBetween(pit.N.x, pit.N.y - 18, pit.S.x, pit.S.y - 6);
  g.fillStyle(0xc08a4a, a);
  g.fillCircle(pit.S.x, pit.S.y - 5, 2.5);
}

function drawForge(g: GameObjects.Graphics, a: number) {
  const { top } = isoBox(g, 0, 0, HW - 8, HH - 4, 14, 0x6a4a3a, a, { top: 0x8a5a3a });
  isoBox(g, 0, -14, 10, 5, 10, 0xb45a3a, a, { top: 0xd47a4a });
  g.fillStyle(0xff8a3a, 0.7 * a);
  g.fillCircle(0, -20, 4);
  g.fillStyle(0xffd27a, 0.8 * a);
  g.fillCircle(0, -21, 2);
  g.lineStyle(2, 0x4a3020, a);
  g.lineBetween(top.E.x - 2, top.E.y - 2, top.E.x - 2, top.E.y - 16);
}

function drawWorkshop(g: GameObjects.Graphics, a: number) {
  const { top } = isoBox(g, 0, 0, HW - 7, HH - 3.5, 16, 0x6a7a8a, a, { top: 0x8a9aaa });
  isoBox(g, -4, 2, 6, 3, 6, 0x5a6570, a, { top: 0x7a8590 });
  g.lineStyle(1.5, 0xc0c4cc, 0.7 * a);
  g.lineBetween(top.W.x + 4, top.W.y - 4, top.E.x - 4, top.E.y - 4);
  g.fillStyle(0xe8c95a, 0.55 * a);
  g.fillCircle(top.N.x, top.N.y - 2, 2.5);
}

function drawFactory(g: GameObjects.Graphics, a: number) {
  isoBox(g, -4, 0, HW - 10, HH - 5, 18, 0x5a6570, a, { top: 0x7a8590 });
  isoBox(g, 8, 2, 10, 5, 12, 0x4a5560, a, { top: 0x6a7580 });
  // Smokestacks
  g.lineStyle(4, 0x3a4048, a);
  g.lineBetween(-8, -18, -8, -34);
  g.lineBetween(4, -12, 4, -28);
  g.fillStyle(0xc0c4cc, 0.35 * a);
  g.fillCircle(-8, -36, 3);
  g.fillCircle(4, -30, 2.5);
}

function drawLaboratory(g: GameObjects.Graphics, a: number) {
  const { top } = isoBox(g, 0, 0, HW - 8, HH - 4, 18, 0x4a8aaa, a, { top: 0x6ab0cc });
  fillPoly(
    g,
    [
      { x: top.N.x - 4, y: top.N.y + 4 },
      { x: top.N.x + 4, y: top.N.y + 4 },
      { x: top.N.x + 4, y: top.N.y - 6 },
      { x: top.N.x - 4, y: top.N.y - 6 },
    ],
    0xb8e0f0,
    0.55 * a,
  );
  g.fillStyle(0xe8f6ff, 0.7 * a);
  g.fillCircle(top.E.x - 6, top.E.y - 8, 2);
}

function drawReactor(g: GameObjects.Graphics, a: number) {
  const dome = diamond(0, -6, HW - 10, HH - 5);
  fillPoly(g, [dome.N, dome.E, dome.S, dome.W], 0x3a4a48, a);
  isoBox(g, 0, 4, HW - 12, HH - 6, 10, 0x2a3a38, a, { top: 0x3ecf7a });
  g.fillStyle(0x3ecf7a, 0.55 * a);
  g.fillCircle(0, -10, 8);
  g.fillStyle(0xa8ffe0, 0.45 * a);
  g.fillCircle(0, -12, 4);
}

function drawObservatory(g: GameObjects.Graphics, a: number) {
  isoBox(g, 0, 2, HW - 9, HH - 4.5, 12, 0x3a4a8a, a, { top: 0x5a6aaa });
  g.fillStyle(0x2a3a6a, a);
  g.fillCircle(0, -16, 10);
  g.fillStyle(0xc0d0f0, 0.35 * a);
  g.fillCircle(-3, -18, 4);
  g.lineStyle(2, 0x8a9acc, a);
  g.lineBetween(0, -16, 8, -28);
}

function drawLaunchPad(g: GameObjects.Graphics, a: number) {
  const pad = diamond(0, 4, HW - 6, HH - 3);
  fillPoly(g, [pad.N, pad.E, pad.S, pad.W], 0xd0d4dc, a);
  strokePoly(g, [pad.N, pad.E, pad.S, pad.W], 0x8a9098, 0.6 * a);
  // Rocket body
  isoBox(g, 0, -2, 6, 3, 22, 0xe8ecf0, a, { top: 0xffffff });
  g.fillStyle(0xc94545, a);
  g.fillTriangle(-5, -24, 5, -24, 0, -34);
  g.fillStyle(0xff8a3a, 0.65 * a);
  g.fillTriangle(-3, 2, 3, 2, 0, 10);
}

function drawWatchtower(g: GameObjects.Graphics, a: number) {
  const { top } = isoBox(g, 0, 2, 10, 5, 28, 0x7a5230, a, { top: 0x8a6238 });
  isoBox(g, 0, -26, 14, 7, 8, 0x6b4a2a, a, { top: 0x9a7a4a });
  // Lookout posts
  for (const p of [top.N, top.E, top.S, top.W]) {
    g.lineStyle(2, 0x5a3d22, a);
    g.lineBetween(p.x, p.y - 28, p.x, p.y - 36);
  }
  g.fillStyle(0xc94545, 0.85 * a);
  g.fillCircle(0, -40, 3);
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
