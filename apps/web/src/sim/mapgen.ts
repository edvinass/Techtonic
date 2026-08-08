import type { DepositId, TerrainId, Tile } from "./types";
import { createRng } from "./rng";

/** Default stock for a fresh deposit of each type (sized for ~2h playthroughs). */
export const DEPOSIT_STOCK: Record<DepositId, number> = {
  wood: 95,
  stone: 120,
  metal: 180,
};

/** Gatherable wild-food units on a fresh fertile tile. */
export const FERTILE_STOCK = 70;

/** Cap used for remaining-% display (deposits + fertile forage). */
export function tileStockCap(tile: Tile): number | null {
  if (tile.deposit) return DEPOSIT_STOCK[tile.deposit];
  if (tile.terrain === "fertile") return FERTILE_STOCK;
  return null;
}

/** Remaining gatherable resource as 0–100, or null if the tile has none. */
export function tileRemainingPct(tile: Tile): number | null {
  const cap = tileStockCap(tile);
  if (cap == null) return null;
  const stock = tile.stock ?? cap;
  return Math.max(0, Math.min(100, Math.round((100 * stock) / cap)));
}

function setFertile(tile: Tile, elev?: number): void {
  tile.terrain = "fertile";
  tile.deposit = null;
  tile.stock = FERTILE_STOCK;
  if (elev !== undefined) tile.elev = elev;
}

function hash2(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function idx(x: number, y: number, w: number): number {
  return y * w + x;
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function paintBlob(
  tiles: Tile[],
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  terrain: TerrainId,
  deposit: DepositId | null,
  elev?: number,
): void {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (!inBounds(x, y, w, h)) continue;
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 > r2) continue;
      const t = tiles[idx(x, y, w)];
      if (t.terrain === "water") continue;
      t.terrain = terrain;
      t.deposit = deposit;
      if (deposit) t.stock = DEPOSIT_STOCK[deposit];
      else {
        t.deposit = null;
        t.stock = undefined;
      }
      if (elev !== undefined) t.elev = elev;
    }
  }
}

function carveRiver(
  tiles: Tile[],
  w: number,
  h: number,
  startX: number,
  startY: number,
  rng: () => number,
): void {
  let x = startX;
  let y = startY;
  const steps = Math.floor(w * 0.9);
  for (let i = 0; i < steps; i++) {
    if (!inBounds(x, y, w, h)) break;
    const t = tiles[idx(x, y, w)];
    t.terrain = "water";
    t.deposit = null;
    t.stock = undefined;
    t.elev = 0;
    // Widen occasionally
    if (rng() < 0.35) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny, w, h)) continue;
        const n = tiles[idx(nx, ny, w)];
        if (n.terrain !== "rock") {
          n.terrain = "water";
          n.deposit = null;
          n.stock = undefined;
          n.elev = 0;
        }
      }
    }
    // Prefer downhill / toward border
    const options: [number, number][] = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
    ];
    options.sort(() => rng() - 0.5);
    let moved = false;
    for (const [dx, dy] of options) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, w, h)) continue;
      const cur = tiles[idx(x, y, w)].elev ?? 0;
      const next = tiles[idx(nx, ny, w)].elev ?? 0;
      if (next <= cur + 0.5 || rng() < 0.2) {
        x = nx;
        y = ny;
        moved = true;
        break;
      }
    }
    if (!moved) {
      x += rng() < 0.5 ? 1 : 0;
      y += 1;
    }
  }
}

function ensureDepositNear(
  tiles: Tile[],
  w: number,
  h: number,
  cx: number,
  cy: number,
  ox: number,
  oy: number,
  deposit: DepositId,
  terrain: TerrainId,
): void {
  const x = cx + ox;
  const y = cy + oy;
  if (!inBounds(x, y, w, h)) return;
  const t = tiles[idx(x, y, w)];
  t.terrain = terrain;
  t.deposit = deposit;
  t.stock = DEPOSIT_STOCK[deposit];
  t.elev = Math.max(t.elev ?? 1, deposit === "wood" ? 1 : 2);
}

/**
 * Procedural settlement map: elevation, moisture, rivers, forest clumps,
 * rock veins, beaches, and fertile riverbanks — with finite deposit stocks.
 */
