import type { PriorityId } from "../sim/types";
import { ResourceIcon } from "./ResourceIcon";

interface Props {
  id: PriorityId;
  size?: number;
  className?: string;
}

const RESOURCE_PRIORITIES = new Set<PriorityId>(["food", "wood", "stone", "metal"]);

/** Compact mark for each work priority (resources reuse ResourceIcon). */
export function PriorityIcon({ id, size = 22, className }: Props) {
  if (RESOURCE_PRIORITIES.has(id)) {
    return <ResourceIcon id={id as "food" | "wood" | "stone" | "metal"} size={size} className={className} />;
  }

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    className,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "construction":
      return (
        <svg {...common}>
          <path d="M3 13.5 L8 3.5 L13 13.5 Z" fill="#c9a227" opacity="0.9" />
          <rect x="7.2" y="8" width="1.6" height="5.5" rx="0.3" fill="#5a3d22" />
          <rect x="4.5" y="11.5" width="7" height="1.4" rx="0.3" fill="#8a6a3a" />
        </svg>
      );
    case "research":
      return (
        <svg {...common}>
          <path
            d="M8 1.5 L9.2 6.2 L14 6.2 L10.2 9 L11.5 13.5 L8 10.8 L4.5 13.5 L5.8 9 L2 6.2 L6.8 6.2 Z"
            fill="#7eb8e8"
          />
          <circle cx="8" cy="8" r="1.3" fill="#f2ebe0" opacity="0.9" />
        </svg>
      );
    case "defence":
      return (
        <svg {...common}>
          <path
            d="M8 1.5 L13.5 4 V8.2 C13.5 11.2 11.2 13.5 8 14.5 C4.8 13.5 2.5 11.2 2.5 8.2 V4 Z"
            fill="#6fa85a"
          />
          <path d="M5.5 8 L7.2 9.7 L10.8 5.8" fill="none" stroke="#f2ebe0" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export const PRIORITY_ACCENT: Record<PriorityId, string> = {
  food: "#d4c05a",
  wood: "#6b8f4e",
  stone: "#8a8f98",
  metal: "#c08a4a",
  construction: "#c9a227",
  research: "#7eb8e8",
  defence: "#6fa85a",
};
