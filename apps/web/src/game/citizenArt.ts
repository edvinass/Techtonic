import Phaser from "phaser";
import { RESOURCES } from "../data/resources";
import type { ResourceId } from "../sim/types";
import type { Citizen, WorkKind } from "./citizens";
import { mapTextResolution } from "./textRes";

/** Bump when CitizenParts shape changes so MainScene can rebuild stale sprites (HMR-safe). */
export const CITIZEN_ART_VERSION = 12;

const SKIN = [0xf4d4b0, 0xefc49a, 0xdcb07e, 0xc99258, 0x9a6640] as const;
/** Mix of soft crops and warm tones — less “dark hooded” than raiders. */
const HAIR = [0x3d2a18, 0x6a4a28, 0xa07840, 0xc8a868, 0x5a3c28, 0x8a6040] as const;
/** Fresh village cloth — linen, sage, sky, rose — not muddy leather browns. */
const TUNIC = [0x8fb86a, 0xe8d4b0, 0x6a8fb8, 0xd4a070, 0x7a9aa8, 0xc47878] as const;
const BELT = [0x8a6a40, 0xa08050, 0x6a8a5a] as const;
const BOOT = [0x6a4a30, 0x7a5a38, 0x5a4030] as const;
/** Light apron wash for civilians (woven cloth, not armor). */
const APRON = [0xf2e6d0, 0xe8e0c8, 0xd8c8a8] as const;

const RESEARCH_ROBE = 0xf0f3f6;
const RESEARCH_SASH = 0x5a8ab8;

/** Village watch — teal sash + soft leather, distinct from raider crimson. */
const GUARD_TUNIC = 0x5a6a58;
const GUARD_SASH = 0xc4a050;
const GUARD_HELM = 0x6a7a68;

type OutfitMode = "civilian" | "research" | "guard";

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
  hairExtras: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Container;
  eye: Phaser.GameObjects.Arc;
  pupil: Phaser.GameObjects.Arc;
  mouth: Phaser.GameObjects.Ellipse;
  outfitHem: Phaser.GameObjects.Ellipse;
  outfitTorso: Phaser.GameObjects.Rectangle;
  outfitShoulders: Phaser.GameObjects.Ellipse;
  outfitSash: Phaser.GameObjects.Rectangle;
  outfitFold: Phaser.GameObjects.Rectangle;
  outfitApron: Phaser.GameObjects.Rectangle;
  sleeveL: Phaser.GameObjects.Rectangle;
  sleeveR: Phaser.GameObjects.Rectangle;
  wrapL: Phaser.GameObjects.Rectangle;
  wrapR: Phaser.GameObjects.Rectangle;
  researchHood: Phaser.GameObjects.Container;
  guardHelm: Phaser.GameObjects.Container;
  tool: Phaser.GameObjects.Container;
  toolAxe: Phaser.GameObjects.Container;
  toolPick: Phaser.GameObjects.Container;
  toolHoe: Phaser.GameObjects.Container;
  toolStaff: Phaser.GameObjects.Container;
  toolSpear: Phaser.GameObjects.Container;
  toolShield: Phaser.GameObjects.Container;
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
  baseApron: number;
  outfitMode: OutfitMode;
  blinkUntil: number;
  /** +1 faces screen-right, -1 faces screen-left; persists after walking stops. */
  lastFacing: 1 | -1;
}

export type CitizenNode = Phaser.GameObjects.Container & { parts: CitizenParts };

export function isCitizenArtCurrent(node: CitizenNode): boolean {
  return node.parts?.artVersion === CITIZEN_ART_VERSION;
}

/** Side-view leg. Local +X is forward (toes). */
function makeLeg(
  scene: Phaser.Scene,
  x: number,
  tunic: number,
  boot: number,
  back: boolean,
): { leg: Phaser.GameObjects.Container; wrap: Phaser.GameObjects.Rectangle } {
  const dim = back ? 0.78 : 1;
  const wrap = scene.add.rectangle(0, 0.2, 3.2, 5.2, shade(tunic, 0.7 * dim));
  wrap.setOrigin(0.5, 0);
  const calf = scene.add.rectangle(0.2, 5.2, 2.6, 5, shade(boot, 1.1 * dim));
  calf.setOrigin(0.5, 0);
  const bootShape = scene.add.ellipse(1.2, 10.8, 5.2, 2.4, shade(boot, dim));
  const sole = scene.add.ellipse(1.8, 11.8, 5.4, 1.5, shade(boot, 0.65 * dim));
  const leg = scene.add.container(x, 0, [wrap, calf, bootShape, sole]);
  if (back) leg.setAlpha(0.85);
  return { leg, wrap };
}

