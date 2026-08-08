import type { GameObjects } from "phaser";
import type { ResourceId } from "../sim/types";
import { RESOURCES } from "../data/resources";

type Pt = { x: number; y: number };

function fillPoly(g: GameObjects.Graphics, pts: Pt[], color: number, alpha: number) {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
}

function diamond(cx: number, cy: number, hw: number, hh: number) {
  return {
    N: { x: cx, y: cy - hh },
    E: { x: cx + hw, y: cy },
    S: { x: cx, y: cy + hh },
    W: { x: cx - hw, y: cy },
  };
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const gg = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (gg << 8) | b;
}

/** Deterministic ±1 jitter from salt (keeps redraws stable). */
function jit(salt: number, i: number, amp = 1): number {
  const n = ((salt * 17 + i * 31) % 7) - 3;
  return (n / 3) * amp;
}

/**
 * Irregular iso boulder — offset vertices so it reads as rock, not a crate.
 * `skew` pulls the top face off-center for a tumbled look.
 */
function isoBoulder(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  hw: number,
  hh: number,
  h: number,
  color: number,
  salt = 0,
  oreFlecks?: number,
) {
  const jN = jit(salt, 1, hw * 0.18);
  const jE = jit(salt, 2, hh * 0.22);
  const jS = jit(salt, 3, hw * 0.16);
  const jW = jit(salt, 4, hh * 0.2);
  const skewX = jit(salt, 5, hw * 0.28);
  const skewY = jit(salt, 6, hh * 0.2);
  const hL = h * (0.88 + ((salt % 5) / 5) * 0.28);
  const hR = h * (0.82 + (((salt * 3) % 5) / 5) * 0.32);

  const base = {
    N: { x: x + jN * 0.4, y: y - hh + jN * 0.2 },
    E: { x: x + hw + jE * 0.3, y: y + jE * 0.25 },
    S: { x: x + jS * 0.35, y: y + hh + jS * 0.15 },
    W: { x: x - hw + jW * 0.3, y: y + jW * 0.2 },
  };
  // Extra mid-edge nubs so the silhouette isn't a clean diamond
  const baseSE = {
    x: (base.S.x + base.E.x) * 0.5 + jit(salt, 7, hw * 0.12),
    y: (base.S.y + base.E.y) * 0.5 + jit(salt, 8, hh * 0.1),
  };
  const baseSW = {
    x: (base.S.x + base.W.x) * 0.5 + jit(salt, 9, hw * 0.12),
    y: (base.S.y + base.W.y) * 0.5 + jit(salt, 10, hh * 0.1),
  };

  const top = {
    N: { x: base.N.x + skewX, y: base.N.y - hL + skewY },
    E: { x: base.E.x + skewX * 0.6, y: base.E.y - hR },
    S: { x: base.S.x + skewX * 0.4, y: base.S.y - (hL + hR) * 0.48 },
    W: { x: base.W.x + skewX * 0.5, y: base.W.y - hL * 0.92 },
  };
  const topSE = {
    x: (top.S.x + top.E.x) * 0.5 + jit(salt, 11, hw * 0.08),
    y: (top.S.y + top.E.y) * 0.5 - jit(salt, 12, h * 0.06),
  };
  const topSW = {
    x: (top.S.x + top.W.x) * 0.5 + jit(salt, 13, hw * 0.08),
    y: (top.S.y + top.W.y) * 0.5 - jit(salt, 14, h * 0.05),
  };

  // Left face (SW) — darker
  fillPoly(g, [base.W, baseSW, base.S, top.S, topSW, top.W], shade(color, 0.62), 1);
  // Right face (SE) — mid
  fillPoly(g, [base.S, baseSE, base.E, top.E, topSE, top.S], shade(color, 0.82), 1);
  // Top face — lit, slightly irregular pentagon
  fillPoly(
    g,
    [
      top.N,
      {
        x: (top.N.x + top.E.x) * 0.5 + jit(salt, 15, hw * 0.06),
        y: (top.N.y + top.E.y) * 0.5,
      },
      top.E,
      topSE,
      top.S,
      topSW,
      top.W,
      {
        x: (top.N.x + top.W.x) * 0.5 + jit(salt, 16, hw * 0.05),
        y: (top.N.y + top.W.y) * 0.5,
      },
    ],
    shade(color, 1.08 + ((salt % 3) * 0.04)),
    1,
  );

  // Hairline cracks / facet edges on the crown
  g.lineStyle(1, shade(color, 0.55), 0.45);
  g.lineBetween(top.N.x, top.N.y, top.S.x + jit(salt, 17, 1.5), top.S.y);
  if (salt % 2 === 0) {
    g.lineBetween(
      top.W.x + hw * 0.15,
      top.W.y,
      topSE.x - hw * 0.1,
      topSE.y + hh * 0.1,
    );
  } else {
    g.lineBetween(top.E.x - hw * 0.1, top.E.y, topSW.x, topSW.y);
  }

  // Soft rim on the lit NE edge
  g.lineStyle(1, shade(color, 1.35), 0.35);
  g.lineBetween(top.N.x, top.N.y, top.E.x, top.E.y);

  if (oreFlecks != null) {
    const fleck = shade(oreFlecks, 1.05);
    const bright = shade(oreFlecks, 1.25);
    g.fillStyle(fleck, 0.95);
    // Vein across the top
    g.fillTriangle(
      top.N.x + hw * 0.1,
      top.N.y + hh * 0.35,
      top.S.x - hw * 0.05,
      top.S.y - hh * 0.15,
      top.S.x + hw * 0.12,
      top.S.y - hh * 0.05,
    );
    g.fillStyle(bright, 0.9);
    g.fillCircle(top.W.x + hw * 0.45, top.W.y + hh * 0.2, Math.max(1.1, hw * 0.12));
    g.fillCircle(top.E.x - hw * 0.35, top.E.y + hh * 0.15, Math.max(0.9, hw * 0.1));
    // Glint on right face
    g.fillStyle(bright, 0.55);
    g.fillCircle(
      (base.E.x + top.E.x) * 0.5 - hw * 0.1,
      (base.E.y + top.E.y) * 0.5,
      Math.max(0.8, hw * 0.09),
    );
  }
}

