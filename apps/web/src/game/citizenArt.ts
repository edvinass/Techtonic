import Phaser from "phaser";
import { RESOURCES } from "../data/resources";
import type { ResourceId } from "../sim/types";
import type { Citizen, WorkKind } from "./citizens";
import { mapTextResolution } from "./textRes";

/** Bump when CitizenParts shape changes so MainScene can rebuild stale sprites (HMR-safe). */
export const CITIZEN_ART_VERSION = 3;

const SKIN = [0xf0c8a0, 0xe8b890, 0xd4a574, 0xc68642, 0x8d5524] as const;
const HAIR = [0x2a1c10, 0x4a3020, 0x6b4423, 0xc4a060, 0x1a120c] as const;
const TUNIC = [0x6b8f4e, 0x8a6238, 0x4a5a7a, 0xc4a574, 0x5a7a8a, 0xa67c52] as const;
const BELT = [0x3a2818, 0x5a3d22, 0x4a3020] as const;

/** Cool white scholar robes + knowledge-blue sash. */
const RESEARCH_ROBE = 0xeef2f6;
const RESEARCH_SASH = 0x5a8ab8;

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export interface CitizenParts {
  artVersion: number;
  shadow: Phaser.GameObjects.Ellipse;
  legL: Phaser.GameObjects.Container;
  legR: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  armL: Phaser.GameObjects.Container;
  armR: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Container;
  skull: Phaser.GameObjects.Arc;
  hair: Phaser.GameObjects.Arc;
  face: Phaser.GameObjects.Container;
  tool: Phaser.GameObjects.Container;
  toolAxe: Phaser.GameObjects.Container;
  toolPick: Phaser.GameObjects.Container;
  toolHoe: Phaser.GameObjects.Container;
  toolStaff: Phaser.GameObjects.Container;
  staffTip: Phaser.GameObjects.Arc;
  staffGlow: Phaser.GameObjects.Arc;
  researchAura: Phaser.GameObjects.Container;
  auraRing: Phaser.GameObjects.Ellipse;
  sparkA: Phaser.GameObjects.Arc;
  sparkB: Phaser.GameObjects.Arc;
  sparkC: Phaser.GameObjects.Arc;
  researchMark: Phaser.GameObjects.Text;
  bundle: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  baseScale: number;
  skin: number;
  baseTunic: number;
  baseBelt: number;
  wearingResearch: boolean;
}

export type CitizenNode = Phaser.GameObjects.Container & { parts: CitizenParts };

export function isCitizenArtCurrent(node: CitizenNode): boolean {
  return node.parts?.artVersion === CITIZEN_ART_VERSION;
}

function makeLeg(
  scene: Phaser.Scene,
  x: number,
  tunic: number,
): Phaser.GameObjects.Container {
  const wrap = scene.add.rectangle(0, 1, 3.2, 5, shade(tunic, 0.75));
  wrap.setOrigin(0.5, 0);
  const calf = scene.add.rectangle(0, 5.5, 2.6, 5, 0x3a2818);
  calf.setOrigin(0.5, 0);
  const foot = scene.add.ellipse(0.6, 11, 4.2, 2.2, 0x2a1c10);
  return scene.add.container(x, 0, [wrap, calf, foot]);
}

function makeArm(
  scene: Phaser.Scene,
  x: number,
  skin: number,
  sleeve: number,
): Phaser.GameObjects.Container {
  const upper = scene.add.rectangle(0, 0, 2.6, 5, sleeve);
  upper.setOrigin(0.5, 0);
  const forearm = scene.add.rectangle(0, 4.5, 2.3, 5.5, skin);
  forearm.setOrigin(0.5, 0);
  const hand = scene.add.circle(0, 10.2, 1.5, shade(skin, 0.92));
  return scene.add.container(x, -10, [upper, forearm, hand]);
}