/** Side-view arm. Local +X is forward. */
function makeArm(
  scene: Phaser.Scene,
  x: number,
  skin: number,
  sleeve: number,
  back: boolean,
): { arm: Phaser.GameObjects.Container; sleeve: Phaser.GameObjects.Rectangle } {
  const dim = back ? 0.8 : 1;
  const upper = scene.add.rectangle(0, 0, 2.8, 5, shade(sleeve, dim));
  upper.setOrigin(0.5, 0);
  const forearm = scene.add.rectangle(0.3, 4.4, 2.4, 5.2, shade(skin, dim));
  forearm.setOrigin(0.5, 0);
  const hand = scene.add.circle(0.5, 10.2, 1.6, shade(skin, 0.95 * dim));
  const arm = scene.add.container(x, -10, [upper, forearm, hand]);
  if (back) arm.setAlpha(0.8);
  return { arm, sleeve: upper };
}

function makeBody(
  scene: Phaser.Scene,
  tunic: number,
  belt: number,
  apron: number,
): {
  body: Phaser.GameObjects.Container;
  hem: Phaser.GameObjects.Ellipse;
  torso: Phaser.GameObjects.Rectangle;
  shoulders: Phaser.GameObjects.Ellipse;
  sash: Phaser.GameObjects.Rectangle;
  fold: Phaser.GameObjects.Rectangle;
  apronShape: Phaser.GameObjects.Rectangle;
} {
  const hem = scene.add.ellipse(0.4, 0.2, 10, 5.4, shade(tunic, 0.88));
  const torso = scene.add.rectangle(0.3, -7, 7.6, 10.2, tunic);
  torso.setStrokeStyle(1, shade(tunic, 0.72), 0.28);
  const shoulders = scene.add.ellipse(0.2, -12.2, 9.2, 5, shade(tunic, 1.08));
  // Soft woven sash — thinner, brighter than raider leather belts
  const sash = scene.add.rectangle(0.3, -4, 8, 1.6, belt);
  const fold = scene.add.rectangle(-1.5, -8.5, 1, 6.5, shade(tunic, 0.86), 0.35);
  // Cloth apron front — reads as settler / craftsfolk
  const apronShape = scene.add.rectangle(1.1, -5.2, 4.2, 7.2, apron, 0.88);
  apronShape.setStrokeStyle(1, shade(apron, 0.78), 0.25);
  const body = scene.add.container(0, 0, [hem, torso, shoulders, apronShape, sash, fold]);
  return { body, hem, torso, shoulders, sash, fold, apronShape };
}

/** Soft white cowl — readable as scholar without a tall hat. */
function makeResearchHood(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const cape = scene.add.ellipse(-1.2, -14, 9, 7, RESEARCH_ROBE, 0.92);
  const crown = scene.add.ellipse(-0.2, -21.5, 8.5, 5.5, RESEARCH_ROBE);
  crown.setStrokeStyle(1, shade(RESEARCH_ROBE, 0.74), 0.45);
  const band = scene.add.rectangle(-0.2, -19.2, 6.5, 1.2, RESEARCH_SASH, 0.85);
  const hood = scene.add.container(0, 0, [cape, crown, band]);
  hood.setVisible(false);
  return hood;
}

/** Soft felt watch-cap — village militia, not raider hood. */
function makeGuardHelm(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const brim = scene.add.ellipse(0.2, -20, 8.8, 2.8, shade(GUARD_HELM, 0.85));
  const dome = scene.add.ellipse(0.1, -22, 7.6, 4.8, GUARD_HELM);
  dome.setStrokeStyle(1, shade(GUARD_SASH, 0.9), 0.45);
  const band = scene.add.rectangle(0.1, -20.4, 6.2, 1.1, GUARD_SASH, 0.9);
  const helm = scene.add.container(0, 0, [brim, dome, band]);
  helm.setVisible(false);
  return helm;
}

