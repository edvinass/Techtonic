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

function isoRock(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  hw: number,
  hh: number,
  h: number,
  color: number,
) {
  const base = diamond(x, y, hw, hh);
  const top = {
    N: { x: base.N.x, y: base.N.y - h },
    E: { x: base.E.x, y: base.E.y - h },
    S: { x: base.S.x, y: base.S.y - h },
    W: { x: base.W.x, y: base.W.y - h },
  };
  fillPoly(g, [base.W, base.S, top.S, top.W], shade(color, 0.7), 1);
  fillPoly(g, [base.S, base.E, top.E, top.S], shade(color, 0.88), 1);
  fillPoly(g, [top.N, top.E, top.S, top.W], shade(color, 1.12), 1);
}

/** Draw a distinctive deposit / carry mark at world position. */
export function drawResourceMark(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  id: ResourceId,
  scale = 1,
): void {
  const color = RESOURCES[id].color;
  const s = scale;

  switch (id) {
    case "wood": {
      // Iso shadow + trunk, canopy as layered diamonds (reads on the grid)
      const shadow = diamond(x, y + 2 * s, 10 * s, 5 * s);
      fillPoly(g, [shadow.N, shadow.E, shadow.S, shadow.W], 0x000000, 0.18);
      g.fillStyle(0x5a3d22, 1);
      g.fillRect(x - 1.6 * s, y - 4 * s, 3.2 * s, 8 * s);

      for (const [dy, hw, col] of [
        [-18, 9, 0x2f5a28],
        [-12, 8, color],
        [-6, 6.5, 0x4a6f35],
      ] as const) {
        const canopy = diamond(x, y + dy * s, hw * s, (hw * s) / 2);
        fillPoly(g, [canopy.N, canopy.E, canopy.S, canopy.W], col, 1);
      }
      break;
    }
    case "stone": {
      const shadow = diamond(x, y + 3 * s, 11 * s, 5.5 * s);
      fillPoly(g, [shadow.N, shadow.E, shadow.S, shadow.W], 0x000000, 0.16);
      isoRock(g, x - 4 * s, y + 1 * s, 7 * s, 3.5 * s, 7 * s, 0x6f747c);
      isoRock(g, x + 5 * s, y + 2 * s, 6 * s, 3 * s, 5 * s, color);
      isoRock(g, x + 1 * s, y - 2 * s, 4.5 * s, 2.2 * s, 4 * s, 0xb8bcc4);
      break;
    }
    case "food": {
      g.fillStyle(color, 1);
      g.fillCircle(x - 3 * s, y - 2 * s, 2.6 * s);
      g.fillCircle(x + 3 * s, y - 3 * s, 2.3 * s);
      g.fillCircle(x, y + 2 * s, 2.8 * s);
      g.lineStyle(1.2 * s, 0x5a4a20, 1);
      g.lineBetween(x, y - 7 * s, x, y - 3 * s);
      break;
    }
    case "metal": {
      isoRock(g, x, y, 6 * s, 3 * s, 6 * s, color);
      g.lineStyle(1, 0x5a3d1c, 0.9);
      const outline = diamond(x, y - 6 * s, 6 * s, 3 * s);
      g.beginPath();
      g.moveTo(outline.N.x, outline.N.y);
      g.lineTo(outline.E.x, outline.E.y);
      g.lineTo(outline.S.x, outline.S.y);
      g.lineTo(outline.W.x, outline.W.y);
      g.closePath();
      g.strokePath();
      break;
    }
    case "knowledge": {
      g.fillStyle(color, 1);
      g.fillTriangle(x, y - 9 * s, x - 2.2 * s, y - 1 * s, x + 2.2 * s, y - 1 * s);
      g.fillTriangle(x, y + 7 * s, x - 2.2 * s, y - 1 * s, x + 2.2 * s, y - 1 * s);
      g.fillTriangle(x - 8 * s, y - 1 * s, x - 1 * s, y - 2.5 * s, x - 1 * s, y + 0.5 * s);
      g.fillTriangle(x + 8 * s, y - 1 * s, x + 1 * s, y - 2.5 * s, x + 1 * s, y + 0.5 * s);
      g.fillStyle(0xf2ebe0, 0.9);
      g.fillCircle(x, y - 1 * s, 1.6 * s);
      break;
    }
  }
}