function makeBody(
  scene: Phaser.Scene,
  tunic: number,
  belt: number,
): Phaser.GameObjects.Container {
  const shoulders = scene.add.rectangle(0, -12, 9.5, 4, shade(tunic, 1.05));
  const torso = scene.add.rectangle(0, -7, 8.5, 9, tunic);
  torso.setStrokeStyle(1, shade(tunic, 0.55), 0.4);
  const hem = scene.add.rectangle(0, -1.5, 9.2, 4.5, shade(tunic, 0.88));
  const sash = scene.add.rectangle(0, -5, 9, 2, belt);
  const fold = scene.add.rectangle(-2, -9, 1.2, 7, shade(tunic, 0.78), 0.55);
  return scene.add.container(0, 0, [hem, torso, shoulders, sash, fold]);
}

function makeHead(
  scene: Phaser.Scene,
  skin: number,
  hairColor: number,
  style: number,
): {
  head: Phaser.GameObjects.Container;
  skull: Phaser.GameObjects.Arc;
  hair: Phaser.GameObjects.Arc;
  face: Phaser.GameObjects.Container;
} {
  const neck = scene.add.rectangle(0, -13.5, 3, 3, shade(skin, 0.9));
  const skull = scene.add.circle(0, -18, 5, skin);
  skull.setStrokeStyle(1, shade(skin, 0.65), 0.35);

  const nose = scene.add.ellipse(0.8, -17.2, 1.6, 2.2, shade(skin, 0.85));
  const eyeL = scene.add.circle(-1.6, -18.2, 0.85, 0x2a1c10);
  const eyeR = scene.add.circle(1.6, -18.2, 0.85, 0x2a1c10);
  const browL = scene.add.rectangle(-1.6, -19.4, 2.2, 0.7, hairColor, 0.7);
  const browR = scene.add.rectangle(1.6, -19.4, 2.2, 0.7, hairColor, 0.7);
  const face = scene.add.container(0, 0, [nose, browL, browR, eyeL, eyeR]);

  const hair = scene.add.circle(0, -20.5, 5.1, hairColor);
  const extras: Phaser.GameObjects.GameObject[] = [];

  if (style % 3 === 0) {
    extras.push(scene.add.ellipse(-4.2, -18, 2.2, 3.5, hairColor));
    extras.push(scene.add.ellipse(4.2, -18, 2.2, 3.5, hairColor));
  } else if (style % 3 === 1) {
    extras.push(scene.add.ellipse(0, -16.5, 6.5, 3, hairColor));
    extras.push(scene.add.ellipse(-3.5, -15, 2.5, 4, hairColor));
    extras.push(scene.add.ellipse(3.5, -15, 2.5, 4, hairColor));
  } else {
    extras.push(scene.add.ellipse(-4, -18.5, 2, 3, hairColor));
    extras.push(scene.add.ellipse(4, -18.5, 2, 3, hairColor));
    extras.push(scene.add.circle(0, -24.5, 2.2, hairColor));
    extras.push(scene.add.rectangle(0, -22.5, 1.5, 2.5, hairColor));
  }

  if (style % 5 === 2) {
    extras.push(scene.add.ellipse(0, -14.5, 4.5, 3.2, shade(hairColor, 0.9)));
  }

  const head = scene.add.container(0, 0, [neck, skull, hair, ...extras, face]);
  return { head, skull, hair, face };
}

function makeAxe(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const handle = scene.add.rectangle(0, 2, 1.8, 12, 0x6b4a2a);
  handle.setOrigin(0.5, 0.5);
  const blade = scene.add.triangle(1, -4, 0, 0, 7, 2, 0, -5, 0x9aa0a8);
  blade.setStrokeStyle(1, 0x5a5f68, 0.6);
  const wrap = scene.add.rectangle(0, 0, 2.4, 2, 0x8a6238);
  return scene.add.container(0, 0, [handle, wrap, blade]);
}

function makePick(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const handle = scene.add.rectangle(0, 2, 1.8, 12, 0x5a3d22);
  const head = scene.add.rectangle(1, -4, 9, 2.2, 0x8a8f98);
  head.setAngle(-15);
  const tip = scene.add.triangle(5, -5.5, 0, 0, 4, 1, 0, -2, 0x6f747c);
  return scene.add.container(0, 0, [handle, head, tip]);
}