type BoulderSpec = {
  dx: number;
  dy: number;
  hw: number;
  hh: number;
  h: number;
  color: number;
  salt: number;
  ore?: number;
};

function drawBoulderPile(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  s: number,
  rocks: BoulderSpec[],
) {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rocks) {
    minX = Math.min(minX, r.dx - r.hw);
    maxX = Math.max(maxX, r.dx + r.hw);
    maxY = Math.max(maxY, r.dy + r.hh);
  }
  const shadowHw = Math.max(9, (maxX - minX) * 0.58 + 2);
  const shadowCx = (minX + maxX) * 0.5;
  const shadow = diamond(
    x + shadowCx * s,
    y + (maxY + 1.8) * s,
    shadowHw * s,
    shadowHw * 0.48 * s,
  );
  fillPoly(g, [shadow.N, shadow.E, shadow.S, shadow.W], 0x000000, 0.2);

  // Draw back-to-front by dy
  const ordered = [...rocks].sort((a, b) => a.dy - b.dy);
  for (const r of ordered) {
    isoBoulder(
      g,
      x + r.dx * s,
      y + r.dy * s,
      r.hw * s,
      r.hh * s,
      r.h * s,
      r.color,
      r.salt,
      r.ore,
    );
  }
}

function stonePile(salt: number, accent: number): BoulderSpec[] {
  const greyA = shade(0x6a7078, 0.92 + (salt % 5) * 0.03);
  const greyB = shade(accent, 0.9 + ((salt * 3) % 4) * 0.035);
  const greyC = shade(0x9aa0a8, 0.94 + ((salt * 5) % 5) * 0.02);
  const moss = shade(0x5a6550, 0.85);
  switch (salt % 4) {
    case 0:
      return [
        { dx: -5, dy: 2, hw: 8, hh: 4.2, h: 7.5, color: greyA, salt },
        { dx: 6, dy: 1, hw: 6.5, hh: 3.4, h: 5.5, color: greyB, salt: salt + 3 },
        { dx: 0, dy: -3, hw: 5.2, hh: 2.7, h: 4.2, color: greyC, salt: salt + 7 },
        { dx: 3, dy: 4, hw: 3.8, hh: 2, h: 3, color: shade(greyA, 0.88), salt: salt + 11 },
      ];
    case 1:
      return [
        { dx: -1, dy: 1, hw: 9, hh: 4.6, h: 6.5, color: greyB, salt },
        { dx: -7, dy: -1, hw: 4.8, hh: 2.5, h: 4.5, color: greyA, salt: salt + 5 },
        { dx: 7, dy: 2, hw: 5.5, hh: 2.9, h: 5.8, color: greyC, salt: salt + 9 },
        { dx: 2, dy: -3, hw: 3.5, hh: 1.8, h: 2.8, color: moss, salt: salt + 13 },
      ];
    case 2:
      return [
        { dx: 1, dy: 2, hw: 7.2, hh: 3.8, h: 8.2, color: greyA, salt },
        { dx: -7, dy: 1, hw: 5.5, hh: 2.9, h: 4.8, color: greyB, salt: salt + 2 },
        { dx: 6, dy: -2, hw: 5, hh: 2.6, h: 4.5, color: greyC, salt: salt + 6 },
        { dx: -2, dy: -3, hw: 4, hh: 2.1, h: 3.5, color: shade(greyA, 0.95), salt: salt + 10 },
        { dx: 4, dy: 4, hw: 3.2, hh: 1.7, h: 2.6, color: shade(greyB, 0.9), salt: salt + 14 },
      ];
    default:
      return [
        { dx: 4, dy: 1, hw: 7.5, hh: 3.9, h: 7, color: greyA, salt },
        { dx: -6, dy: 2, hw: 6, hh: 3.1, h: 5.2, color: greyB, salt: salt + 4 },
        { dx: -1, dy: -3, hw: 4.8, hh: 2.5, h: 4, color: greyC, salt: salt + 8 },
        { dx: 7, dy: -1, hw: 3.6, hh: 1.9, h: 3.2, color: moss, salt: salt + 12 },
      ];
  }
}