/**
 * Clean side-view head facing local +X.
 * Whole citizen flips via scale.x for the other direction.
 * Hair stays on crown/back only so the eye sits in open face, not through a hair disc.
 */
function makeHead(
  scene: Phaser.Scene,
  skin: number,
  hairColor: number,
  style: number,
): {
  head: Phaser.GameObjects.Container;
  skull: Phaser.GameObjects.Arc;
  hair: Phaser.GameObjects.Arc;
  hairExtras: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Container;
  eye: Phaser.GameObjects.Arc;
  pupil: Phaser.GameObjects.Arc;
  mouth: Phaser.GameObjects.Ellipse;
} {
  const neck = scene.add.rectangle(0, -13.5, 2.8, 3.2, shade(skin, 0.92));
  const ear = scene.add.ellipse(-3.6, -18, 2, 2.6, shade(skin, 0.9));
  const skull = scene.add.circle(0.4, -18.2, 5, skin);
  skull.setStrokeStyle(1, shade(skin, 0.72), 0.22);

  // Profile socket: small eye between mid-face and nose (not a big cheek disc)
  const eyeWhite = scene.add.ellipse(2.1, -18.9, 1.35, 1.15, 0xfffaf4);
  const eye = scene.add.circle(2.2, -18.9, 0.42, 0x2e2218);
  const pupil = scene.add.circle(2.32, -19.0, 0.16, 0xfff8e8, 0.9);
  const brow = scene.add.ellipse(2.0, -19.7, 1.5, 0.4, shade(hairColor, 0.9), 0.45);
  const nose = scene.add.ellipse(4.0, -17.8, 1.7, 1.5, shade(skin, 0.9));
  const mouth = scene.add.ellipse(2.0, -15.5, 1.5, 0.75, shade(skin, 0.78), 0.7);
  const cheek = scene.add.circle(1.4, -16.6, 0.9, shade(0xe88a78, 1), 0.16);

  const face = scene.add.container(0, 0, [cheek, eyeWhite, brow, eye, pupil, nose, mouth]);

  // Crown cap only — bottom clears the brow (~-19.5) so the eye never sits in hair
  const hair = scene.add.ellipse(-1.2, -22.4, 7.4, 4, hairColor);
  const hairExtras = scene.add.container(0, 0);
  const hairStyle = style % 4;

  if (hairStyle === 0) {
    // Soft short crop — back + crown
    hairExtras.add(scene.add.ellipse(-3.9, -19.4, 2.4, 3.2, hairColor));
    hairExtras.add(scene.add.ellipse(-0.6, -23.6, 5, 2.4, shade(hairColor, 1.1)));
  } else if (hairStyle === 1) {
    // Shoulder-length down the back only
    hairExtras.add(scene.add.ellipse(-3.9, -17.2, 2.8, 5.2, hairColor));
    hairExtras.add(scene.add.ellipse(-2.8, -14.6, 2.4, 3.6, shade(hairColor, 0.96)));
    hairExtras.add(scene.add.ellipse(-0.8, -23.4, 4.8, 2.4, shade(hairColor, 1.1)));
  } else if (hairStyle === 2) {
    // Neat bun
    hairExtras.add(scene.add.ellipse(-3.7, -19.6, 2.2, 2.8, hairColor));
    hairExtras.add(scene.add.circle(-1.6, -24.6, 2, hairColor));
    hairExtras.add(scene.add.ellipse(-1.4, -23, 2.6, 1.5, shade(hairColor, 1.12)));
  } else {
    // Kerchief on crown + tidy back hair (no frontal fringe over the eye)
    hairExtras.add(scene.add.ellipse(-3.7, -19.4, 2.2, 2.8, hairColor));
    const kerchief = scene.add.ellipse(-1, -22.6, 6.8, 3, 0xe8dcc8, 0.9);
    hairExtras.add(kerchief);
    hairExtras.add(scene.add.ellipse(-0.6, -23.6, 4.2, 2, shade(0xe8dcc8, 1.05), 0.85));
  }

  // Back hair under skull; crown over skull; face last so the eye sits on open skin
  const head = scene.add.container(0, 0, [neck, hairExtras, ear, skull, hair, face]);
  return { head, skull, hair, hairExtras, face, eye, pupil, mouth };
}