function makeHoe(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const handle = scene.add.rectangle(0, 1, 1.6, 13, 0x6b4a2a);
  const blade = scene.add.rectangle(2, -5, 6, 2.5, 0x7a7f88);
  blade.setAngle(25);
  return scene.add.container(0, 0, [handle, blade]);
}

function makeStaff(scene: Phaser.Scene): {
  staff: Phaser.GameObjects.Container;
  tip: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
} {
  const pole = scene.add.rectangle(0, 0, 1.8, 16, 0x5a3d22);
  const glow = scene.add.circle(0, -9, 8, 0x7eb8e8, 0.45);
  const tip = scene.add.circle(0, -9, 3.2, 0xd4a84b, 1);
  tip.setStrokeStyle(1.5, 0xfff3c4, 0.85);
  const staff = scene.add.container(0, 0, [pole, glow, tip]);
  return { staff, tip, glow };
}

function makeResearchAura(
  scene: Phaser.Scene,
  dpr: number,
): {
  aura: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Ellipse;
  sparkA: Phaser.GameObjects.Arc;
  sparkB: Phaser.GameObjects.Arc;
  sparkC: Phaser.GameObjects.Arc;
  mark: Phaser.GameObjects.Text;
} {
  const ring = scene.add.ellipse(0, -6, 28, 14, 0x7eb8e8, 0.22);
  ring.setStrokeStyle(1.5, 0xb8d8f0, 0.65);
  const sparkA = scene.add.circle(0, -28, 2.4, 0xfff8e8, 1);
  const sparkB = scene.add.circle(0, -28, 2.1, 0x7eb8e8, 1);
  const sparkC = scene.add.circle(0, -28, 2.2, 0xd4a84b, 1);
  const mark = scene.add.text(0, -40, "✦", {
    fontFamily: "DM Sans, sans-serif",
    fontSize: "14px",
    color: "#d4a84b",
    stroke: "#142017",
    strokeThickness: 3,
    resolution: mapTextResolution(dpr),
  });
  mark.setOrigin(0.5, 1);
  const aura = scene.add.container(0, 0, [ring, sparkA, sparkB, sparkC, mark]);
  aura.setVisible(false);
  return { aura, ring, sparkA, sparkB, sparkC, mark };
}

function makeBundle(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const basket = scene.add.ellipse(0, 1, 9, 7.5, 0x8a6238);
  basket.setStrokeStyle(1.2, 0x3a2818, 0.55);
  const rim = scene.add.ellipse(0, -2, 8.5, 3.2, 0xa67c52);
  rim.setStrokeStyle(1, 0x5a3d22, 0.45);
  const weave1 = scene.add.rectangle(0, 1, 7, 0.8, 0x6b4a2a, 0.45);
  const weave2 = scene.add.rectangle(0, 3, 6.5, 0.8, 0x6b4a2a, 0.35);
  const gem = scene.add.circle(0, 0.5, 2.4, 0x6b8f4e);
  return scene.add.container(-7, -8, [basket, rim, weave1, weave2, gem]);
}