function metalOrePile(salt: number, ore: number): BoulderSpec[] {
  // Grey host rock + copper ore accent — reads as rocky ore, not orange crates
  const hostA = shade(0x5e646c, 0.94 + (salt % 4) * 0.03);
  const hostB = shade(0x787e86, 0.92 + ((salt * 3) % 5) * 0.025);
  const hostC = shade(0x4a5058, 0.96);
  switch (salt % 3) {
    case 0:
      return [
        { dx: -3, dy: 2, hw: 7.5, hh: 3.9, h: 6.8, color: hostA, salt, ore },
        { dx: 6, dy: 0, hw: 5.8, hh: 3, h: 5.5, color: hostB, salt: salt + 5, ore },
        { dx: 0, dy: -3, hw: 4.5, hh: 2.3, h: 3.8, color: hostC, salt: salt + 9 },
      ];
    case 1:
      return [
        { dx: 0, dy: 1, hw: 8.2, hh: 4.2, h: 7.2, color: hostA, salt, ore },
        { dx: -7, dy: 0, hw: 5, hh: 2.6, h: 4.8, color: hostC, salt: salt + 3 },
        { dx: 6, dy: 2, hw: 5.2, hh: 2.7, h: 5.2, color: hostB, salt: salt + 7, ore },
        { dx: 2, dy: -3, hw: 3.8, hh: 2, h: 3.2, color: shade(hostA, 1.05), salt: salt + 11, ore },
      ];
    default:
      return [
        { dx: -5, dy: 1, hw: 6.5, hh: 3.4, h: 6, color: hostB, salt, ore },
        { dx: 5, dy: 2, hw: 6.8, hh: 3.5, h: 6.5, color: hostA, salt: salt + 4, ore },
        { dx: 1, dy: -2, hw: 5, hh: 2.6, h: 4.5, color: hostC, salt: salt + 8, ore },
        { dx: -2, dy: 4, hw: 3.5, hh: 1.8, h: 2.8, color: shade(hostB, 0.9), salt: salt + 12 },
      ];
  }
}

