import Phaser from "phaser";
import type { Raider } from "./raiders";

/** Bump when RaiderParts shape changes so MainScene can rebuild stale sprites (HMR-safe). */
export const RAIDER_ART_VERSION = 1;

const SKIN = [0xd4a574, 0xc68642, 0x8d5524, 0xa07050] as const;
const HAIR = [0x1a120c, 0x2a1c10, 0x3a2818] as const;
const TUNIC = [0x5a2820, 0x6a3028, 0x4a2018, 0x3a2818] as const;
const SASH = [0x8a3a28, 0xa04830, 0x6b4a2a] as const;
const BOOT = [0x1a120c, 0x2a1c10] as const;

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export interface RaiderParts {
  artVersion: number;
  shadow: Phaser.GameObjects.Ellipse;
  legL: Phaser.GameObjects.Container;
  legR: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  armL: Phaser.GameObjects.Container;
  armR: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Container;
  eye: Phaser.GameObjects.Arc;
  pupil: Phaser.GameObjects.Arc;
  weapon: Phaser.GameObjects.Container;
  baseScale: number;
  lastFacing: 1 | -1;
  blinkUntil: number;
}

export type RaiderNode = Phaser.GameObjects.Container & { parts: RaiderParts };

export function isRaiderArtCurrent(node: RaiderNode): boolean {
  return node.parts?.artVersion === RAIDER_ART_VERSION;
}

function makeLeg(
  scene: Phaser.Scene,
  x: number,
  tunic: number,
  boot: number,
  back: boolean,
): Phaser.GameObjects.Container {
  const dim = back ? 0.78 : 1;
  const wrap = scene.add.rectangle(0, 0.2, 3.2, 5.2, shade(tunic, 0.7 * dim));
  wrap.setOrigin(0.5, 0);
  const calf = scene.add.rectangle(0.2, 5.2, 2.6, 5, shade(boot, 1.1 * dim));
  calf.setOrigin(0.5, 0);
  const bootShape = scene.add.ellipse(1.2, 10.8, 5.2, 2.4, shade(boot, dim));
  const sole = scene.add.ellipse(1.8, 11.8, 5.4, 1.5, shade(boot, 0.65 * dim));
  const leg = scene.add.container(x, 0, [wrap, calf, bootShape, sole]);
  if (back) leg.setAlpha(0.85);
  return leg;
}

function makeArm(
  scene: Phaser.Scene,
  x: number,
  skin: number,
  sleeve: number,
  back: boolean,
): Phaser.GameObjects.Container {
  const dim = back ? 0.8 : 1;
  const upper = scene.add.rectangle(0, 0, 2.8, 5, shade(sleeve, dim));
  upper.setOrigin(0.5, 0);
  const forearm = scene.add.rectangle(0.3, 4.4, 2.4, 5.2, shade(skin, dim));
  forearm.setOrigin(0.5, 0);
  const hand = scene.add.circle(0.5, 10.2, 1.6, shade(skin, 0.95 * dim));
  const arm = scene.add.container(x, -10, [upper, forearm, hand]);
  if (back) arm.setAlpha(0.8);
  return arm;
}

function makeBody(
  scene: Phaser.Scene,
  tunic: number,
  sash: number,
): Phaser.GameObjects.Container {
  const hem = scene.add.ellipse(0.4, 0.2, 9.5, 5, shade(tunic, 0.84));
  const torso = scene.add.rectangle(0.3, -7, 7.5, 10, tunic);
  torso.setStrokeStyle(1, shade(tunic, 0.45), 0.55);
  const shoulders = scene.add.ellipse(0.2, -12.2, 9, 4.8, shade(tunic, 1.06));
  const belt = scene.add.rectangle(0.3, -4.2, 8.2, 2, sash);
  const fold = scene.add.rectangle(-1.4, -8.5, 1.2, 7, shade(tunic, 0.78), 0.45);
  return scene.add.container(0, 0, [hem, torso, shoulders, belt, fold]);
}

