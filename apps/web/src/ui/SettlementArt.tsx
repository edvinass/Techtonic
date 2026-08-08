/** Decorative settlement silhouette for auth/menu atmospheres. */
export function SettlementArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 640 280"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a281c" stopOpacity="0" />
          <stop offset="40%" stopColor="#243224" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0e1610" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a5a32" />
          <stop offset="100%" stopColor="#1e3220" />
        </linearGradient>
        <linearGradient id="goldGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9a227" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c9a227" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="roofLeaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fbf6a" />
          <stop offset="100%" stopColor="#5a8a40" />
        </linearGradient>
      </defs>

      <rect width="640" height="280" fill="url(#sky)" />

      {/* Distant hills */}
      <path
        d="M0 170 C80 130 140 140 220 155 C300 170 360 120 440 140 C520 160 580 135 640 150 L640 280 L0 280 Z"
        fill="url(#hill)"
        opacity="0.55"
      />
      <path
        d="M0 200 C100 165 180 185 280 190 C380 195 460 160 540 180 C590 190 620 185 640 190 L640 280 L0 280 Z"
        fill="#2a4228"
        opacity="0.8"
      />

      {/* River */}
      <path
        d="M400 210 C460 198 500 220 560 205 C590 198 620 208 640 202 L640 280 L390 280 Z"
        fill="#2f6a9e"
        opacity="0.4"
      />
      <path
        d="M430 218 C490 208 530 225 580 214"
        fill="none"
        stroke="#8ab8d8"
        strokeOpacity="0.25"
        strokeWidth="3"
      />

      {/* Dense forest left */}
      <g>
        {[
          [40, 198, 16, 26],
          [62, 192, 18, 30],
          [88, 188, 20, 34],
          [112, 195, 15, 26],
          [130, 200, 14, 22],
          [52, 205, 12, 20],
          [100, 208, 13, 18],
        ].map(([cx, cy, rx, ry], i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={i % 2 ? "#2a5a28" : "#356a30"} />
            <rect x={cx - 2} y={cy + ry * 0.55} width="4" height="12" fill="#5a3d22" />
          </g>
        ))}
      </g>

      {/* Forest right ridge */}
      <g opacity="0.85">
        {[
          [520, 188, 14, 24],
          [545, 182, 16, 28],
          [570, 190, 13, 22],
          [595, 185, 15, 26],
        ].map(([cx, cy, rx, ry], i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#2f5a28" />
            <rect x={cx - 1.5} y={cy + ry * 0.5} width="3" height="10" fill="#5a3d22" />
          </g>
        ))}
      </g>

      {/* Campfire glow */}
      <ellipse cx="290" cy="228" rx="55" ry="16" fill="url(#goldGlow)" />

      {/* Palisade ring */}
      <g fill="#6b4a2a">
        {Array.from({ length: 18 }, (_, i) => {
          const x = 150 + i * 12;
          const h = 26 + (i % 3) * 5;
          return (
            <g key={i}>
              <rect x={x} y={228 - h} width="5" height={h} rx="1" />
              <polygon points={`${x},${228 - h} ${x + 2.5},${228 - h - 5} ${x + 5},${228 - h}`} fill="#5a3d22" />
            </g>
          );
        })}
      </g>

      {/* Settlement buildings */}
      <g>
        <path d="M185 228 L185 198 L208 180 L231 198 L231 228 Z" fill="#b8956a" />
        <path d="M185 198 L208 180 L231 198 L208 212 Z" fill="url(#roofLeaf)" />
        <rect x="200" y="208" width="12" height="20" fill="#3a2818" />
        <rect x="214" y="200" width="8" height="6" fill="#f0d080" opacity="0.7" />

        <path d="M240 230 L240 200 L265 180 L290 200 L290 230 Z" fill="#c4a574" />
        <path d="M240 200 L265 180 L290 200 L265 216 Z" fill="#8f6a3a" />
        <rect x="256" y="210" width="14" height="20" fill="#3a2818" />

        <path d="M300 226 L300 196 L320 180 L340 196 L340 226 Z" fill="#b8956a" />
        <path d="M300 196 L320 180 L340 196 L320 208 Z" fill="url(#roofLeaf)" />

        {/* Granary */}
        <ellipse cx="370" cy="222" rx="16" ry="8" fill="#a88440" />
        <rect x="356" y="190" width="28" height="32" rx="3" fill="#e8b86d" />
        <path d="M352 194 L370 172 L388 194 Z" fill="#8a6238" />
      </g>

      {/* Watchtower */}
      <g>
        <rect x="400" y="168" width="20" height="60" fill="#8a6a3a" />
        <path d="M392 168 L410 145 L428 168 Z" fill="#6b4a2a" />
        <rect x="405" y="185" width="10" height="8" fill="#f0d080" opacity="0.8" />
        <rect x="398" y="168" width="24" height="5" fill="#5a3d22" />
      </g>

      {/* Research tent + fire */}
      <path d="M268 232 L292 192 L316 232 Z" fill="#8b6914" />
      <path d="M280 232 L292 208 L304 232 Z" fill="#3a2818" opacity="0.65" />
      <circle cx="292" cy="228" r="6" fill="#e07030" opacity="0.9" />
      <circle cx="292" cy="226" r="3" fill="#ffd27a" />

      {/* Tiny citizens */}
      <g>
        <circle cx="250" cy="236" r="2.2" fill="#e8b890" />
        <rect x="248.5" y="238" width="3" height="5" fill="#6b8f4e" />
        <circle cx="330" cy="238" r="2.2" fill="#d4a574" />
        <rect x="328.5" y="240" width="3" height="5" fill="#8a6238" />
        <circle cx="355" cy="235" r="2" fill="#c68642" />
        <rect x="353.6" y="237" width="2.8" height="4.5" fill="#5a7a8a" />
      </g>

      {/* Smoke */}
      <g fill="#b7c0b0" opacity="0.28">
        <ellipse cx="294" cy="178" rx="5" ry="9" />
        <ellipse cx="302" cy="160" rx="4" ry="8" />
        <ellipse cx="412" cy="138" rx="3.5" ry="7" />
      </g>

      {/* Foreground fringe */}
      <path
        d="M0 245 C50 232 100 250 160 242 C240 230 300 255 380 244 C460 233 540 250 640 242 L640 280 L0 280 Z"
        fill="#152018"
      />
      <g fill="#4a7a38" opacity="0.55">
        {Array.from({ length: 24 }, (_, i) => {
          const x = 12 + i * 27;
          return <polygon key={i} points={`${x},252 ${x + 3},240 ${x + 6},252`} />;
        })}
      </g>
    </svg>
  );
}
