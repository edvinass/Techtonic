import type { ResourceId } from "../sim/types";

export interface ResourceVisual {
  id: ResourceId;
  label: string;
  /** CSS / text hex without # */
  hex: string;
  /** Phaser integer color */
  color: number;
  /** Short glyph used in Phaser text floaters */
  glyph: string;
}

export const RESOURCE_ORDER: ResourceId[] = [
  "food",
  "wood",
  "stone",
  "metal",
  "energy",
  "knowledge",
];

export const RESOURCES: Record<ResourceId, ResourceVisual> = {
  food: {
    id: "food",
    label: "Food",
    hex: "d4c05a",
    color: 0xd4c05a,
    glyph: "◉",
  },
  wood: {
    id: "wood",
    label: "Wood",
    hex: "6b8f4e",
    color: 0x6b8f4e,
    glyph: "▲",
  },
  stone: {
    id: "stone",
    label: "Stone",
    hex: "8a8f98",
    color: 0x8a8f98,
    glyph: "◆",
  },
  metal: {
    id: "metal",
    label: "Metal",
    hex: "c08a4a",
    color: 0xc08a4a,
    glyph: "▬",
  },
  energy: {
    id: "energy",
    label: "Energy",
    hex: "5ec8e8",
    color: 0x5ec8e8,
    glyph: "⚡",
  },
  knowledge: {
    id: "knowledge",
    label: "Knowledge",
    hex: "d4a84b",
    color: 0xd4a84b,
    glyph: "✦",
  },
};

export function resourceCss(id: ResourceId): string {
  return `#${RESOURCES[id].hex}`;
}

export function formatResourceAmount(id: ResourceId, amount: number): string {
  const v = RESOURCES[id];
  return `${v.glyph} +${Math.round(amount)} ${v.label}`;
}