export function generateMap(width: number, height: number, seed: number): Tile[] {
  const rng = createRng(seed);
  const tiles: Tile[] = [];
  const elevSeed = seed + 17;
  const moistSeed = seed + 91;
  const forestSeed = seed + 203;

  // Pass 1: elevation + moisture → base terrain
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      const edge =
        Math.min(x, y, width - 1 - x, height - 1 - y) / Math.min(width, height);
      const elevRaw = fbm(nx * 3.2, ny * 3.2, elevSeed, 5);
      const moist = fbm(nx * 4.1 + 10, ny * 4.1, moistSeed, 4);
      // Soft bowl so coasts sit lower
      const elev = Math.max(0, Math.min(1, elevRaw * 0.85 + edge * 0.35 - 0.08));

      let terrain: TerrainId = "grass";
      let deposit: DepositId | null = null;
      let stock: number | undefined;
      let elevLevel = Math.floor(elev * 4);

      const onBorder = edge < 0.04;
      if (onBorder || elev < 0.18 + (1 - moist) * 0.06) {
        terrain = "water";
        elevLevel = 0;
      } else if (elev > 0.76 && moist < 0.5) {
        terrain = "rock";
        elevLevel = Math.max(2, elevLevel);
        if (rng() < 0.28) {
          deposit = "stone";
          stock = DEPOSIT_STOCK.stone;
        } else if (rng() < 0.12) {
          deposit = "metal";
          stock = DEPOSIT_STOCK.metal;
        }
      } else if (moist > 0.62 && elev < 0.58) {
        // Higher frequency + stricter threshold → smaller, sparser wood patches
        const forestN = fbm(nx * 9, ny * 9, forestSeed);
        if (forestN > 0.55) {
          terrain = "forest";
          deposit = "wood";
          stock = DEPOSIT_STOCK.wood + Math.floor(rng() * 20);
          elevLevel = Math.max(1, elevLevel);
        }
      }

      tiles.push({
        x,
        y,
        terrain,
        deposit,
        stock,
        elev: elevLevel,
      });
    }
  }

  // Pass 2: inland lake (radius scales gently with map size)
  const lakeCx = Math.floor(width * (0.25 + rng() * 0.2));
  const lakeCy = Math.floor(height * (0.2 + rng() * 0.25));
  const lakeR = (Math.min(width, height) / 36) * (2.2 + rng() * 1.4);
  paintBlob(tiles, width, height, lakeCx, lakeCy, lakeR, "water", null, 0);

  // Pass 3: river from high ground toward a border
  let bestX = Math.floor(width / 2);
  let bestY = Math.floor(height / 2);
  let bestElev = -1;
  for (const t of tiles) {
    if ((t.elev ?? 0) > bestElev && t.terrain !== "water") {
      bestElev = t.elev ?? 0;
      bestX = t.x;
      bestY = t.y;
    }
  }
  carveRiver(tiles, width, height, bestX, bestY, rng);

  // Pass 4: beaches + fertile banks within 2 tiles of water (~2× prior fertile area)
  for (const t of tiles) {
    if (t.terrain === "water") continue;
    let waterDist = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (!inBounds(nx, ny, width, height)) continue;
        if (tiles[idx(nx, ny, width)].terrain === "water") {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < waterDist) waterDist = d;
        }
      }
    }
    if (waterDist > 2) continue;
    if (t.terrain === "rock") continue;
    if (t.terrain === "forest") {
      // Keep some riverside woods
      continue;
    }
    // Immediate banks: some sand, mostly fertile. Outer ring: fertile only (no beach).
    if (waterDist === 1 && rng() < 0.2) {
      t.terrain = "sand";
      t.deposit = null;
      t.stock = undefined;
      t.elev = 0;
    } else if (rng() < (waterDist === 1 ? 0.9 : 0.7)) {
      setFertile(t, Math.min(1, t.elev ?? 1));
    }
  }

  // Pass 5: forest clumps + rock veins — count scales with side length (not area)
  // so a 2× map stays sparser rather than 4× denser.
  const forestClumps = Math.max(5, Math.round(5 * (Math.min(width, height) / 36) * 0.75));
  const rockVeins = Math.max(4, Math.round(4 * (Math.min(width, height) / 36) * 0.75));
  for (let i = 0; i < forestClumps; i++) {
    const fx = 3 + Math.floor(rng() * (width - 6));
    const fy = 3 + Math.floor(rng() * (height - 6));
    paintBlob(tiles, width, height, fx, fy, 1.6 + rng() * 1.8, "forest", "wood", 1);
  }
  for (let i = 0; i < rockVeins; i++) {
    const rx = 4 + Math.floor(rng() * (width - 8));
    const ry = 4 + Math.floor(rng() * (height - 8));
    const metal = rng() < 0.55;
    paintBlob(
      tiles,
      width,
      height,
      rx,
      ry,
      1.1 + rng() * 0.8,
      "rock",
      metal ? "metal" : "stone",
      3,
    );
  }

  // Pass 6: clear spawn plateau + guarantee starter deposits
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (!inBounds(cx + dx, cy + dy, width, height)) continue;
      const t = tiles[idx(cx + dx, cy + dy, width)];
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= 2) {
        if (dist === 0) {
          setFertile(t, 1);
        } else {
          t.terrain = "grass";
          t.deposit = null;
          t.stock = undefined;
          t.elev = 1;
        }
      } else if (t.terrain === "water") {
        t.terrain = "sand";
        t.deposit = null;
        t.stock = undefined;
        t.elev = 0;
      }
    }
  }

  // Starter deposits pushed farther out so early gathering needs short trips
  ensureDepositNear(tiles, width, height, cx, cy, 7, 0, "wood", "forest");
  ensureDepositNear(tiles, width, height, cx, cy, 5, -4, "wood", "forest");
  ensureDepositNear(tiles, width, height, cx, cy, 0, 7, "stone", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, -7, 2, "metal", "rock");
  // Extra ore rings — Ascent burns through metal across a long campaign
  ensureDepositNear(tiles, width, height, cx, cy, 12, -9, "metal", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, -11, 11, "metal", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, 14, 7, "metal", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, -13, -6, "metal", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, 16, -14, "metal", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, -16, 4, "metal", "rock");
  ensureDepositNear(tiles, width, height, cx, cy, 9, 12, "stone", "rock");
  // Second wood clump a bit farther — forces expansion
  ensureDepositNear(tiles, width, height, cx, cy, 11, 5, "wood", "forest");


  // Fertile ring for early farms near spawn
  for (const [dx, dy] of [
    [2, 1],
    [1, 2],
    [-1, 2],
    [-2, 0],
  ] as const) {
    if (!inBounds(cx + dx, cy + dy, width, height)) continue;
    const t = tiles[idx(cx + dx, cy + dy, width)];
    if (t.terrain === "water" || t.deposit) continue;
    setFertile(t, 1);
  }

  return tiles;
}