function makeAxe(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const handle = scene.add.rectangle(0, 2, 1.5, 12, 0x6b4a2a);
  const wrap = scene.add.rectangle(0, -0.5, 2.2, 2, 0x8a6238);
  const blade = scene.add.triangle(1.2, -4, 0, 0, 6.5, 2, 0, -4.5, 0xa8aeb6);
  blade.setStrokeStyle(1, 0x5a5f68, 0.5);
  return scene.add.container(0, 0, [handle, wrap, blade]);
}

function makePick(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const handle = scene.add.rectangle(0, 2, 1.5, 12, 0x5a3d22);
  const head = scene.add.rectangle(1, -3.8, 8.5, 2, 0x8a8f98);
  head.setAngle(-16);
  const tip = scene.add.triangle(4.8, -5.2, 0, 0, 3.5, 1, 0, -1.8, 0x6f747c);
  return scene.add.container(0, 0, [handle, head, tip]);
}

function makeHoe(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const handle = scene.add.rectangle(0, 1, 1.4, 13, 0x6b4a2a);
  const blade = scene.add.rectangle(2, -5, 5.5, 2.4, 0x8a8f98);
  blade.setAngle(26);
  return scene.add.container(0, 0, [handle, blade]);
}

function makeStaff(scene: Phaser.Scene): {
  staff: Phaser.GameObjects.Container;
  tip: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
} {
  const pole = scene.add.rectangle(0, 0, 1.5, 16, 0x5a3d22);
  const glow = scene.add.circle(0, -9, 7.5, 0x7eb8e8, 0.4);
  const tip = scene.add.circle(0, -9, 3, 0xd4a84b, 1);
  tip.setStrokeStyle(1.2, 0xfff3c4, 0.8);
  const staff = scene.add.container(0, 0, [pole, glow, tip]);
  return { staff, tip, glow };
}

function makeSpear(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const shaft = scene.add.rectangle(0, 1, 1.3, 17, 0x8a6a40);
  const wrap = scene.add.rectangle(0, -4.5, 2, 2, GUARD_SASH);
  const tip = scene.add.triangle(0, -9.2, 0, -5, 2.4, 0.4, -2.4, 0.4, 0xc0c6ce);
  tip.setStrokeStyle(1, 0x6a7078, 0.45);
  return scene.add.container(0, 0, [shaft, wrap, tip]);
}

function makeShield(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const disc = scene.add.ellipse(0, 0, 8.2, 9, 0x7a8a70);
  disc.setStrokeStyle(1.2, 0x4a5a40, 0.55);
  const face = scene.add.ellipse(0.2, -0.2, 5.8, 6.6, shade(0xa8b890, 1.05));
  const boss = scene.add.circle(0.2, 0, 1.5, GUARD_SASH);
  boss.setStrokeStyle(1, shade(GUARD_SASH, 0.7), 0.5);
  const strap = scene.add.rectangle(-0.8, 0.5, 1.1, 4.2, 0x5a4a30, 0.35);
  return scene.add.container(0, 0, [disc, face, strap, boss]);
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
  const ring = scene.add.ellipse(0, -4, 18, 9, 0x7eb8e8, 0.1);
  ring.setStrokeStyle(1, 0xb8d8f0, 0.35);
  // Kept in parts for compatibility; hidden — calmer look without orbit clutter
  const sparkA = scene.add.circle(0, -26, 1.5, 0xfff8e8, 0);
  const sparkB = scene.add.circle(0, -26, 1.5, 0x7eb8e8, 0);
  const sparkC = scene.add.circle(0, -26, 1.5, 0xd4a84b, 0);
  sparkA.setVisible(false);
  sparkB.setVisible(false);
  sparkC.setVisible(false);
  const mark = scene.add.text(0, -34, "✦", {
    fontFamily: "DM Sans, sans-serif",
    fontSize: "11px",
    color: "#c9a86a",
    stroke: "#142017",
    strokeThickness: 2,
    resolution: mapTextResolution(dpr),
  });
  mark.setOrigin(0.5, 1);
  const aura = scene.add.container(0, 0, [ring, sparkA, sparkB, sparkC, mark]);
  aura.setVisible(false);
  return { aura, ring, sparkA, sparkB, sparkC, mark };
}

