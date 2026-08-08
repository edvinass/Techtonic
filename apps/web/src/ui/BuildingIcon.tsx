import type { BuildingId } from "../sim/types";
import { BUILDINGS } from "../data/buildings";

interface Props {
  id: BuildingId;
  size?: number;
  className?: string;
}

/** Compact isometric mark for build menus (strategy-game unit card style). */
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
    <ellipse cx="18" cy="31" rx="11" ry="3.5" fill="#0a100c" opacity="0.4" />
  );

  /** Shared iso box: left / right / top faces. */
  const iso = (
    cx: number,
    cy: number,
    hw: number,
    hh: number,
    h: number,
    top: string,
    left = shade(hex, 0.72),
    right = shade(hex, 0.9),
  ) => {
    const N = { x: cx, y: cy - hh - h };
    const E = { x: cx + hw, y: cy - h };
    const S = { x: cx, y: cy + hh - h };
    const W = { x: cx - hw, y: cy - h };
    const Sb = { x: cx, y: cy + hh };
    const Eb = { x: cx + hw, y: cy };
    const Wb = { x: cx - hw, y: cy };
    return (
      <g>
        <path d={`M${W.x} ${W.y} L${S.x} ${S.y} L${Sb.x} ${Sb.y} L${Wb.x} ${Wb.y} Z`} fill={left} />
        <path d={`M${S.x} ${S.y} L${E.x} ${E.y} L${Eb.x} ${Eb.y} L${Sb.x} ${Sb.y} Z`} fill={right} />
        <path d={`M${N.x} ${N.y} L${E.x} ${E.y} L${S.x} ${S.y} L${W.x} ${W.y} Z`} fill={top} />
      </g>
    );
  };

  switch (id) {
    case "house":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 24, 10, 5, 8, hex, "#a07a52", "#c4a070")}
          <path d="M8 16 L18 9 L28 16 L18 21 Z" fill="#6b8f4e" />
          <path d="M8 16 L18 21 L28 16 L18 12 Z" fill="#5a7a40" opacity="0.55" />
          <rect x="16" y="20" width="4" height="6" rx="0.4" fill="#3a2818" />
          <rect x="22" y="17" width="3.5" height="3" rx="0.3" fill="#f0d080" opacity="0.85" />
        </svg>
      );
    case "stockpile":
      return (
        <svg {...common}>
          {ground}
          <ellipse cx="18" cy="26" rx="11" ry="4" fill="#6a5a40" />
          {iso(13, 24, 5, 2.5, 5, "#9a6a3a", "#6a4220", "#8a5a30")}
          {iso(22, 23, 5, 2.5, 6, "#a8adb6", "#6f747c", "#8a8f98")}
          {iso(17, 27, 4.5, 2.2, 4, hex, shade(hex, 0.75), shade(hex, 0.9))}
        </svg>
      );
    case "lumber_camp":
      return (
        <svg {...common}>
          {ground}
          <rect x="9" y="14" width="2.2" height="12" rx="0.4" fill="#6b4a2a" />
          <rect x="24.8" y="14" width="2.2" height="12" rx="0.4" fill="#6b4a2a" />
          <path d="M7 15 L18 8 L29 15 L18 20 Z" fill={hex} />
          <path d="M7 15 L18 20 L29 15 L18 12 Z" fill="#5a7a40" opacity="0.45" />
          {iso(16, 26, 7, 3.2, 4, "#9a6a3a", "#6a4220", "#8a5a30")}
        </svg>
      );
    case "quarry":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 26 L14 15 L22 17 L20 28 Z" fill={hex} />
          <path d="M16 24 L24 13 L30 24 L22 30 Z" fill="#6f747c" />
          <path d="M14 15 L18 12 L22 17 L16 20 Z" fill="#b0b4bc" opacity="0.7" />
          <line x1="10" y1="27" x2="10" y2="11" stroke="#6b4a2a" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="10" y1="11" x2="22" y2="18" stroke="#6b4a2a" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "research_hut":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 27 L18 8 L28 27 Z" fill="#8b6914" />
          <path d="M8 27 L18 8 L18 27 Z" fill="#6a5010" opacity="0.45" />
          <path d="M14 27 L18 16 L22 27 Z" fill="#3a2818" opacity="0.75" />
          <circle cx="18" cy="23" r="2.4" fill="#ff8a3a" />
          <circle cx="18" cy="22.5" r="1.2" fill="#ffd27a" />
        </svg>
      );
    case "farm":
      return (
        <svg {...common}>
          {ground}
          <path d="M6 24 L18 18 L30 24 L18 30 Z" fill="#6b5a32" />
          <path d="M10 23 L12 14 L14 23" fill={hex} />
          <path d="M16 24 L18 13 L20 24" fill={hex} />
          <path d="M22 23 L24 15 L26 23" fill={hex} />
          {iso(14, 20, 5, 2.5, 5, "#b8956a", "#9a7a52", "#c4a574")}
          <path d="M9 15 L14 11 L19 15 L14 18 Z" fill="#8f6a3a" />
        </svg>
      );
    case "granary":
      return (
        <svg {...common}>
          {ground}
          <line x1="10" y1="28" x2="10" y2="20" stroke="#5a3d22" strokeWidth="2" />
          <line x1="26" y1="28" x2="26" y2="20" stroke="#5a3d22" strokeWidth="2" />
          {iso(18, 22, 9, 4.5, 10, hex, shade(hex, 0.75), shade(hex, 0.92))}
          <path d="M9 12 L18 5 L27 12 L18 16 Z" fill="#8f6a3a" />
        </svg>
      );
    case "mine":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 27 L12 16 L24 16 L28 27 Z" fill="#3a3228" />
          <path d="M13 22 L18 14 L23 22 Z" fill="#1a1410" />
          {iso(12, 20, 4.5, 2.2, 5, "#d4a86a", "#a07040", "#c08a4a")}
          <line x1="18" y1="16" x2="18" y2="6" stroke="#5a3d22" strokeWidth="2" />
          <line x1="18" y1="6" x2="26" y2="14" stroke="#5a3d22" strokeWidth="1.5" />
        </svg>
      );
    case "forge":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 24, 10, 5, 8, "#8a5a3a", "#5a3a2a", "#6a4a3a")}
          {iso(16, 16, 6, 3, 7, "#d47a4a", "#9a4a2a", "#b45a3a")}
          <circle cx="16" cy="12" r="2.8" fill="#ff8a3a" />
          <circle cx="16" cy="11.5" r="1.3" fill="#ffd27a" />
          <rect x="24" y="8" width="2.5" height="8" rx="0.4" fill="#4a3020" />
        </svg>
      );
    case "workshop":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 24, 11, 5.5, 10, hex, shade(hex, 0.72), shade(hex, 0.9))}
          <path d="M7 14 L18 7 L29 14 L18 18 Z" fill="#5a4a3a" />
          <rect x="12" y="17" width="4.5" height="4" rx="0.4" fill="#3a4858" />
          <rect x="20" y="17" width="4.5" height="4" rx="0.4" fill="#f0d080" opacity="0.7" />
        </svg>
      );
    case "factory":
      return (
        <svg {...common}>
          {ground}
          {iso(14, 24, 9, 4.5, 10, hex, shade(hex, 0.7), shade(hex, 0.88))}
          {iso(25, 25, 6, 3, 7, "#6a7580", "#3a4550", "#4a5560")}
          <rect x="10" y="6" width="3.5" height="10" rx="0.5" fill="#3a4048" />
          <rect x="17" y="4" width="3.5" height="12" rx="0.5" fill="#3a4048" />
          <circle cx="12" cy="5" r="2.2" fill="#c0c4cc" opacity="0.45" />
          <circle cx="19" cy="3" r="1.8" fill="#c0c4cc" opacity="0.4" />
        </svg>
      );
    case "laboratory":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 24, 9, 4.5, 11, hex, shade(hex, 0.72), shade(hex, 0.9))}
          <rect x="14" y="14" width="8" height="5" rx="0.5" fill="#c8e8f8" opacity="0.85" />
          <circle cx="26" cy="9" r="3.2" fill="#f0e080" opacity="0.9" />
          <circle cx="26" cy="9" r="1.4" fill="#fff8e8" />
        </svg>
      );
    case "reactor":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 27, 9, 4.5, 6, "#3a4a48", "#2a3a38", "#2f403e")}
          <ellipse cx="18" cy="16" rx="9" ry="7" fill={hex} opacity="0.9" />
          <ellipse cx="18" cy="16" rx="5" ry="4" fill="#1a2820" />
          <circle cx="18" cy="16" r="2.2" fill="#a8ffc0" />
          <circle cx="18" cy="15.5" r="1" fill="#e8fff4" />
        </svg>
      );
    case "observatory":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 26, 8, 4, 7, "#5a6aaa", "#2a3a6a", "#3a4a8a")}
          <path d="M9 19 A9 9 0 0 1 27 19 Z" fill={hex} />
          <ellipse cx="18" cy="19" rx="9" ry="3" fill="#2a3a6a" opacity="0.5" />
          <line x1="22" y1="12" x2="29" y2="6" stroke="#c9a227" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "launch_pad":
      return (
        <svg {...common}>
          {ground}
          <path d="M8 27 L18 22 L28 27 L18 32 Z" fill="#a8adb6" />
          <path d="M14 26 L18 6 L22 26 Z" fill={hex} />
          <rect x="16.5" y="12" width="3" height="6" rx="0.3" fill="#4a80c0" />
          <path d="M15 8 L18 3 L21 8 Z" fill="#c94545" />
          <path d="M16 26 L18 31 L20 26 Z" fill="#ff8a3a" opacity="0.8" />
        </svg>
      );
    case "watchtower":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 28, 5, 2.5, 14, "#8a6238", "#5a3d22", "#7a5230")}
          {iso(18, 14, 8, 4, 5, "#9a7a4a", "#5a3d22", "#6b4a2a")}
          <path d="M10 9 L18 4 L26 9 L18 12 Z" fill="#5a3d22" />
          <circle cx="18" cy="3" r="1.8" fill="#c94545" />
        </svg>
      );
    case "palisade":
      return (
        <svg {...common}>
          {ground}
          {[8, 13, 18, 23].map((x, i) => (
            <g key={x}>
              <rect x={x} y={11 + (i % 2)} width="3.2" height={15 - (i % 2)} rx="0.4" fill={i % 2 ? "#7a5230" : hex} />
              <path d={`M${x} ${11 + (i % 2)} L${x + 1.6} ${7 + (i % 2)} L${x + 3.2} ${11 + (i % 2)}`} fill="#5a3d22" />
            </g>
          ))}
        </svg>
      );
    case "storehouse":
      return (
        <svg {...common}>
          {ground}
          {iso(18, 24, 11, 5.5, 9, hex, shade(hex, 0.75), shade(hex, 0.92))}
          <path d="M7 15 L18 7 L29 15 L18 19 Z" fill="#8a6238" />
          <rect x="15.5" y="18" width="5" height="7" rx="0.4" fill="#3a2818" />
        </svg>
      );
    case "grove_sanctuary":
      return (
        <svg {...common}>
          {ground}
          <ellipse cx="18" cy="27" rx="11" ry="4" fill="#2a4a32" />
          <rect x="11" y="18" width="2.5" height="8" rx="0.3" fill="#8a8f98" />
          <rect x="22.5" y="18" width="2.5" height="8" rx="0.3" fill="#8a8f98" />
          <rect x="16.5" y="14" width="3" height="11" rx="0.4" fill="#5a3d22" />
          <circle cx="18" cy="12" r="7.5" fill={hex} />
          <circle cx="15" cy="11" r="4" fill="#6baf6a" opacity="0.7" />
          <circle cx="18" cy="21" r="1.8" fill="#c9a227" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          {ground}
          {iso(18, 24, 9, 4.5, 10, hex, shade(hex, 0.75), shade(hex, 0.9))}
        </svg>
      );
  }
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 0xff) * factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
