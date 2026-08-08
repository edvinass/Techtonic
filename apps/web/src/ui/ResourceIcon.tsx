import type { ResourceId } from "../sim/types";
import { RESOURCES } from "../data/resources";

interface Props {
  id: ResourceId;
  size?: number;
  className?: string;
}

/** Distinct SVG mark for each resource (color + shape). */
export function ResourceIcon({ id, size = 16, className }: Props) {
  const color = `#${RESOURCES[id].hex}`;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    className,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "food":
      return (
        <svg {...common}>
          <circle cx="5.5" cy="6" r="2.4" fill={color} />
          <circle cx="10.5" cy="5.5" r="2.1" fill={color} opacity="0.9" />
          <circle cx="8" cy="10.5" r="2.6" fill={color} />
          <path d="M8 2.2v2.4" stroke="#5a4a20" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "wood":
      return (
        <svg {...common}>
          <path d="M8 1.5 L12.5 9.5 H3.5 Z" fill={color} />
          <path d="M8 6.5 L11.2 12.5 H4.8 Z" fill={color} opacity="0.85" />
          <rect x="7.2" y="11" width="1.6" height="3.2" rx="0.4" fill="#6b4a2a" />
        </svg>
      );
    case "stone":
      return (
        <svg {...common}>
          <path d="M3 10.5 L5.5 5.5 L9 7 L7.5 12 Z" fill={color} />
          <path d="M8 9.5 L11 5 L14 10.5 L10.5 13 Z" fill={color} opacity="0.85" />
          <circle cx="6" cy="11.5" r="1.3" fill={color} opacity="0.7" />
        </svg>
      );
    case "metal":
      return (
        <svg {...common}>
          <path
            d="M3.5 6.5 L8 3.5 L12.5 6.5 L12.5 10.5 L8 13.5 L3.5 10.5 Z"
            fill={color}
            stroke="#5a3d1c"
            strokeWidth="0.8"
          />
          <path d="M3.5 6.5 L8 9.5 L12.5 6.5" fill="none" stroke="#5a3d1c" strokeWidth="0.7" />
        </svg>
      );
    case "knowledge":
      return (
        <svg {...common}>
          <path
            d="M8 1.5 L9.2 6.2 L14 6.2 L10.2 9 L11.5 13.5 L8 10.8 L4.5 13.5 L5.8 9 L2 6.2 L6.8 6.2 Z"
            fill={color}
          />
          <circle cx="8" cy="8" r="1.4" fill="#f2ebe0" opacity="0.85" />
        </svg>
      );
  }
}
