import type { BuildingId } from "../sim/types";
import { BUILDINGS } from "../data/buildings";

interface Props {
  id: BuildingId;
  size?: number;
  className?: string;
}

/** Compact isometric-ish mark for build menus (strategy-game unit card style). */
export function BuildingIcon({ id, size = 36, className }: Props) {
  const hex = `#${(BUILDINGS[id]?.color ?? 0xc4a574).toString(16).padStart(6, "0")}`;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 36 36",
    className,
    "aria-hidden": true as const,
  };

  const ground = (
    <ellipse cx="18" cy="30" rx="12" ry="4" fill="#0a100c" opacity="0.35" />
  );

  switch (id) {
    case "house":
      return (
        <svg {...common}>
          {ground}
          <path d="M10 26 L10 16 L18 10 L26 16 L26 26 Z" fill={hex} />
          <path d="M10 16 L18 10 L26 16 L18 20 Z" fill="#6b8f4e" />
          <rect x="15.5" y="20" width="5" height="6" rx="0.5" fill="#3a2818" />
        </svg>
      );
    case "stockpile":
      return (
        <svg {...common}>
          {ground}
          <ellipse cx="18" cy="26" rx="11" ry="4" fill="#6a5a40" />
          <rect x="9" y="18" width="7" height="6" rx="1" fill="#7a5230" />
          <rect x="18" y="17" width="7" height="7" rx="1" fill="#8a8f98" />
          <rect x="13" y="22" width="6" height="4" rx="1" fill={hex} />
          <rect x="10" y="14" width="1.5" height="8" fill="#5a3d22" />
          <rect x="24" y="14" width="1.5" height="8" fill="#5a3d22" />
        </svg>
      );
    case "lumber_camp":
      return (
        <svg {...common}>
          {ground}
          <rect x="9" y="14" width="2.5" height="12" fill="#6b4a2a" />
          <rect x="24.5" y="14" width="2.5" height="12" fill="#6b4a2a" />
          <path d="M7 14 L18 8 L29 14 L18 18 Z" fill={hex} />
          <rect x="12" y="22" width="10" height="4" rx="1" fill="#7a5230" />
        </svg>
      );
    case "quarry":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 24 L14 14 L22 16 L20 26 Z" fill={hex} />
          <path d="M16 22 L24 12 L30 22 L22 28 Z" fill="#6f747c" />
          <line x1="10" y1="26" x2="10" y2="12" stroke="#6b4a2a" strokeWidth="2" />
          <line x1="10" y1="12" x2="22" y2="18" stroke="#6b4a2a" strokeWidth="1.5" />
        </svg>
      );
    case "research_hut":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 26 L18 8 L28 26 Z" fill="#8b6914" />
          <path d="M14 26 L18 16 L22 26 Z" fill="#3a2818" opacity="0.7" />
          <circle cx="18" cy="22" r="2.2" fill="#e8a040" />
        </svg>
      );
    case "farm":
      return (
        <svg {...common}>
          {ground}
          <path d="M6 24 L18 18 L30 24 L18 30 Z" fill="#5a8f4d" />
          <path d="M10 22 L12 14 L14 22" fill={hex} />
          <path d="M16 23 L18 13 L20 23" fill={hex} />
          <path d="M22 22 L24 15 L26 22" fill={hex} />
        </svg>
      );
    case "granary":
      return (
        <svg {...common}>
          {ground}
          <ellipse cx="18" cy="24" rx="9" ry="5" fill="#a88440" />
          <rect x="10" y="12" width="16" height="12" rx="2" fill={hex} />
          <path d="M8 14 L18 6 L28 14 Z" fill="#8a6238" />
        </svg>
      );
    case "mine":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 26 L12 16 L24 16 L28 26 Z" fill="#4a4e56" />
          <path d="M12 16 L18 10 L24 16 Z" fill={hex} />
          <circle cx="18" cy="20" r="2.5" fill="#c08a4a" />
        </svg>
      );
    case "forge":
      return (
        <svg {...common}>
          {ground}
          <rect x="9" y="14" width="18" height="12" rx="1" fill="#6a4a3a" />
          <path d="M12 14 L18 8 L24 14 Z" fill={hex} />
          <rect x="15" y="18" width="6" height="8" fill="#2a1810" />
          <circle cx="18" cy="20" r="2" fill="#ff8a3a" />
        </svg>
      );
    case "workshop":
      return (
        <svg {...common}>
          {ground}
          <rect x="8" y="14" width="20" height="12" fill={hex} />
          <path d="M7 14 L18 7 L29 14 Z" fill="#5a4a3a" />
          <rect x="12" y="18" width="5" height="5" fill="#3a4858" />
          <rect x="20" y="18" width="5" height="5" fill="#3a4858" />
        </svg>
      );
    case "factory":
      return (
        <svg {...common}>
          {ground}
          <rect x="6" y="16" width="24" height="10" fill={hex} />
          <rect x="10" y="8" width="4" height="8" fill="#4a5058" />
          <rect x="18" y="6" width="4" height="10" fill="#4a5058" />
          <rect x="26" y="10" width="3" height="6" fill="#4a5058" />
          <circle cx="12" cy="7" r="2" fill="#8a9098" opacity="0.7" />
        </svg>
      );
    case "laboratory":
      return (
        <svg {...common}>
          {ground}
          <rect x="10" y="12" width="16" height="14" fill={hex} />
          <rect x="13" y="16" width="4" height="5" fill="#c8e8f8" opacity="0.8" />
          <rect x="19" y="16" width="4" height="5" fill="#c8e8f8" opacity="0.8" />
          <circle cx="26" cy="10" r="3" fill="#f0e080" opacity="0.85" />
        </svg>
      );
    case "reactor":
      return (
        <svg {...common}>
          {ground}
          <ellipse cx="18" cy="22" rx="10" ry="6" fill="#2a3a30" />
          <circle cx="18" cy="16" r="8" fill={hex} opacity="0.9" />
          <circle cx="18" cy="16" r="4" fill="#1a2820" />
          <circle cx="18" cy="16" r="2" fill="#a8ffc0" />
        </svg>
      );
    case "observatory":
      return (
        <svg {...common}>
          {ground}
          <rect x="11" y="18" width="14" height="8" fill="#4a3a2a" />
          <path d="M10 18 A8 8 0 0 1 26 18 Z" fill={hex} />
          <line x1="22" y1="10" x2="28" y2="6" stroke="#c9a227" strokeWidth="1.5" />
        </svg>
      );
    case "launch_pad":
      return (
        <svg {...common}>
          {ground}
          <rect x="8" y="24" width="20" height="4" rx="1" fill="#6a7078" />
          <path d="M14 24 L18 6 L22 24 Z" fill={hex} />
          <rect x="16.5" y="12" width="3" height="6" fill="#4a80c0" />
          <circle cx="18" cy="8" r="1.5" fill="#e07040" />
        </svg>
      );
    case "watchtower":
      return (
        <svg {...common}>
          {ground}
          <rect x="14" y="12" width="8" height="14" fill={hex} />
          <path d="M12 12 L18 6 L24 12 Z" fill="#6b4a2a" />
          <rect x="16" y="16" width="4" height="3" fill="#f0d080" opacity="0.7" />
        </svg>
      );
    case "palisade":
      return (
        <svg {...common}>
          {ground}
          <rect x="8" y="14" width="3" height="12" fill={hex} />
          <rect x="13" y="12" width="3" height="14" fill="#7a5230" />
          <rect x="18" y="13" width="3" height="13" fill={hex} />
          <rect x="23" y="11" width="3" height="15" fill="#7a5230" />
          <path d="M8 14 L11 10 L11 14" fill="#5a3d22" />
          <path d="M23 11 L26 7 L26 11" fill="#5a3d22" />
        </svg>
      );
    case "storehouse":
      return (
        <svg {...common}>
          {ground}
          <rect x="8" y="14" width="20" height="12" fill={hex} />
          <path d="M7 14 L18 7 L29 14 Z" fill="#8a6238" />
          <rect x="15" y="18" width="6" height="8" fill="#3a2818" />
        </svg>
      );
    case "grove_sanctuary":
      return (
        <svg {...common}>
          {ground}
          <ellipse cx="18" cy="26" rx="11" ry="4" fill="#2a4a32" />
          <rect x="11" y="18" width="2.5" height="8" fill="#8a8f98" />
          <rect x="22.5" y="18" width="2.5" height="8" fill="#8a8f98" />
          <rect x="16.5" y="14" width="3" height="10" fill="#5a3d22" />
          <circle cx="18" cy="12" r="7" fill={hex} />
          <circle cx="18" cy="20" r="1.8" fill="#c9a227" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          {ground}
          <rect x="10" y="12" width="16" height="14" fill={hex} />
        </svg>
      );
  }
}