function makeBundle(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const basket = scene.add.ellipse(0, 1, 9, 7, 0x8a6238);
  basket.setStrokeStyle(1, 0x3a2818, 0.5);
  const rim = scene.add.ellipse(0, -2, 8.2, 3, 0xa67c52);
  const weave = scene.add.rectangle(0, 1.5, 6.5, 0.7, 0x6b4a2a, 0.4);
  const gem = scene.add.circle(0, 0.3, 2.3, 0x6b8f4e);
  return scene.add.container(-6.5, -7.5, [basket, rim, weave, gem]);
}

export function createCitizenArt(scene: Phaser.Scene, c: Citizen): CitizenNode {
  const skin = SKIN[c.id % SKIN.length];
  const hairColor = HAIR[(c.id * 3) % HAIR.length];
  const tunic = TUNIC[c.id % TUNIC.length];
  const belt = BELT[c.id % BELT.length];
  const boot = BOOT[c.id % BOOT.length];
  const apron = APRON[c.id % APRON.length];
  const sleeveColor = shade(tunic, 0.94);

  const shadow = scene.add.ellipse(0, 3, 14, 5.5, 0x000000, 0.22);

  // Side view facing +X: legL/armL = back, legR/armR = front
  const { leg: legL, wrap: wrapL } = makeLeg(scene, -1.6, tunic, boot, true);
  const { leg: legR, wrap: wrapR } = makeLeg(scene, 1.8, tunic, boot, false);
  const {
    body,
    hem: outfitHem,
    torso: outfitTorso,
    shoulders: outfitShoulders,
    sash: outfitSash,
    fold: outfitFold,
    apronShape: outfitApron,
  } = makeBody(scene, tunic, belt, apron);
  const { arm: armL, sleeve: sleeveL } = makeArm(scene, -3.2, skin, sleeveColor, true);
  const { arm: armR, sleeve: sleeveR } = makeArm(scene, 3.4, skin, sleeveColor, false);
  const { head, skull, hair, hairExtras, face, eye, pupil, mouth } = makeHead(
    scene,
    skin,
    hairColor,
    c.id,
  );
  const researchHood = makeResearchHood(scene);
  const guardHelm = makeGuardHelm(scene);
  // Hood/helm behind face so features stay readable
  head.addAt(researchHood, 0);
  head.addAt(guardHelm, 0);

  const toolAxe = makeAxe(scene);
  const toolPick = makePick(scene);
  const toolHoe = makeHoe(scene);
  const { staff: toolStaff, tip: staffTip, glow: staffGlow } = makeStaff(scene);
  const toolSpear = makeSpear(scene);
  const toolShield = makeShield(scene);
  toolShield.setPosition(-5.5, -6);
  const tool = scene.add.container(4.5, -8.5, [
    toolAxe,
    toolPick,
    toolHoe,
    toolStaff,
    toolSpear,
  ]);
  toolAxe.setVisible(true);
  toolPick.setVisible(false);
  toolHoe.setVisible(false);
  toolStaff.setVisible(false);
  toolSpear.setVisible(false);
  toolShield.setVisible(false);

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

  const baseScale = 1.1 + (c.id % 5) * 0.04;
  // Draw order: back limbs under body, front limbs above
  const node = scene.add.container(c.x, c.y, [
    shadow,
    researchAura,
    legL,
    armL,
    toolShield,
    body,
    legR,
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
    hairExtras,
    face,
    eye,
    pupil,
    mouth,
    outfitHem,
    outfitTorso,
    outfitShoulders,
    outfitSash,
    outfitFold,
    outfitApron,
    sleeveL,
    sleeveR,
    wrapL,
    wrapR,
    researchHood,
    guardHelm,
    tool,
    toolAxe,
    toolPick,
    toolHoe,
    toolStaff,
    toolSpear,
    toolShield,
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
    baseApron: apron,
    outfitMode: "civilian",
    blinkUntil: 0,
    lastFacing: 1,
  };
  node.setScale(baseScale);
  return node;
}

function applyOutfit(parts: CitizenParts, mode: OutfitMode): void {
  if (parts.outfitMode === mode) return;
  parts.outfitMode = mode;

  const research = mode === "research";
  const guard = mode === "guard";
  const tunic = research ? RESEARCH_ROBE : guard ? GUARD_TUNIC : parts.baseTunic;
  const belt = research ? RESEARCH_SASH : guard ? GUARD_SASH : parts.baseBelt;
  const sleeve = shade(tunic, research ? 0.98 : guard ? 0.9 : 0.94);

  parts.outfitHem.setFillStyle(shade(tunic, research ? 0.9 : guard ? 0.82 : 0.88));
  parts.outfitTorso.setFillStyle(tunic);
  parts.outfitTorso.setStrokeStyle(
    1,
    shade(tunic, research ? 0.74 : guard ? 0.62 : 0.72),
    research ? 0.45 : guard ? 0.4 : 0.28,
  );
  parts.outfitShoulders.setFillStyle(shade(tunic, guard ? 0.98 : 1.08));
  parts.outfitSash.setFillStyle(belt);
  parts.outfitFold.setFillStyle(shade(tunic, 0.86), research ? 0.3 : 0.35);
  // Apron only for civilians — robes/armor hide it
  parts.outfitApron.setVisible(!research && !guard);
  if (!research && !guard) {
    parts.outfitApron.setFillStyle(parts.baseApron, 0.88);
  }

  parts.sleeveL.setFillStyle(sleeve);
  parts.sleeveR.setFillStyle(sleeve);
  parts.wrapL.setFillStyle(shade(tunic, 0.78));
  parts.wrapR.setFillStyle(shade(tunic, 0.78));

  parts.researchHood.setVisible(research);
  parts.guardHelm.setVisible(guard);
  parts.hair.setVisible(!research && !guard);
  parts.hairExtras.setVisible(!research && !guard);
}

function workFromCitizen(c: Citizen): WorkKind | null {
  if (c.job.kind === "walk" || c.job.kind === "gather" || c.job.kind === "work") {
    return c.job.work;
  }
  return null;
}

function selectTool(parts: CitizenParts, work: WorkKind | null, resource?: ResourceId) {
  const { toolAxe, toolPick, toolHoe, toolStaff, toolSpear, toolShield } = parts;
  toolAxe.setVisible(false);
  toolPick.setVisible(false);
  toolHoe.setVisible(false);
  toolStaff.setVisible(false);
  toolSpear.setVisible(false);
  toolShield.setVisible(false);

  if (work === "defend") {
    toolSpear.setVisible(true);
    toolShield.setVisible(true);
    return;
  }
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
  const parts = node.parts;
  const {
    legL,
    legR,
    armL,
    armR,
    head,
    body,
    tool,
    bundle,
    label,
    skull,
    shadow,
    baseScale,
    skin,
    staffTip,
    staffGlow,
    researchAura,
    auraRing,
    researchMark,
    eye,
    pupil,
    mouth,
  } = parts;

  const walking = c.job.kind === "walk";
  const working = c.job.kind === "gather" || c.job.kind === "work";
  const idle = c.job.kind === "idle";
  const carrying = c.carryAmount > 0 && !!c.carrying;
  const work = workFromCitizen(c);
  const resource =
    c.carrying ??
    (c.job.kind === "walk" || c.job.kind === "gather" ? c.job.resource : undefined);
  const onResearch =
    work === "research" || resource === "knowledge" || c.carrying === "knowledge";
  const onGuard = work === "defend";
  const channeling = onResearch && working;
  const watching = onGuard && working;
  const phase = c.bobPhase;

  applyOutfit(parts, onResearch ? "research" : onGuard ? "guard" : "civilian");

  // Faster stride frequency so steps keep up with travel speed
  const stride = walking ? Math.sin(phase * 1.85) : 0;
  const strideAbs = walking ? Math.abs(Math.sin(phase * 1.85)) : 0;
  const workSwing = working && !onResearch && !onGuard ? Math.sin(phase * 0.38) : 0;
  const workAbs = working && !onResearch && !onGuard ? Math.abs(Math.sin(phase * 0.38)) : 0;
  const researchSwing = channeling ? Math.sin(phase * 0.45) : 0;
  const guardScan = onGuard ? Math.sin(phase * 0.22) : 0;
  const pulse = onResearch ? 0.5 + 0.5 * Math.sin(phase * 0.9) : 0;
  const fastPulse = onResearch ? 0.5 + 0.5 * Math.sin(phase * 1.6) : 0;
  const breathe = Math.sin(phase * 0.4) * 0.4;
  const idleSway = idle ? Math.sin(phase * 0.2) : 0;

  // Side-view walk: opposite legs with a clear plant / lift
  legL.setAngle(-24 * stride);
  legR.setAngle(24 * stride);
  legL.setY(walking ? Math.max(0, -stride) * 1.8 : 0);
  legR.setY(walking ? Math.max(0, stride) * 1.8 : 0);

  if (channeling) {
    armL.setAngle(-20 + 6 * researchSwing);
    armR.setAngle(-70 - 24 * researchSwing);
    head.setAngle(-4 + 4 * Math.sin(phase * 0.35));
    body.setAngle(2 * researchSwing);
  } else if (onGuard) {
    // Upright spear stance — shield arm tucked, spear arm raised
    armL.setAngle(-12 + 4 * guardScan);
    armR.setAngle(watching ? -52 - 6 * guardScan : -28);
    head.setAngle(guardScan * 6);
    body.setAngle(guardScan * 1.5);
  } else if (working && !onResearch) {
    armL.setAngle(6 - 6 * workSwing);
    armR.setAngle(-6 + 36 * workSwing);
    head.setAngle(-2 + 4 * workAbs);
    body.setAngle(-4 + 8 * workSwing);
  } else if (carrying && !working) {
    armL.setAngle(-14);
    armR.setAngle(-10 * stride + (walking ? 0 : breathe * 3));
    head.setAngle(walking ? stride * 2 : idleSway * 3);
    body.setAngle(walking ? stride * 1.5 : idleSway * 1.5);
  } else if (walking) {
    armL.setAngle(18 * stride);
    armR.setAngle(-18 * stride);
    head.setAngle(stride * 3);
    body.setAngle(stride * 3);
  } else {
    armL.setAngle(3 + breathe * 2 + idleSway * 3);
    armR.setAngle(-3 - breathe * 2 - idleSway * 3);
    head.setAngle(idleSway * 4);
    body.setAngle(idleSway * 1.5);
  }

  const walkBob = walking ? strideAbs * 1.7 : 0;
  const idleBob = idle ? 0.4 + breathe * 0.4 : Math.sin(phase * 0.45) * 0.3;
  const workBob = working
    ? onResearch
      ? Math.abs(Math.sin(phase * 0.45)) * 0.8
      : onGuard
        ? Math.abs(guardScan) * 0.35
        : workAbs * 0.9
    : 0;
  const researchLift = channeling ? 1.2 + pulse * 0.6 : 0;
  const bob = walking ? walkBob : idleBob;

  node.setPosition(c.x, c.y - bob - workBob - researchLift);
  node.setDepth(10_000 + c.y);

  const shadowSquash = walking ? 1 + strideAbs * 0.14 : 1;
  shadow.setScale(shadowSquash, 1 / Math.max(0.8, shadowSquash));
  shadow.setAlpha(walking ? 0.24 + strideAbs * 0.06 : channeling ? 0.16 : 0.28);

  let facing = parts.lastFacing;
  if (walking && c.job.kind === "walk") {
    const dx = c.job.tx - c.x;
    if (Math.abs(dx) > 1.25) {
      facing = dx > 0 ? 1 : -1;
      parts.lastFacing = facing;
    }
  }
  node.setScale(baseScale * facing, baseScale);

  // Text lives under a flipped parent — counter-scale so glyphs/numbers stay readable
  const textFacing = facing;

  const showTool =
    onResearch ||
    onGuard ||
    working ||
    (walking &&
      c.job.kind === "walk" &&
      (c.job.phase === "toResource" || c.job.phase === "toSite"));
  tool.setVisible(showTool);
  if (channeling) {
    tool.setAngle(-88 - 18 * researchSwing);
  } else if (onResearch) {
    tool.setAngle(-34);
  } else if (onGuard) {
    tool.setAngle(watching ? -62 - 4 * guardScan : -40);
  } else if (working) {
    tool.setAngle(-24 + 34 * workSwing);
  } else {
    tool.setAngle(-12);
  }
  if (showTool) selectTool(parts, work, resource);
  else {
    parts.toolShield.setVisible(false);
  }
  if (onGuard && showTool) {
    parts.toolShield.setVisible(true);
    parts.toolShield.setAngle(-8 + guardScan * 4);
    parts.toolShield.setY(-6 + Math.abs(guardScan) * 0.4);
  }

  if (onResearch && showTool) {
    staffGlow.setVisible(true);
    staffGlow.setAlpha(0.15 + 0.2 * pulse);
    staffGlow.setScale(0.9 + 0.2 * pulse);
    staffTip.setScale(1 + 0.12 * fastPulse);
    staffTip.setFillStyle(0xd4a84b);
  } else {
    staffGlow.setVisible(false);
    staffGlow.setAlpha(0.35);
    staffGlow.setScale(1);
    staffTip.setScale(1);
    staffTip.setFillStyle(0xd4a84b);
  }

  researchAura.setVisible(onResearch);
  if (onResearch) {
    researchAura.setScale(1, 1);
    researchAura.setAlpha(channeling ? 0.7 : 0.45);
    auraRing.setAlpha(0.08 + 0.1 * pulse);
    auraRing.setScale(0.95 + 0.1 * pulse, 0.9 + 0.08 * pulse);

    researchMark.setVisible(true);
    researchMark.setY(-36 - pulse * 3);
    researchMark.setAlpha(0.55 + 0.25 * pulse);
    // Unflip mark relative to the citizen's facing
    researchMark.setScale(textFacing, 1);
    researchMark.setColor("#c9a86a");
  } else {
    researchMark.setVisible(false);
  }

  // Always keep carry-count text upright when the body faces left
  label.setScale(textFacing, 1);

  const blinkCycle = (phase * 0.08 + c.id * 0.37) % (Math.PI * 2);
  const blinking = blinkCycle > Math.PI * 1.92 || parts.blinkUntil > phase;
  if (blinkCycle > Math.PI * 1.92) parts.blinkUntil = phase + 0.12;
  const eyesOpen = !blinking;
  eye.setScale(1, eyesOpen ? 1 : 0.12);
  pupil.setVisible(eyesOpen);
  mouth.setScale(working ? 0.8 : 1, working ? 0.6 : 1);

  if (carrying) {
    setBundle(bundle, label, c.carrying!, c.carryAmount);
    if (c.job.kind === "walk" && c.job.phase === "toDropoff" && !onResearch) {
      tool.setVisible(false);
    }
    bundle.setAngle(walking ? -4 + stride * 3 : -3);
    bundle.setY(-7.5 + (walking ? strideAbs * 0.5 : 0));
  } else {
    bundle.setVisible(false);
    label.setVisible(false);
  }

  skull.setFillStyle(channeling ? shade(skin, 1.12) : working ? shade(skin, 1.05) : skin);
}

function setBundle(
  bundle: Phaser.GameObjects.Container,
  label: Phaser.GameObjects.Text,
  resource: ResourceId,
  amount: number,
) {
  const visual = RESOURCES[resource];
  bundle.setVisible(true);
  const gem = bundle.getAt(3) as Phaser.GameObjects.Arc;
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
  bundle.setScale(0.9 + fill * 0.3);
  label.setVisible(true);
  label.setColor(`#${visual.hex}`);
  label.setText(`${visual.glyph}${Math.max(1, Math.round(amount))}`);
}