export function createCitizenArt(scene: Phaser.Scene, c: Citizen): CitizenNode {
  const skin = SKIN[c.id % SKIN.length];
  const hairColor = HAIR[(c.id * 3) % HAIR.length];
  const tunic = TUNIC[c.id % TUNIC.length];
  const belt = BELT[c.id % BELT.length];
  const sleeve = shade(tunic, 0.92);

  const shadow = scene.add.ellipse(0, 3, 14, 6, 0x000000, 0.28);

  const legL = makeLeg(scene, -2.4, tunic);
  const legR = makeLeg(scene, 2.4, tunic);
  const body = makeBody(scene, tunic, belt);
  const armL = makeArm(scene, -5.2, skin, sleeve);
  const armR = makeArm(scene, 5.2, skin, sleeve);
  const { head, skull, hair, face } = makeHead(scene, skin, hairColor, c.id);

  const toolAxe = makeAxe(scene);
  const toolPick = makePick(scene);
  const toolHoe = makeHoe(scene);
  const { staff: toolStaff, tip: staffTip, glow: staffGlow } = makeStaff(scene);
  const tool = scene.add.container(6.5, -9, [toolAxe, toolPick, toolHoe, toolStaff]);
  toolAxe.setVisible(true);
  toolPick.setVisible(false);
  toolHoe.setVisible(false);
  toolStaff.setVisible(false);

  const dpr = (scene.game.registry.get("dpr") as number) || 1;
  const { aura: researchAura, ring: auraRing, sparkA, sparkB, sparkC, mark: researchMark } =
    makeResearchAura(scene, dpr);

  const bundle = makeBundle(scene);
  bundle.setVisible(false);

  const label = scene.add.text(0, -32, "", {
    fontFamily: "DM Sans, sans-serif",
    fontSize: "10px",
    color: "#fff8e8",
    stroke: "#142017",
    strokeThickness: 2,
    resolution: mapTextResolution(dpr),
  });
  label.setOrigin(0.5, 1);
  label.setVisible(false);

  const baseScale = 1.05 + (c.id % 5) * 0.05;
  const node = scene.add.container(c.x, c.y, [
    shadow,
    researchAura,
    legL,
    legR,
    body,
    armL,
    armR,
    head,
    tool,
    bundle,
    label,
  ]) as CitizenNode;

  node.parts = {
    artVersion: CITIZEN_ART_VERSION,
    shadow,
    legL,
    legR,
    body,
    armL,
    armR,
    head,
    skull,
    hair,
    face,
    tool,
    toolAxe,
    toolPick,
    toolHoe,
    toolStaff,
    staffTip,
    staffGlow,
    researchAura,
    auraRing,
    sparkA,
    sparkB,
    sparkC,
    researchMark,
    bundle,
    label,
    baseScale,
    skin,
    baseTunic: tunic,
    baseBelt: belt,
    wearingResearch: false,
  };
  node.setScale(baseScale);
  return node;
}

/** Recolor tunic / sleeves / leg wraps for scholar robes vs everyday clothes. */
function applyOutfit(parts: CitizenParts, research: boolean): void {
  if (parts.wearingResearch === research) return;
  parts.wearingResearch = research;

  const tunic = research ? RESEARCH_ROBE : parts.baseTunic;
  const belt = research ? RESEARCH_SASH : parts.baseBelt;
  const sleeve = shade(tunic, research ? 0.98 : 0.92);

  // body: [hem, torso, shoulders, sash, fold]
  const hem = parts.body.getAt(0) as Phaser.GameObjects.Rectangle;
  const torso = parts.body.getAt(1) as Phaser.GameObjects.Rectangle;
  const shoulders = parts.body.getAt(2) as Phaser.GameObjects.Rectangle;
  const sash = parts.body.getAt(3) as Phaser.GameObjects.Rectangle;
  const fold = parts.body.getAt(4) as Phaser.GameObjects.Rectangle;
  hem.setFillStyle(shade(tunic, 0.88));
  torso.setFillStyle(tunic);
  torso.setStrokeStyle(1, shade(tunic, research ? 0.72 : 0.55), research ? 0.55 : 0.4);
  shoulders.setFillStyle(shade(tunic, 1.05));
  sash.setFillStyle(belt);
  fold.setFillStyle(shade(tunic, 0.78), 0.55);

  for (const arm of [parts.armL, parts.armR]) {
    const upper = arm.getAt(0) as Phaser.GameObjects.Rectangle;
    upper.setFillStyle(sleeve);
  }
  for (const leg of [parts.legL, parts.legR]) {
    const wrap = leg.getAt(0) as Phaser.GameObjects.Rectangle;
    wrap.setFillStyle(shade(tunic, 0.75));
  }
}

function workFromCitizen(c: Citizen): WorkKind | null {
  if (c.job.kind === "walk" || c.job.kind === "gather" || c.job.kind === "work") {
    return c.job.work;
  }
  return null;
}