function makeHead(
  scene: Phaser.Scene,
  skin: number,
  hairColor: number,
): {
  head: Phaser.GameObjects.Container;
  eye: Phaser.GameObjects.Arc;
  pupil: Phaser.GameObjects.Arc;
} {
  const neck = scene.add.rectangle(0, -13.5, 2.8, 3.2, shade(skin, 0.9));
  const ear = scene.add.ellipse(-3.8, -18, 2, 2.6, shade(skin, 0.88));
  const skull = scene.add.circle(0.6, -18.2, 5, skin);
  skull.setStrokeStyle(1, shade(skin, 0.65), 0.3);

  const eyeWhite = scene.add.ellipse(1.6, -18.4, 2.2, 1.9, 0xfff8f0);
  const eye = scene.add.circle(1.8, -18.4, 0.85, 0x2a1c10);
  const pupil = scene.add.circle(2.1, -18.55, 0.35, 0xfff8e8, 0.9);
  const brow = scene.add.ellipse(1.5, -19.7, 2.6, 0.9, shade(hairColor, 0.85), 0.95);
  const nose = scene.add.ellipse(4.0, -17.6, 2.2, 1.8, shade(skin, 0.86));
  const mouth = scene.add.ellipse(1.8, -15.4, 1.8, 0.7, shade(skin, 0.65), 0.8);
  const cheek = scene.add.circle(2.4, -16.4, 1.1, shade(skin, 0.8), 0.28);

  const face = scene.add.container(0, 0, [cheek, eyeWhite, brow, eye, pupil, nose, mouth]);

  const hair = scene.add.circle(-0.4, -20.6, 5.1, hairColor);
  const fringe = scene.add.ellipse(-3.6, -18.5, 2.4, 3.5, hairColor);
  const top = scene.add.ellipse(0, -22.8, 4.5, 2.6, shade(hairColor, 1.08));

  // Ragged cloth hood — reads as raider, not village guard
  const hood = scene.add.ellipse(-0.4, -21.2, 9.2, 6.2, shade(0x3a2818, 0.95), 0.92);
  hood.setStrokeStyle(1, 0x1a120c, 0.4);

  const head = scene.add.container(0, 0, [
    neck,
    ear,
    skull,
    hair,
    fringe,
    top,
    hood,
    face,
  ]);
  return { head, eye, pupil };
}

function makeWeapon(scene: Phaser.Scene, kind: number): Phaser.GameObjects.Container {
  if (kind % 3 === 0) {
    // Crude axe
    const handle = scene.add.rectangle(0, 2, 1.5, 12, 0x4a3020);
    const wrap = scene.add.rectangle(0, -0.5, 2.2, 2, 0x6b4a2a);
    const blade = scene.add.triangle(1.2, -4, 0, 0, 6.5, 2, 0, -4.5, 0x8a8f98);
    blade.setStrokeStyle(1, 0x5a5f68, 0.5);
    return scene.add.container(0, 0, [handle, wrap, blade]);
  }
  if (kind % 3 === 1) {
    // Spear
    const shaft = scene.add.rectangle(0, 1, 1.35, 18, 0x4a3020);
    const wrap = scene.add.rectangle(0, -4.5, 2.1, 2.2, 0x8a3a28);
    const tip = scene.add.triangle(0, -9.5, 0, -5.5, 2.6, 0.5, -2.6, 0.5, 0xb0b6be);
    tip.setStrokeStyle(1, 0x5a5f68, 0.55);
    return scene.add.container(0, 0, [shaft, wrap, tip]);
  }
  // Club
  const handle = scene.add.rectangle(0, 2, 1.6, 11, 0x5a3d22);
  const head = scene.add.ellipse(0.4, -5.5, 5.5, 4.2, 0x6b4a2a);
  head.setStrokeStyle(1, 0x3a2818, 0.55);
  const knot = scene.add.circle(0.6, -5.2, 1.4, shade(0x6b4a2a, 0.75));
  return scene.add.container(0, 0, [handle, head, knot]);
}

