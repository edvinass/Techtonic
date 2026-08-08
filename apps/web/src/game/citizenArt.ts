import Phaser from "phaser";
import { RESOURCES } from "../data/resources";
import type { ResourceId } from "../sim/types";
import type { Citizen } from "./citizens";

const SKIN = [0xf0c8a0, 0xe8b890, 0xd4a574, 0xc68642, 0x8d5524] as const;
const HAIR = [0x2a1c10, 0x4a3020, 0x6b4423, 0xc4a060, 0x1a120c] as const;
const TUNIC = [0x6b8f4e, 0x8a6238, 0x7b6bb5, 0xc4a574, 0x5a7a8a] as const;

export interface CitizenParts {
  shadow: Phaser.GameObjects.Ellipse;
  legL: Phaser.GameObjects.Rectangle;
  legR: Phaser.GameObjects.Rectangle;
  body: Phaser.GameObjects.Rectangle;
  armL: Phaser.GameObjects.Rectangle;
  armR: Phaser.GameObjects.Rectangle;
  head: Phaser.GameObjects.Arc;
  hair: Phaser.GameObjects.Arc;
  tool: Phaser.GameObjects.Container;
  bundle: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  baseScale: number;
}

export type CitizenNode = Phaser.GameObjects.Container & { parts: CitizenParts };

export function createCitizenArt(scene: Phaser.Scene, c: Citizen): CitizenNode {
  const skin = SKIN[c.id % SKIN.length];
  const hairColor = HAIR[c.id % HAIR.length];
  const tunic = TUNIC[c.id % TUNIC.length];

  const shadow = scene.add.ellipse(0, 2, 12, 5, 0x000000, 0.28);
  const legL = scene.add.rectangle(-2.2, 0, 2.4, 7, 0x3a2818);
  const legR = scene.add.rectangle(2.2, 0, 2.4, 7, 0x3a2818);
  legL.setOrigin(0.5, 0);
  legR.setOrigin(0.5, 0);

  const body = scene.add.rectangle(0, -8, 8, 10, tunic);
  body.setStrokeStyle(1, 0x2a1c10, 0.35);

  const armL = scene.add.rectangle(-4.5, -9, 2.2, 7, skin);
  const armR = scene.add.rectangle(4.5, -9, 2.2, 7, skin);
  armL.setOrigin(0.5, 0);
  armR.setOrigin(0.5, 0);

  const head = scene.add.circle(0, -16, 4.2, skin);
  head.setStrokeStyle(1, 0x3a2818, 0.25);
  const hair = scene.add.circle(0, -18.5, 4.4, hairColor);

  const toolHandle = scene.add.rectangle(0, 0, 1.8, 10, 0x6b4a2a);
  const toolHead = scene.add.triangle(0, -6, 0, -2, 6, -4, 0, -8, 0x8a8f98);
  const tool = scene.add.container(6, -10, [toolHandle, toolHead]);

  const sack = scene.add.ellipse(0, 0, 8, 7, 0x8a6238);
  sack.setStrokeStyle(1, 0x3a2818, 0.5);
  const gem = scene.add.circle(0, -1, 2.2, 0x6b8f4e);
  const bundle = scene.add.container(-6, -9, [sack, gem]);
  bundle.setVisible(false);

  const label = scene.add.text(0, -28, "", {
    fontFamily: "DM Sans, sans-serif",
    fontSize: "9px",
    color: "#fff8e8",
    stroke: "#142017",
    strokeThickness: 2,
  });
  label.setOrigin(0.5, 1);
  label.setVisible(false);

  const baseScale = 0.95 + (c.id % 4) * 0.05;
  const node = scene.add.container(c.x, c.y, [
    shadow,
    legL,
    legR,
    body,
    armL,
    armR,
    head,
    hair,
    tool,
    bundle,
    label,
  ]) as CitizenNode;

  node.parts = {
    shadow,
    legL,
    legR,
    body,
    armL,
    armR,
    head,
    hair,
    tool,
    bundle,
    label,
    baseScale,
  };
  node.setScale(baseScale);
  return node;
}

export function updateCitizenArt(node: CitizenNode, c: Citizen): void {
  const { legL, legR, armL, armR, tool, bundle, label, head, baseScale } = node.parts;
  const walking = c.job.kind === "walk";
  const working = c.job.kind === "gather" || c.job.kind === "work";
  const phase = c.bobPhase;

  // Walk stays snappy; work uses a much slower chop/idle cycle
  const walkSwing = walking ? Math.sin(phase * 0.9) : 0;
  const workSwing = working ? Math.sin(phase * 0.35) : 0;

  legL.setAngle(-12 * walkSwing);
  legR.setAngle(12 * walkSwing);
  armL.setAngle(10 * walkSwing - 4 * workSwing);
  armR.setAngle(-10 * walkSwing + 10 * workSwing);

  const bob = walking ? Math.abs(Math.sin(phase * 0.9)) * 1.1 : Math.sin(phase * 0.5) * 0.35;
  const workBob = working ? Math.abs(Math.sin(phase * 0.35)) * 0.45 : 0;
  node.setPosition(c.x, c.y - bob - workBob);
  node.setDepth(10_000 + c.y);

  let facing = 1;
  if (walking && c.job.kind === "walk") {
    facing = c.job.tx >= c.x ? 1 : -1;
  }
  node.setScale(baseScale * facing, baseScale);

  const showTool =
    working || (walking && c.job.kind === "walk" && c.job.phase === "toResource");
  tool.setVisible(showTool);
  tool.setAngle(working ? -18 + 12 * workSwing : -12);

  if (c.carryAmount > 0 && c.carrying) {
    setBundle(bundle, label, c.carrying, c.carryAmount);
    if (c.job.kind === "walk" && c.job.phase === "toDropoff") {
      tool.setVisible(false);
    }
  } else {
    bundle.setVisible(false);
    label.setVisible(false);
  }

  head.setFillStyle(working ? 0xf5d0a8 : SKIN[c.id % SKIN.length]);
}

function setBundle(
  bundle: Phaser.GameObjects.Container,
  label: Phaser.GameObjects.Text,
  resource: ResourceId,
  amount: number,
) {
  const visual = RESOURCES[resource];
  bundle.setVisible(true);
  const gem = bundle.getAt(1) as Phaser.GameObjects.Arc;
  gem.setFillStyle(visual.color);
  const fill = Math.min(1, amount / 8);
  bundle.setScale(0.85 + fill * 0.35);
  label.setVisible(true);
  label.setColor(`#${visual.hex}`);
  label.setText(`${visual.glyph}${Math.max(1, Math.round(amount))}`);
}
