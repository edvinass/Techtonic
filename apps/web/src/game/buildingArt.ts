import type { GameObjects } from "phaser";
import type { AgeId, BuildingId } from "../sim/types";

function shadow(g: GameObjects.Graphics, alpha: number) {
  g.fillStyle(0x000000, 0.22 * alpha);
  g.fillEllipse(0, 8, 40, 16);
}

function progressBar(g: GameObjects.Graphics, progress: number) {
  g.fillStyle(0x1b2618, 0.7);
  g.fillRoundedRect(-18, 10, 36, 5, 2);
  g.fillStyle(0xe8c95a, 1);
  g.fillRoundedRect(-18, 10, 36 * progress, 5, 2);
}

/** Draw a more realistic stone-age building centered at (0,0) ground point. */
export function drawBuildingArt(
  g: GameObjects.Graphics,
  type: BuildingId,
  opts: { alpha?: number; age?: AgeId; progress?: number; active?: boolean },
): void {
  const alpha = opts.alpha ?? 1;
  const progress = opts.progress ?? 1;
  const farming = opts.age === "farming";
  shadow(g, alpha);

  switch (type) {
    case "house":
      drawHouse(g, alpha, farming);
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
  }

  if (progress < 1) {
    // Scaffold poles
    g.lineStyle(2, 0x8a6a3a, 0.75 * alpha);
    g.lineBetween(-20, 6, -20, -34);
    g.lineBetween(20, 6, 20, -34);
    g.lineBetween(-20, -20, 20, -20);
    progressBar(g, progress);
  } else if (opts.active) {
    g.fillStyle(0xfff3c4, 0.1);
    g.fillCircle(0, -12, 26);
  }
}

function drawHouse(g: GameObjects.Graphics, a: number, farming: boolean) {
  // Walls — mud / wattle
  const wall = farming ? 0xd2b48c : 0xb8956a;
  const roof = farming ? 0x8f6a3a : 0x6b8f4e;
  g.fillStyle(wall, a);
  g.fillRoundedRect(-18, -22, 36, 26, 3);
  // Timber beams
  g.lineStyle(1.5, 0x5a3d22, 0.7 * a);
  g.lineBetween(-18, -10, 18, -10);
  g.lineBetween(-6, -22, -6, 4);
  g.lineBetween(6, -22, 6, 4);
  // Door
  g.fillStyle(0x3a2818, a);
  g.fillRoundedRect(-5, -8, 10, 12, 2);
  // Thatched / leafy roof
  g.fillStyle(roof, a);
  g.fillTriangle(-22, -20, 22, -20, 0, -40);
  g.fillStyle(farming ? 0xa67c45 : 0x557a3c, a);
  g.fillTriangle(-16, -22, 16, -22, 0, -36);
  // Window glow
  g.fillStyle(0xf0d080, 0.55 * a);
  g.fillRect(8, -16, 5, 4);
}

function drawLumberCamp(g: GameObjects.Graphics, a: number) {
  // Open timber shed
  g.fillStyle(0x6b4a2a, a);
  g.fillRect(-20, -6, 4, 14);
  g.fillRect(16, -6, 4, 14);
  g.fillStyle(0x8a6238, a);
  g.fillTriangle(-24, -6, 24, -6, 0, -28);
  g.fillStyle(0x5c3d20, 0.9 * a);
  g.fillRect(-18, -8, 36, 3);
  // Log pile
  g.fillStyle(0x7a5230, a);
  g.fillEllipse(-6, 2, 14, 7);
  g.fillEllipse(4, 3, 12, 6);
  g.fillEllipse(-1, 5, 16, 6);
  g.lineStyle(1, 0x3a2818, 0.6 * a);
  g.strokeEllipse(-6, 2, 14, 7);
  // Chopping stump + axe
  g.fillStyle(0x5a3d22, a);
  g.fillCircle(14, 4, 5);
  g.fillStyle(0x8a8f98, a);
  g.fillTriangle(16, -10, 22, -2, 14, -1);
  g.fillStyle(0x4a3020, a);
  g.fillRect(15, -2, 2, 8);
}