export function createRaiderArt(scene: Phaser.Scene, r: Raider): RaiderNode {
  const skin = SKIN[r.id % SKIN.length];
  const hairColor = HAIR[(r.id * 2) % HAIR.length];
  const tunic = TUNIC[r.id % TUNIC.length];
  const sash = SASH[r.id % SASH.length];
  const boot = BOOT[r.id % BOOT.length];
  const sleeve = shade(tunic, 0.88);

  const shadow = scene.add.ellipse(0, 3, 14, 5.5, 0x000000, 0.3);
  const legL = makeLeg(scene, -1.6, tunic, boot, true);
  const legR = makeLeg(scene, 1.8, tunic, boot, false);
  const body = makeBody(scene, tunic, sash);
  const armL = makeArm(scene, -3.2, skin, sleeve, true);
  const armR = makeArm(scene, 3.4, skin, sleeve, false);
  const { head, eye, pupil } = makeHead(scene, skin, hairColor);
  const weapon = makeWeapon(scene, r.id);
  weapon.setPosition(4.5, -8.5);
  weapon.setAngle(-18);

  const baseScale = 1.08 + (r.id % 4) * 0.04;
  const node = scene.add.container(r.x, r.y, [
    shadow,
    legL,
    armL,
    body,
    legR,
    armR,
    head,
    weapon,
  ]) as RaiderNode;

  node.parts = {
    artVersion: RAIDER_ART_VERSION,
    shadow,
    legL,
    legR,
    body,
    armL,
    armR,
    head,
    eye,
    pupil,
    weapon,
    baseScale,
    lastFacing: 1,
    blinkUntil: 0,
  };
  node.setScale(baseScale);
  return node;
}

export function updateRaiderArt(node: RaiderNode, r: Raider): void {
  const parts = node.parts;
  const { legL, legR, armL, armR, head, body, weapon, shadow, baseScale, eye, pupil } =
    parts;

  const walking = r.moving;
  const phase = r.bobPhase;
  const stride = walking ? Math.sin(phase * 1.85) : 0;
  const strideAbs = walking ? Math.abs(Math.sin(phase * 1.85)) : 0;
  const breathe = Math.sin(phase * 0.4) * 0.4;
  const idleSway = !walking ? Math.sin(phase * 0.22) : 0;

  legL.setAngle(-24 * stride);
  legR.setAngle(24 * stride);
  legL.setY(walking ? Math.max(0, -stride) * 1.8 : 0);
  legR.setY(walking ? Math.max(0, stride) * 1.8 : 0);

  if (walking) {
    armL.setAngle(16 * stride);
    armR.setAngle(-16 * stride);
    head.setAngle(stride * 3);
    body.setAngle(stride * 2.5);
    weapon.setAngle(-22 + stride * 8);
  } else {
    armL.setAngle(4 + breathe * 2 + idleSway * 3);
    armR.setAngle(-8 - breathe * 2);
    head.setAngle(idleSway * 4);
    body.setAngle(idleSway * 1.5);
    weapon.setAngle(-28 + idleSway * 3);
  }

  const bob = walking ? strideAbs * 1.7 : 0.35 + breathe * 0.35;
  node.setPosition(r.x, r.y - bob);
  node.setDepth(10_200 + r.y);
  node.setAlpha(r.alpha);

  const shadowSquash = walking ? 1 + strideAbs * 0.14 : 1;
  shadow.setScale(shadowSquash, 1 / Math.max(0.8, shadowSquash));
  shadow.setAlpha((walking ? 0.24 + strideAbs * 0.06 : 0.28) * r.alpha);

  let facing = parts.lastFacing;
  if (Math.abs(r.facingDx) > 0.4) {
    facing = r.facingDx > 0 ? 1 : -1;
    parts.lastFacing = facing;
  }
  node.setScale(baseScale * facing, baseScale);

  const blinkCycle = (phase * 0.08 + r.id * 0.41) % (Math.PI * 2);
  const blinking = blinkCycle > Math.PI * 1.92 || parts.blinkUntil > phase;
  if (blinkCycle > Math.PI * 1.92) parts.blinkUntil = phase + 0.12;
  eye.setScale(1, blinking ? 0.12 : 1);
  pupil.setVisible(!blinking);
}
