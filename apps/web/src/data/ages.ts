import type { AgeDef } from "../sim/types";

export const AGES: Record<string, AgeDef> = {
  stone: {
    id: "stone",
    name: "Stone Age",
    next: "farming",
    keyTech: "farming",
    landmark: "granary",
    minPopulation: 12,
    cost: { food: 40, wood: 30, stone: 20 },
  },
  farming: {
    id: "farming",
    name: "Farming Age",
  },
};