/** Draw a distinctive deposit / carry mark at world position. */
export function drawResourceMark(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  id: ResourceId,
  scale = 1,
  salt = 0,
): void {
  const color = RESOURCES[id].color;
  const s = scale;

  switch (id) {
    case "wood": {
      const lean = ((salt * 17) % 5) - 2;
      const shadow = diamond(x + lean * 0.3 * s, y + 2 * s, 11 * s, 5.5 * s);
      fillPoly(g, [shadow.N, shadow.E, shadow.S, shadow.W], 0x000000, 0.2);
      // Trunk with slight taper
      g.fillStyle(0x4a3220, 1);
      g.fillRect(x - 1.8 * s + lean * 0.15 * s, y - 5 * s, 3.6 * s, 9 * s);
      g.fillStyle(0x6b4a2a, 1);
      g.fillRect(x - 1.2 * s + lean * 0.15 * s, y - 5 * s, 1.4 * s, 9 * s);

      const deep = shade(0x2a4a24, 0.95 + ((salt * 3) % 4) * 0.03);
      const mid = shade(color, 0.94 + (salt % 5) * 0.03);
      const lit = shade(0x5a8f4d, 0.98 + ((salt * 5) % 3) * 0.03);
      for (const [dy, hw, col] of [
        [-22, 10, deep],
        [-16, 9.5, mid],
        [-10, 8, lit],
        [-5, 6, shade(mid, 1.08)],
      ] as const) {
        const canopy = diamond(x + lean * s * 0.35, y + dy * s, hw * s, (hw * s) / 2);
        fillPoly(g, [canopy.N, canopy.E, canopy.S, canopy.W], col, 1);
      }
      // Canopy rim highlight
      g.lineStyle(1, shade(lit, 1.25), 0.4);
      g.lineBetween(
        x + lean * s * 0.35,
        y - 22 * s - 5 * s,
        x + lean * s * 0.35 + 9 * s,
        y - 16 * s,
      );
      break;
    }
    case "stone": {
      drawBoulderPile(g, x, y, s, stonePile(salt, color));
      break;
    }
    case "food": {
      // Berry bush — foliage mound + fruit clusters
      const shadow = diamond(x, y + 2 * s, 10 * s, 4.5 * s);
      fillPoly(g, [shadow.N, shadow.E, shadow.S, shadow.W], 0x000000, 0.16);
      g.fillStyle(shade(0x3a6a28, 0.95), 1);
      g.fillEllipse(x, y - 1 * s, 16 * s, 9 * s);
      g.fillStyle(shade(0x4a8f3a, 1.05), 1);
      g.fillEllipse(x - 2 * s, y - 3 * s, 12 * s, 7 * s);
      g.fillStyle(shade(0x5a9a48, 1.1), 0.85);
      g.fillEllipse(x + 3 * s, y - 2 * s, 8 * s, 5 * s);
      // Berries / grain heads
      const berry = shade(color, 1.05);
      g.fillStyle(berry, 1);
      for (const [bx, by, r] of [
        [-4, -2, 1.8],
        [2, -4, 1.6],
        [5, -1, 1.5],
        [-1, 1, 1.7],
        [3, 2, 1.4],
      ] as const) {
        g.fillCircle(x + bx * s, y + by * s, r * s);
      }
      g.fillStyle(0xf0e080, 0.55);
      g.fillCircle(x + 2 * s, y - 4.5 * s, 0.8 * s);
      break;
    }
    case "metal": {
      drawBoulderPile(g, x, y, s, metalOrePile(salt, color));
      break;
    }
    case "knowledge": {
      // Soft glow under a faceted star
      g.fillStyle(color, 0.22);
      g.fillCircle(x, y - 1 * s, 9 * s);
      g.fillStyle(shade(color, 0.92), 1);
      g.fillTriangle(x, y - 10 * s, x - 2.4 * s, y - 1 * s, x + 2.4 * s, y - 1 * s);
      g.fillTriangle(x, y + 8 * s, x - 2.4 * s, y - 1 * s, x + 2.4 * s, y - 1 * s);
      g.fillTriangle(x - 9 * s, y - 1 * s, x - 1 * s, y - 2.8 * s, x - 1 * s, y + 0.6 * s);
      g.fillTriangle(x + 9 * s, y - 1 * s, x + 1 * s, y - 2.8 * s, x + 1 * s, y + 0.6 * s);
      g.fillStyle(0xfff8e8, 0.95);
      g.fillCircle(x, y - 1 * s, 2 * s);
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(x - 0.5 * s, y - 1.8 * s, 0.8 * s);
      break;
    }
  }
}
