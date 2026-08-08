import type { TechDef } from "../sim/types";

export const TECHS: Record<string, TechDef> = {
  fire: {
    id: "fire",
    name: "Fire",
    description: "Cook food more efficiently and unlock research buildings.",
    costKnowledge: 12,
    researchTicks: 20,
    requires: [],
    unlocksBuildings: ["research_hut"],
  },
  primitive_tools: {
    id: "primitive_tools",
    name: "Primitive Tools",
    description: "Better tools unlock quarries and faster gathering.",
    costKnowledge: 18,
    researchTicks: 24,
    requires: ["fire"],
    unlocksBuildings: ["quarry"],
  },
  farming: {
    id: "farming",
    name: "Farming",
    description: "Cultivate the land. Key technology for the Farming Age.",
    costKnowledge: 30,
    researchTicks: 36,
    requires: ["fire"],
    unlocksBuildings: ["farm", "granary"],
  },
};

export const TECH_LIST = Object.values(TECHS);