function drawQuarry(g: GameObjects.Graphics, a: number) {
  // Rock face / piles
  g.fillStyle(0x8a8f98, a);
  g.fillTriangle(-18, 6, -4, -18, 8, 6);
  g.fillStyle(0x6f747c, a);
  g.fillTriangle(-2, 6, 10, -14, 22, 6);
  g.fillStyle(0xa8adb6, a);
  g.fillCircle(-8, 0, 6);
  g.fillCircle(6, 2, 5);
  g.fillCircle(14, -2, 4);
  // Wooden crane frame
  g.lineStyle(2.5, 0x6b4a2a, a);
  g.lineBetween(-16, 6, -4, -26);
  g.lineBetween(-4, -26, 18, -8);
  g.lineStyle(1.5, 0xc0c4cc, 0.8 * a);
  g.lineBetween(-4, -24, 8, 0);
}

function drawResearchHut(g: GameObjects.Graphics, a: number) {
  // Hide tent
  g.fillStyle(0x8b6914, a);
  g.fillTriangle(-20, 4, 20, 4, 0, -34);
  g.fillStyle(0x6b4f12, a);
  g.fillTriangle(-14, 4, 14, 4, 0, -28);
  // Entrance flap
  g.fillStyle(0x3a2818, 0.85 * a);
  g.fillTriangle(-6, 4, 6, 4, 0, -8);
  // Fire pit glow
  g.fillStyle(0xff8a3a, 0.55 * a);
  g.fillCircle(0, 6, 5);
  g.fillStyle(0xffd27a, 0.7 * a);
  g.fillCircle(0, 5, 2.5);
  // Totem / carved post
  g.fillStyle(0x5a3d22, a);
  g.fillRect(14, -18, 3, 22);
  g.fillStyle(0x7b6bb5, 0.85 * a);
  g.fillCircle(15.5, -20, 3.5);
}

function drawFarm(g: GameObjects.Graphics, a: number) {
  // Tilled rows
  g.fillStyle(0x6b5a32, a);
  g.fillEllipse(0, 4, 42, 18);
  g.lineStyle(1.2, 0xd4c05a, 0.75 * a);
  for (let i = -3; i <= 3; i++) {
    g.lineBetween(-16, 2 + i * 2, 16, -2 + i * 2);
  }
  // Small shed
  g.fillStyle(0xc4a574, a);
  g.fillRect(-6, -18, 14, 12);
  g.fillStyle(0x8f6a3a, a);
  g.fillTriangle(-8, -18, 10, -18, 1, -28);
  // Crop tufts
  g.fillStyle(0x8fbf4a, a);
  for (const [x, y] of [
    [-12, 0],
    [-4, 2],
    [6, 0],
    [12, 3],
  ] as const) {
    g.fillTriangle(x, y - 6, x - 2, y, x + 2, y);
  }
}

function drawGranary(g: GameObjects.Graphics, a: number) {
  // Raised stilts
  g.fillStyle(0x5a3d22, a);
  g.fillRect(-14, -2, 3, 12);
  g.fillRect(11, -2, 3, 12);
  g.fillRect(-4, -2, 3, 12);
  g.fillRect(3, -2, 3, 12);
  // Store body
  g.fillStyle(0xe0c089, a);
  g.fillRoundedRect(-18, -28, 36, 26, 3);
  g.fillStyle(0xc4a060, a);
  for (let y = -24; y <= -8; y += 5) {
    g.fillRect(-16, y, 32, 1.5);
  }
  // Cap roof
  g.fillStyle(0x8f6a3a, a);
  g.fillTriangle(-22, -26, 22, -26, 0, -44);
  g.fillStyle(0xa67c45, a);
  g.fillTriangle(-14, -28, 14, -28, 0, -40);
  // Ladder
  g.lineStyle(1.5, 0x6b4a2a, a);
  g.lineBetween(-18, 8, -18, -20);
  g.lineBetween(-13, 8, -13, -20);
  for (let y = 4; y >= -16; y -= 5) g.lineBetween(-18, y, -13, y);
}
