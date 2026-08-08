import type { GameObjects } from "phaser";
import type { ResourceId } from "../sim/types";
import { RESOURCES } from "../data/resources";

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
      // Layered pine-like tree
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(x, y + 2 * s, 14 * s, 6 * s);
      g.fillStyle(0x5a3d22, 1);
      g.fillRect(x - 1.6 * s, y - 4 * s, 3.2 * s, 8 * s);
      g.fillStyle(0x2f5a28, 1);
      g.fillTriangle(x, y - 22 * s, x - 9 * s, y - 6 * s, x + 9 * s, y - 6 * s);
      g.fillStyle(color, 1);
      g.fillTriangle(x, y - 18 * s, x - 7.5 * s, y - 4 * s, x + 7.5 * s, y - 4 * s);
      g.fillStyle(0x4a6f35, 1);
      g.fillTriangle(x, y - 12 * s, x - 6 * s, y + 1 * s, x + 6 * s, y + 1 * s);
      break;
    }
    case "stone": {
      g.fillStyle(0x000000, 0.16);
      g.fillEllipse(x + 1 * s, y + 3 * s, 16 * s, 7 * s);
      g.fillStyle(0x6f747c, 1);
      g.fillTriangle(x - 8 * s, y + 3 * s, x - 3 * s, y - 8 * s, x + 4 * s, y + 2 * s);
      g.fillStyle(color, 1);
      g.fillTriangle(x - 2 * s, y + 2 * s, x + 5 * s, y - 7 * s, x + 10 * s, y + 4 * s);
      g.fillStyle(0xb8bcc4, 1);
      g.fillCircle(x + 1 * s, y + 1 * s, 3.2 * s);
      g.fillStyle(0x5a5f68, 0.55);
      g.fillCircle(x - 2 * s, y - 1 * s, 1.4 * s);
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
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(x - 6 * s, y);
      g.lineTo(x, y - 5 * s);
      g.lineTo(x + 6 * s, y);
      g.lineTo(x + 6 * s, y + 4 * s);
      g.lineTo(x, y + 8 * s);
      g.lineTo(x - 6 * s, y + 4 * s);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, 0x5a3d1c, 0.9);
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
