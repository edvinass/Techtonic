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
          <ellipse cx="8" cy="10" rx="5.5" ry="3.2" fill="#3a6a28" />
          <ellipse cx="8" cy="8.5" rx="4.5" ry="3.5" fill="#4a8f3a" />
          <circle cx="5.5" cy="8" r="1.5" fill={color} />
          <circle cx="9.5" cy="7.2" r="1.35" fill={color} opacity="0.95" />
          <circle cx="8" cy="10.2" r="1.45" fill={color} />
          <circle cx="9.2" cy="6.6" r="0.45" fill="#f0e080" opacity="0.7" />
        </svg>
      );
    case "wood":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="13.5" rx="4" ry="1.4" fill="#0a100c" opacity="0.3" />
          <rect x="7" y="9" width="2" height="4.5" rx="0.4" fill="#6b4a2a" />
          <path d="M8 1.5 L12.8 8.5 H3.2 Z" fill="#2f5a28" />
          <path d="M8 4.5 L11.5 11 H4.5 Z" fill={color} />
          <path d="M8 7 L10.2 12.2 H5.8 Z" fill="#5a9a48" opacity="0.85" />
        </svg>
      );
    case "stone":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="13" rx="5" ry="1.5" fill="#0a100c" opacity="0.28" />
          <path d="M2.5 10.5 L5.2 5.2 L9.2 6.8 L7.5 12.2 Z" fill={color} />
          <path d="M7.5 9.2 L11 4.5 L14.2 10.2 L10.5 13 Z" fill={color} opacity="0.88" />
          <path d="M5.2 5.2 L7 4 L9.2 6.8 L6.5 7.5 Z" fill="#c0c4cc" opacity="0.55" />
          <circle cx="6" cy="11.2" r="1.2" fill={color} opacity="0.7" />
        </svg>
      );
    case "metal":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="13" rx="4.5" ry="1.4" fill="#0a100c" opacity="0.28" />
          <path
            d="M3.5 6.5 L8 3.2 L12.5 6.5 L12.5 10.8 L8 14 L3.5 10.8 Z"
            fill={color}
            stroke="#5a3d1c"
            strokeWidth="0.7"
          />
          <path d="M3.5 6.5 L8 9.5 L12.5 6.5" fill="none" stroke="#5a3d1c" strokeWidth="0.65" />
          <path d="M8 3.2 L8 9.5" fill="none" stroke="#f0d080" strokeWidth="0.5" opacity="0.45" />
        </svg>
      );
    case "energy":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill={color} opacity="0.18" />
          <path
            d="M9.2 1.5 L4.2 8.4 H7.4 L6.2 14.5 L12.2 6.8 H8.8 Z"
            fill={color}
          />
          <path
            d="M9.2 1.5 L7.6 5.2 L10.2 5.2 Z"
            fill="#e8f8ff"
            opacity="0.55"
          />
        </svg>
      );
    case "knowledge":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill={color} opacity="0.2" />
          <path
            d="M8 1.5 L9.2 6.2 L14 6.2 L10.2 9 L11.5 13.5 L8 10.8 L4.5 13.5 L5.8 9 L2 6.2 L6.8 6.2 Z"
            fill={color}
          />
          <circle cx="8" cy="8" r="1.5" fill="#f2ebe0" opacity="0.9" />
          <circle cx="7.5" cy="7.4" r="0.5" fill="#ffffff" opacity="0.7" />
        </svg>
      );
  }
}