function selectTool(parts: CitizenParts, work: WorkKind | null, resource?: ResourceId) {
  const { toolAxe, toolPick, toolHoe, toolStaff } = parts;
  toolAxe.setVisible(false);
  toolPick.setVisible(false);
  toolHoe.setVisible(false);
  toolStaff.setVisible(false);

  if (work === "research" || resource === "knowledge") {
    toolStaff.setVisible(true);
    return;
  }
  if (work === "farm" || (work === "forage" && resource === "food")) {
    toolHoe.setVisible(true);
    return;
  }
  if (resource === "stone" || resource === "metal" || work === "build") {
    toolPick.setVisible(true);
    return;
  }
  toolAxe.setVisible(true);
}

export function updateCitizenArt(node: CitizenNode, c: Citizen): void {
  const {
    legL,
    legR,
    armL,
    armR,
    head,
    tool,
    bundle,
    label,
    skull,
    baseScale,
    skin,
    staffTip,
    staffGlow,
    researchAura,
    auraRing,
    sparkA,
    sparkB,
    sparkC,
    researchMark,
  } = node.parts;
  const walking = c.job.kind === "walk";
  const working = c.job.kind === "gather" || c.job.kind === "work";
  const work = workFromCitizen(c);
  const resource =
    c.carrying ??
    (c.job.kind === "walk" || c.job.kind === "gather" ? c.job.resource : undefined);
  // Whole research trip: walk out, channel, walk back with knowledge
  const onResearch =
    work === "research" || resource === "knowledge" || c.carrying === "knowledge";
  const channeling = onResearch && working;
  const phase = c.bobPhase;

  applyOutfit(node.parts, onResearch);

  const walkSwing = walking ? Math.sin(phase * 0.9) : 0;
  const workSwing = working && !onResearch ? Math.sin(phase * 0.35) : 0;
  const researchSwing = channeling ? Math.sin(phase * 0.45) : 0;
  const pulse = onResearch ? 0.5 + 0.5 * Math.sin(phase * 0.9) : 0;
  const fastPulse = onResearch ? 0.5 + 0.5 * Math.sin(phase * 1.6) : 0;

  legL.setAngle(-14 * walkSwing);
  legR.setAngle(14 * walkSwing);

  if (channeling) {
    // Clear "channel" pose: staff overhead, other arm out for balance
    armL.setAngle(-28 + 8 * researchSwing);
    armR.setAngle(-75 - 28 * researchSwing);
    head.setAngle(-6 + 5 * Math.sin(phase * 0.35));
  } else if (onResearch && walking) {
    // Staff carried upright while travelling
    armL.setAngle(10 * walkSwing);
    armR.setAngle(-28 + 6 * walkSwing);
    head.setAngle(0);
  } else {
    armL.setAngle(12 * walkSwing - 6 * workSwing);
    armR.setAngle(-12 * walkSwing + 22 * workSwing);
    head.setAngle(0);
  }

  const bob = walking ? Math.abs(Math.sin(phase * 0.9)) * 1.2 : Math.sin(phase * 0.5) * 0.4;
  const workBob = working
    ? onResearch
      ? Math.abs(Math.sin(phase * 0.45)) * 0.9
      : Math.abs(Math.sin(phase * 0.35)) * 0.55
    : 0;
  // Extra float while channeling so the pose reads from a distance
  const researchLift = channeling ? 2.2 + pulse * 1.4 : onResearch ? 0.6 : 0;
  node.setPosition(c.x, c.y - bob - workBob - researchLift);
  node.setDepth(10_000 + c.y);

  let facing = 1;
  if (walking && c.job.kind === "walk") {
    facing = c.job.tx >= c.x ? 1 : -1;
  }
  node.setScale(baseScale * facing, baseScale);

  const showTool =
    onResearch ||
    working ||
    (walking &&
      c.job.kind === "walk" &&
      (c.job.phase === "toResource" || c.job.phase === "toSite"));
  tool.setVisible(showTool);
  if (channeling) {
    tool.setAngle(-95 - 25 * researchSwing);
  } else if (onResearch) {
    tool.setAngle(-40);
  } else {
    tool.setAngle(working ? -22 + 28 * workSwing : -14);
  }
  if (showTool) selectTool(node.parts, work, resource);

  if (onResearch && showTool) {
    staffGlow.setVisible(true);
    staffGlow.setAlpha(0.35 + 0.45 * pulse);
    staffGlow.setScale(1 + 0.55 * pulse);
    staffTip.setAlpha(1);
    staffTip.setScale(1 + 0.35 * fastPulse);
    staffTip.setFillStyle(pulse > 0.65 ? 0xfff3c4 : 0xd4a84b);
  } else {
    staffGlow.setVisible(false);
    staffGlow.setAlpha(0.45);
    staffGlow.setScale(1);
    staffTip.setAlpha(1);
    staffTip.setScale(1);
    staffTip.setFillStyle(0xd4a84b);
  }

  researchAura.setVisible(onResearch);
  if (onResearch) {
    // Counter-scale so the mark isn't mirrored when facing left
    researchAura.setScale(facing, 1);
    researchAura.setAlpha(channeling ? 0.85 + 0.15 * pulse : 0.55 + 0.25 * pulse);
    auraRing.setAlpha(0.18 + 0.28 * pulse);
    auraRing.setScale(0.9 + 0.35 * pulse, 0.85 + 0.25 * pulse);

    const orbit = phase * 1.15;
    const radius = channeling ? 12 : 8;
    sparkA.setPosition(Math.cos(orbit) * radius, -26 + Math.sin(orbit * 1.4) * 5);
    sparkB.setPosition(Math.cos(orbit + 2.1) * (radius + 2), -24 + Math.sin(orbit * 1.2 + 1) * 6);
    sparkC.setPosition(Math.cos(orbit + 4.2) * (radius - 1), -30 + Math.sin(orbit + 2) * 4);
    sparkA.setAlpha(0.55 + 0.45 * Math.sin(phase * 1.3));
    sparkB.setAlpha(0.5 + 0.5 * Math.sin(phase * 1.1 + 1));
    sparkC.setAlpha(0.5 + 0.5 * Math.sin(phase * 1.5 + 2));
    sparkA.setScale(0.9 + 0.5 * fastPulse);
    sparkB.setScale(0.85 + 0.45 * pulse);
    sparkC.setScale(0.9 + 0.4 * fastPulse);

    researchMark.setVisible(true);
    researchMark.setY(-38 - pulse * 6);
    researchMark.setAlpha(0.65 + 0.35 * pulse);
    researchMark.setScale(0.95 + 0.25 * pulse);
    researchMark.setColor(pulse > 0.6 ? "#fff3c4" : "#d4a84b");
  } else {
    researchMark.setVisible(false);
  }

  if (c.carryAmount > 0 && c.carrying) {
    setBundle(bundle, label, c.carrying, c.carryAmount);
    // Researchers keep the staff while hauling knowledge home
    if (c.job.kind === "walk" && c.job.phase === "toDropoff" && !onResearch) {
      tool.setVisible(false);
    }
  } else {
    bundle.setVisible(false);
    label.setVisible(false);
  }

  skull.setFillStyle(channeling ? shade(skin, 1.14) : working ? shade(skin, 1.06) : skin);
}

function setBundle(
  bundle: Phaser.GameObjects.Container,
  label: Phaser.GameObjects.Text,
  resource: ResourceId,
  amount: number,
) {
  const visual = RESOURCES[resource];
  bundle.setVisible(true);
  const gem = bundle.getAt(4) as Phaser.GameObjects.Arc;
  gem.setFillStyle(visual.color);
  if (resource === "wood") {
    gem.setScale(1.1, 0.7);
  } else if (resource === "stone") {
    gem.setScale(1, 0.85);
  } else if (resource === "food") {
    gem.setScale(0.9, 0.9);
  } else {
    gem.setScale(1, 1);
  }
  const fill = Math.min(1, amount / 8);
  bundle.setScale(0.9 + fill * 0.35);
  label.setVisible(true);
  label.setColor(`#${visual.hex}`);
  label.setText(`${visual.glyph}${Math.max(1, Math.round(amount))}`);
}
