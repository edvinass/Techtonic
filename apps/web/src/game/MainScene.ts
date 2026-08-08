import Phaser from "phaser";
import { BUILDINGS } from "../data/buildings";
import { RESOURCES } from "../data/resources";
import { canPlaceBuilding } from "../sim/engine";
import type { GameState, ResourceId, SeasonId, TerrainId, Tile } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { drawBuildingArt } from "./buildingArt";
import { createCitizenArt, updateCitizenArt, type CitizenNode } from "./citizenArt";
import { stepCitizens, syncCitizens, type Citizen } from "./citizens";
import { gridToScreen, screenToGrid, TILE_HEIGHT, TILE_WIDTH } from "./iso";
import { drawResourceMark } from "./resourceArt";
import { mapTextResolution } from "./textRes";

const TERRAIN_COLORS: Record<TerrainId, number> = {
  grass: 0x5a8f4d,
  forest: 0x2f5a28,
  rock: 0x7a7f88,
  water: 0x2f6a9e,
  sand: 0xc4b07a,
  fertile: 0x6a9a48,
};

const TERRAIN_SIDE: Record<TerrainId, number> = {
  grass: 0x3f6a35,
  forest: 0x1e3e1a,
  rock: 0x555960,
  water: 0x1e4a78,
  sand: 0x9a8a55,
  fertile: 0x4a7a32,
};

const SEASON_GRASS: Record<SeasonId, { top: number; side: number }> = {
  spring: { top: 0x6a9a55, side: 0x4a7a38 },
  summer: { top: 0x5a8f4d, side: 0x3f6a35 },
  autumn: { top: 0x8a8a3a, side: 0x6a6a28 },
  winter: { top: 0x8a9a88, side: 0x6a7a68 },
};

function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function tileElevPx(tile: Tile): number {
  if (tile.terrain === "water") return 0;
  const base =
    tile.terrain === "rock" ? 4 : tile.terrain === "sand" ? 1 : tile.terrain === "forest" ? 2 : 1.5;
  const e = tile.elev ?? base;
  // Stronger extrusion so the island reads as 3D strategy terrain, not flat paper
  return 4 + e * 3.4;
}

interface Floater {
  x: number;
  y: number;
  resource: ResourceId;
  amount: number;
  life: number;
}

export class MainScene extends Phaser.Scene {
  private ambience!: Phaser.GameObjects.Graphics;
  private underlay!: Phaser.GameObjects.Graphics;
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private buildingLayer!: Phaser.GameObjects.Container;
  private citizenLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Graphics;
  private ghostBuilding!: Phaser.GameObjects.Graphics;
  private lastStructureHash = "";
  private floaters: Floater[] = [];
  private centeredOnce = false;
  private citizens: Citizen[] = [];
  private citizenGfx = new Map<number, CitizenNode>();
  private waterPulse = 0;
  private lastMapSig = "";

  private isPanning = false;
  private panMoved = false;
  private spaceDown = false;
  private lastPanX = 0;
  private lastPanY = 0;
  /** Zoom relative to 1 CSS-pixel world unit (camera.zoom = dpr * userZoom). */
  private userZoom = 1.25;

  private panKeys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("main");
  }

  private dpr(): number {
    return (this.game.registry.get("dpr") as number) || 1;
  }

  private applyZoom(userZoom: number) {
    this.userZoom = Phaser.Math.Clamp(userZoom, 0.4, 2.2);
    this.cameras.main.setZoom(this.dpr() * this.userZoom);
  }

  create() {
    this.cameras.main.setBackgroundColor("#0c1410");
    // Keep sub-pixel positions so zoomed vectors stay smooth (not stair-stepped)
    this.cameras.main.setRoundPixels(false);
    this.applyZoom(this.userZoom);

    // Screen-space wash so the map never sits in a dead black void
    this.ambience = this.add.graphics();
    this.ambience.setScrollFactor(0);
    this.ambience.setDepth(-20_000);
    this.drawAmbience();

    this.underlay = this.add.graphics();
    this.underlay.setDepth(-10);
    this.tileGraphics = this.add.graphics();
    this.buildingLayer = this.add.container(0, 0);
    this.citizenLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.ghost = this.add.graphics();
    this.ghost.setDepth(50_000);
    this.ghostBuilding = this.add.graphics();
    this.ghostBuilding.setDepth(50_001);

    this.input.mouse?.disableContextMenu();

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.panKeys = {
        w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      };
      this.panKeys.space.on("down", () => {
        this.spaceDown = true;
      });
      this.panKeys.space.on("up", () => {
        this.spaceDown = false;
      });
    }

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.shouldPan(pointer)) {
        this.isPanning = true;
        this.panMoved = false;
        this.lastPanX = pointer.x;
        this.lastPanY = pointer.y;
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPanning && pointer.isDown) {
        const dx = pointer.x - this.lastPanX;
        const dy = pointer.y - this.lastPanY;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.panMoved = true;
        const zoom = this.cameras.main.zoom;
        this.cameras.main.scrollX -= dx / zoom;
        this.cameras.main.scrollY -= dy / zoom;
        this.lastPanX = pointer.x;
        this.lastPanY = pointer.y;
      }
      this.drawGhost(pointer);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const wasPanning = this.isPanning;
      const moved = this.panMoved;
      this.isPanning = false;
      this.panMoved = false;

      // Don't place if this gesture was a pan, or right/middle button
      if (wasPanning && moved) return;
      if (pointer.rightButtonReleased() || pointer.middleButtonReleased()) return;
      if (this.spaceDown) return;

      const selected = useGameStore.getState().selectedBuilding;
      if (!selected) return;

      const state = useGameStore.getState().state;
      if (!state) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const origin = this.mapOrigin();
      const { x, y } = screenToGrid(world.x - origin.ox, world.y - origin.oy);
      const err = useGameStore.getState().placeAt(x, y);
      if (err) useGameStore.getState().setStatus(err);
    });

    this.input.on("wheel", (_p: unknown, _dx: number, _dy: number, dz: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(cam.centerX, cam.centerY);
      this.applyZoom(this.userZoom * (dz > 0 ? 0.9 : 1.1));
      const after = cam.getWorldPoint(cam.centerX, cam.centerY);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    // Only re-draw structure on resize; do not yank camera back to spawn
    this.scale.on("resize", () => {
      this.lastStructureHash = "";
      this.drawAmbience();
      // Re-apply zoom so DPR × userZoom stays correct after framebuffer resize
      this.applyZoom(this.userZoom);
    });

    const state = useGameStore.getState().state;
    if (state) {
      this.redrawStructure(state);
      this.centerOnSettlement(state);
      this.centeredOnce = true;
    }
  }

  update(_time: number, delta: number) {
    const state = useGameStore.getState().state;
    if (!state) return;

    if (!this.centeredOnce && this.scale.width > 32) {
      this.centerOnSettlement(state);
      this.centeredOnce = true;
      this.lastStructureHash = "";
    }

    this.handleKeyboardPan(delta);
    this.handleEdgePan(delta);
    this.waterPulse += delta;

    const { ox, oy } = this.mapOrigin();
    let forestN = 0;
    let stockBuckets = 0;
    for (const t of state.map.tiles) {
      if (t.terrain === "forest") forestN += 1;
      if (t.deposit) stockBuckets += 1 + Math.floor((t.stock ?? 0) / 12);
    }
    const mapSig = `${forestN}:${stockBuckets}`;
    const structureHash = `${state.age}:${state.pressure.season}:${state.buildings
      .map((b) => `${b.id}:${b.type}:${b.progress.toFixed(2)}:${b.x},${b.y}`)
      .join("|")}:${this.scale.width}:${Math.floor(this.waterPulse / 480)}`;
    if (structureHash !== this.lastStructureHash || mapSig !== this.lastMapSig) {
      this.redrawStructure(state);
      this.lastStructureHash = structureHash;
      this.lastMapSig = mapSig;
    }

    if (!state.paused && state.outcome === "playing") {
      syncCitizens(this.citizens, state, ox, oy);
      stepCitizens(this.citizens, delta, {
        state,
        ox,
        oy,
        onDeposit: (resource, amount, wx, wy) => {
          useGameStore.getState().depositResources(resource, amount);
          this.floaters.push({
            x: wx,
            y: wy - 28,
            resource,
            amount,
            life: 1200,
          });
        },
        onHarvest: (gx, gy, amount) => useGameStore.getState().harvestDeposit(gx, gy, amount),
      });
    }
    this.renderCitizens();
    this.updateFloaters(delta);

    // Clear stale placement ghosts when not building (pointermove alone can leave them)
    if (!useGameStore.getState().selectedBuilding) {
      this.ghost.clear();
      this.ghostBuilding.clear();
    } else if (this.input.activePointer) {
      this.drawGhost(this.input.activePointer);
    }
  }

  private shouldPan(pointer: Phaser.Input.Pointer): boolean {
    if (pointer.middleButtonDown() || pointer.rightButtonDown()) return true;
    if (this.spaceDown) return true;
    // Left-drag pans when not in build mode
    if (pointer.leftButtonDown() && !useGameStore.getState().selectedBuilding) return true;
    return false;
  }

  private handleKeyboardPan(delta: number) {
    if (!this.panKeys) return;
    const speed = (0.45 * delta) / this.cameras.main.zoom;
    let dx = 0;
    let dy = 0;
    if (this.panKeys.a.isDown || this.panKeys.left.isDown) dx -= 1;
    if (this.panKeys.d.isDown || this.panKeys.right.isDown) dx += 1;
    if (this.panKeys.w.isDown || this.panKeys.up.isDown) dy -= 1;
    if (this.panKeys.s.isDown || this.panKeys.down.isDown) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      this.cameras.main.scrollX += (dx / len) * speed;
      this.cameras.main.scrollY += (dy / len) * speed;
    }
  }

  private handleEdgePan(delta: number) {
    const edge = 28;
    const ptr = this.input.activePointer;
    if (!ptr) return;
    const w = this.scale.width;
    const h = this.scale.height;
    if (ptr.x < 0 || ptr.y < 0 || ptr.x > w || ptr.y > h) return;
    const speed = (0.35 * delta) / this.cameras.main.zoom;
    if (ptr.x < edge) this.cameras.main.scrollX -= speed;
    if (ptr.x > w - edge) this.cameras.main.scrollX += speed;
    if (ptr.y < edge) this.cameras.main.scrollY -= speed;
    if (ptr.y > h - edge) this.cameras.main.scrollY += speed;
  }

  private mapOrigin() {
    return {
      ox: this.scale.width / 2,
      oy: Math.max(64, this.scale.height * 0.08),
    };
  }

  private centerOnSettlement(state: GameState) {
    const house = state.buildings.find((b) => b.type === "house") ?? state.buildings[0];
    const gx = house?.x ?? Math.floor(state.map.width / 2);
    const gy = house?.y ?? Math.floor(state.map.height / 2);
    const { sx, sy } = gridToScreen(gx, gy);
    const { ox, oy } = this.mapOrigin();
    this.cameras.main.centerOn(ox + sx, oy + sy);
    this.applyZoom(1.25);
  }

  private drawAmbience() {
    const g = this.ambience;
    if (!g) return;
    g.clear();
    const w = this.scale.width;
    const h = this.scale.height;
    // Deep forest void with warm campfire-ish radial wash
    g.fillStyle(0x0c1410, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0x1a281c, 0.55);
    g.fillEllipse(w * 0.5, h * 0.55, w * 1.15, h * 0.95);
    g.fillStyle(0x2a3a24, 0.22);
    g.fillEllipse(w * 0.48, h * 0.5, w * 0.7, h * 0.55);
    g.fillStyle(0xc9a227, 0.04);
    g.fillEllipse(w * 0.5, h * 0.62, w * 0.35, h * 0.22);
    // Vignette
    g.fillStyle(0x050806, 0.35);
    g.fillRect(0, 0, w, h * 0.12);
    g.fillRect(0, h * 0.88, w, h * 0.12);
  }

  private drawMapUnderlay(state: GameState, ox: number, oy: number) {
    this.underlay.clear();
    const w = state.map.width;
    const h = state.map.height;
    const c = gridToScreen(w / 2, h / 2);
    const span = Math.max(w, h) * TILE_WIDTH * 0.78;
    // Soft mist plate
    this.underlay.fillStyle(0x000000, 0.4);
    this.underlay.fillEllipse(ox + c.sx, oy + c.sy + 36, span * 1.2, span * 0.58);
    this.underlay.fillStyle(0x1e3220, 0.32);
    this.underlay.fillEllipse(ox + c.sx, oy + c.sy + 22, span, span * 0.5);
    this.underlay.fillStyle(0x2a4228, 0.14);
    this.underlay.fillEllipse(ox + c.sx - 20, oy + c.sy + 10, span * 0.55, span * 0.3);

    // Thick earth foundation under the iso diamond — strategy-map “table”
    const hw = (w + h) * (TILE_WIDTH / 4);
    const hh = (w + h) * (TILE_HEIGHT / 4);
    const foundation = 18;
    const top = {
      N: { x: ox + c.sx, y: oy + c.sy - hh + 8 },
      E: { x: ox + c.sx + hw, y: oy + c.sy + 8 },
      S: { x: ox + c.sx, y: oy + c.sy + hh + 8 },
      W: { x: ox + c.sx - hw, y: oy + c.sy + 8 },
    };
    const bot = {
      E: { x: top.E.x, y: top.E.y + foundation },
      S: { x: top.S.x, y: top.S.y + foundation },
      W: { x: top.W.x, y: top.W.y + foundation },
    };
    this.underlay.fillStyle(0x2a1c10, 0.85);
    this.underlay.beginPath();
    this.underlay.moveTo(top.W.x, top.W.y);
    this.underlay.lineTo(top.S.x, top.S.y);
    this.underlay.lineTo(bot.S.x, bot.S.y);
    this.underlay.lineTo(bot.W.x, bot.W.y);
    this.underlay.closePath();
    this.underlay.fillPath();
    this.underlay.fillStyle(0x3a2818, 0.9);
    this.underlay.beginPath();
    this.underlay.moveTo(top.S.x, top.S.y);
    this.underlay.lineTo(top.E.x, top.E.y);
    this.underlay.lineTo(bot.E.x, bot.E.y);
    this.underlay.lineTo(bot.S.x, bot.S.y);
    this.underlay.closePath();
    this.underlay.fillPath();
  }

  private redrawStructure(state: GameState) {
    const { ox, oy } = this.mapOrigin();
    this.tileGraphics.clear();
    this.buildingLayer.removeAll(true);
    this.drawMapUnderlay(state, ox, oy);

    const season = state.pressure.season;
    const shimmer = 0.5 + 0.5 * Math.sin(this.waterPulse * 0.004);

    // Draw back-to-front so south faces of nearer tiles occlude correctly
    const tiles = [...state.map.tiles].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const tile of tiles) {
      const { sx, sy } = gridToScreen(tile.x, tile.y);
      const elev = tileElevPx(tile);
      let color = TERRAIN_COLORS[tile.terrain] ?? TERRAIN_COLORS.grass;
      let side = TERRAIN_SIDE[tile.terrain] ?? TERRAIN_SIDE.grass;

      if (tile.terrain === "grass") {
        color = SEASON_GRASS[season].top;
        side = SEASON_GRASS[season].side;
        if (state.age !== "stone") color = shadeColor(color, 1.08);
      } else if (tile.terrain === "fertile") {
        color = season === "winter" ? 0x7a8a5a : 0x6aaa42;
        side = 0x4a7a30;
      } else if (tile.terrain === "forest") {
        color = season === "autumn" ? 0x6a5a28 : season === "winter" ? 0x4a5a48 : 0x2f5a28;
        side = shadeColor(color, 0.7);
      } else if (tile.terrain === "water") {
        color = shadeColor(0x2f6a9e, 0.92 + shimmer * 0.12);
        side = 0x1e4a78;
      } else if (tile.terrain === "sand") {
        color = season === "winter" ? 0xb8b0a0 : 0xc4b07a;
      }

      // Checker warmth for depth
      if ((tile.x + tile.y) % 2 === 0 && tile.terrain !== "water") {
        color = shadeColor(color, 1.04);
      }

      this.drawIsoTile(this.tileGraphics, ox + sx, oy + sy, color, side, elev, 1, tile.terrain);

      const topY = oy + sy - elev;
      if (tile.terrain === "forest" || tile.deposit === "wood") {
        const stockScale = tile.stock !== undefined ? Math.max(0.35, Math.min(1, tile.stock / 55)) : 1;
        this.drawForestStand(this.tileGraphics, ox + sx, topY, stockScale, season, tile.x * 31 + tile.y);
      } else if (tile.deposit === "stone") {
        drawResourceMark(this.tileGraphics, ox + sx, topY, "stone", 0.95);
      } else if (tile.deposit === "metal") {
        drawResourceMark(this.tileGraphics, ox + sx, topY, "metal", 1);
      } else if (tile.terrain === "grass" && (tile.x + tile.y) % 3 === 0) {
        this.drawGrassTufts(this.tileGraphics, ox + sx, topY, season);
      } else if (tile.terrain === "fertile" && !state.buildings.some((b) => b.x === tile.x && b.y === tile.y)) {
        this.drawFertileTufts(this.tileGraphics, ox + sx, topY);
      }
    }

    const sorted = [...state.buildings].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of sorted) {
      const def = BUILDINGS[b.type];
      const { sx, sy } = gridToScreen(b.x, b.y);
      const tile = state.map.tiles[b.y * state.map.width + b.x];
      const elev = tile ? tileElevPx(tile) : 3;
      const g = this.add.graphics();
      drawBuildingArt(g, b.type, {
        alpha: b.progress < 1 ? 0.7 : 1,
        age: state.age,
        progress: b.progress,
        active: b.progress >= 1 && b.workers > 0,
      });
      if (b.progress >= 1 && def.produces) {
        const res = Object.keys(def.produces)[0] as ResourceId | undefined;
        if (res) drawResourceMark(g, 16, -34, res, 0.45);
      }
      g.setPosition(ox + sx, oy + sy - elev);
      g.setDepth(b.x + b.y + 0.5);
      this.buildingLayer.add(g);
    }
  }

  private drawTree(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    season: SeasonId,
    salt: number,
  ) {
    const s = scale;
    const canopy =
      season === "autumn" ? 0x9a6a2a : season === "winter" ? 0x5a6a58 : 0x2f6a28;
    const canopyLit = shadeColor(canopy, 1.18);
    const canopyDeep = shadeColor(canopy, 0.78);
    g.fillStyle(0x000000, 0.22 * s);
    g.fillEllipse(x, y + 2, 20 * s, 9 * s);
    g.fillStyle(0x5a3d22, 1);
    g.fillRect(x - 1.6 * s, y - 5 * s, 3.2 * s, 9 * s);
    const ox = ((salt * 17) % 5) - 2;
    for (const [dy, hw, col] of [
      [-24, 12, canopyDeep],
      [-17, 11, canopy],
      [-11, 9, canopyLit],
      [-6, 7, canopy],
    ] as const) {
      const d = {
        N: { x: x + ox, y: y + dy * s - hw * 0.5 * s },
        E: { x: x + ox + hw * s, y: y + dy * s },
        S: { x: x + ox, y: y + dy * s + hw * 0.5 * s },
        W: { x: x + ox - hw * s, y: y + dy * s },
      };
      g.fillStyle(col, 1);
      g.beginPath();
      g.moveTo(d.N.x, d.N.y);
      g.lineTo(d.E.x, d.E.y);
      g.lineTo(d.S.x, d.S.y);
      g.lineTo(d.W.x, d.W.y);
      g.closePath();
      g.fillPath();
    }
  }

  /** Dense multi-tree stand so forests read as woodland, not single cones. */
  private drawForestStand(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    season: SeasonId,
    salt: number,
  ) {
    const count = 2 + (salt % 2);
    const offsets =
      count === 3
        ? [
            [-7, 3, 0.72],
            [8, 2, 0.78],
            [0, -2, 1],
          ]
        : [
            [-6, 2, 0.8],
            [5, -1, 1],
          ];
    for (let i = 0; i < offsets.length; i++) {
      const [dx, dy, sc] = offsets[i];
      this.drawTree(g, x + dx, y + dy, scale * sc, season, salt + i * 13);
    }
  }

  private drawGrassTufts(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    season: SeasonId,
  ) {
    const tip =
      season === "autumn" ? 0xa09040 : season === "winter" ? 0x8a9a88 : 0x7aaf55;
    g.fillStyle(tip, 0.75);
    for (const [dx, dy] of [
      [-5, 1],
      [3, -2],
      [6, 2],
      [-1, -3],
    ] as const) {
      g.fillTriangle(x + dx, y + dy - 3.5, x + dx - 1.4, y + dy, x + dx + 1.4, y + dy);
    }
  }

  private drawFertileTufts(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x8fbf4a, 0.9);
    for (const [dx, dy] of [
      [-6, 0],
      [4, -2],
      [2, 3],
      [-2, -3],
      [7, 1],
      [-8, -1],
    ] as const) {
      g.fillTriangle(x + dx, y + dy - 4.5, x + dx - 2, y + dy, x + dx + 2, y + dy);
    }
  }

  private renderCitizens() {
    const live = new Set<number>();
    for (const c of this.citizens) {
      live.add(c.id);
      let node = this.citizenGfx.get(c.id);
      if (!node) {
        node = createCitizenArt(this, c);
        this.citizenGfx.set(c.id, node);
        this.citizenLayer.add(node);
      }
      updateCitizenArt(node, c);
    }

    for (const [id, node] of this.citizenGfx) {
      if (!live.has(id)) {
        node.destroy(true);
        this.citizenGfx.delete(id);
      }
    }
  }

  private updateFloaters(delta: number) {
    this.fxLayer.removeAll(true);
    const next: Floater[] = [];
    for (const f of this.floaters) {
      f.life -= delta;
      f.y -= delta * 0.028;
      if (f.life <= 0) continue;
      next.push(f);
      const visual = RESOURCES[f.resource];
      const mark = this.add.graphics();
      drawResourceMark(mark, f.x - 18, f.y - 4, f.resource, 0.7);
      mark.setAlpha(Math.min(1, f.life / 450));
      mark.setDepth(40_000);
      this.fxLayer.add(mark);

      const label = this.add.text(f.x, f.y, `+${Math.round(f.amount)} ${visual.label}`, {
        fontFamily: "DM Sans, sans-serif",
        fontSize: "12px",
        color: `#${visual.hex}`,
        stroke: "#142017",
        strokeThickness: 3,
        resolution: mapTextResolution(this.dpr(), this.userZoom),
      });
      label.setOrigin(0, 1);
      label.setAlpha(Math.min(1, f.life / 450));
      label.setDepth(40_001);
      this.fxLayer.add(label);
    }
    this.floaters = next;
  }

  private drawGhost(pointer: Phaser.Input.Pointer) {
    const state = useGameStore.getState().state;
    const selected = useGameStore.getState().selectedBuilding;
    this.ghost.clear();
    this.ghostBuilding.clear();
    if (!state || !selected || this.isPanning) return;

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { ox, oy } = this.mapOrigin();
    const { x, y } = screenToGrid(world.x - ox, world.y - oy);
    const { sx, sy } = gridToScreen(x, y);
    const check = canPlaceBuilding(state, selected, x, y);
    const color = check.ok ? 0x8fd18a : 0xd16a6a;
    const tile = state.map.tiles[y * state.map.width + x];
    const elev = tile ? tileElevPx(tile) : 3;
    this.drawIsoTile(this.ghost, ox + sx, oy + sy, color, shadeColor(color, 0.7), elev, 0.4);
    drawBuildingArt(this.ghostBuilding, selected, {
      alpha: 0.55,
      age: state.age,
      progress: 1,
    });
    this.ghostBuilding.setPosition(ox + sx, oy + sy - elev);
  }

  private drawIsoTile(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    fill: number,
    side: number,
    elev: number,
    alpha = 1,
    terrain?: TerrainId,
  ) {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    const topY = cy - elev;
    const N = { x: cx, y: topY - hh };
    const E = { x: cx + hw, y: topY };
    const S = { x: cx, y: topY + hh };
    const W = { x: cx - hw, y: topY };
    const Sb = { x: cx, y: cy + hh };
    const Eb = { x: cx + hw, y: cy };
    const Wb = { x: cx - hw, y: cy };

    if (elev > 0) {
      // Cliff faces with stratified banding for depth
      g.fillStyle(shadeColor(side, 0.78), alpha);
      g.beginPath();
      g.moveTo(W.x, W.y);
      g.lineTo(S.x, S.y);
      g.lineTo(Sb.x, Sb.y);
      g.lineTo(Wb.x, Wb.y);
      g.closePath();
      g.fillPath();

      g.fillStyle(shadeColor(side, 0.95), alpha);
      g.beginPath();
      g.moveTo(S.x, S.y);
      g.lineTo(E.x, E.y);
      g.lineTo(Eb.x, Eb.y);
      g.lineTo(Sb.x, Sb.y);
      g.closePath();
      g.fillPath();

      if (elev > 5) {
        g.lineStyle(1, shadeColor(side, 1.15), 0.25 * alpha);
        const midY = (S.y + Sb.y) * 0.5;
        g.lineBetween(W.x + 2, (W.y + Wb.y) * 0.5, S.x, midY);
        g.lineBetween(S.x, midY, E.x - 2, (E.y + Eb.y) * 0.5);
      }
    }

    g.fillStyle(fill, alpha);
    g.beginPath();
    g.moveTo(N.x, N.y);
    g.lineTo(E.x, E.y);
    g.lineTo(S.x, S.y);
    g.lineTo(W.x, W.y);
    g.closePath();
    g.fillPath();

    // Water highlight stripe + shore foam
    if (terrain === "water") {
      g.fillStyle(0xa8d4f0, 0.14 * alpha);
      g.beginPath();
      g.moveTo(N.x, N.y + 4);
      g.lineTo(E.x - 6, E.y);
      g.lineTo(W.x + 6, W.y);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffffff, 0.08 * alpha);
      g.beginPath();
      g.moveTo(W.x + 8, W.y + 2);
      g.lineTo(S.x, S.y - 2);
      g.lineTo(E.x - 10, E.y + 1);
      g.closePath();
      g.fillPath();
      // Soft foam rim
      g.lineStyle(1.5, 0xd8eef8, 0.28 * alpha);
      g.beginPath();
      g.moveTo(N.x, N.y);
      g.lineTo(E.x, E.y);
      g.lineTo(S.x, S.y);
      g.lineTo(W.x, W.y);
      g.closePath();
      g.strokePath();
    } else {
      g.fillStyle(0xffffff, 0.07 * alpha);
      g.beginPath();
      g.moveTo(N.x, N.y);
      g.lineTo(E.x, E.y);
      g.lineTo(W.x, W.y);
      g.closePath();
      g.fillPath();
    }

    // Terrain micro-detail so the map reads less like flat diamonds
    if (terrain === "grass" || terrain === "fertile") {
      const seed = Math.abs(Math.round(cx * 7 + cy * 13)) % 5;
      g.fillStyle(shadeColor(fill, terrain === "fertile" ? 1.22 : 0.78), 0.55 * alpha);
      for (let i = 0; i < 4; i++) {
        const t = (seed + i * 1.7) / 5;
        const px = cx + Math.cos(t * 6.2) * (hw * 0.32);
        const py = topY + Math.sin(t * 5.1) * (hh * 0.38);
        g.fillTriangle(px, py - 4, px - 1.8, py + 0.6, px + 1.8, py + 0.6);
      }
      // Subtle mottling band
      g.fillStyle(shadeColor(fill, 0.9), 0.18 * alpha);
      g.fillEllipse(cx + 4, topY + 2, 10, 5);
    } else if (terrain === "rock" || terrain === "sand") {
      const speck = terrain === "rock" ? shadeColor(fill, 1.25) : shadeColor(fill, 0.85);
      g.fillStyle(speck, 0.55 * alpha);
      g.fillCircle(cx - 6, topY - 2, 1.8);
      g.fillCircle(cx + 8, topY + 3, 1.4);
      g.fillCircle(cx + 2, topY - 5, 2);
      g.fillCircle(cx - 9, topY + 3, 1.2);
      if (terrain === "rock") {
        g.fillStyle(shadeColor(fill, 0.65), 0.45 * alpha);
        g.fillCircle(cx - 2, topY + 4, 2.8);
        g.fillStyle(shadeColor(fill, 1.15), 0.35 * alpha);
        g.fillTriangle(cx + 4, topY - 6, cx + 10, topY, cx + 2, topY + 1);
      } else {
        // Sand ripples
        g.lineStyle(1, shadeColor(fill, 1.15), 0.35 * alpha);
        g.beginPath();
        g.moveTo(cx - 10, topY);
        g.lineTo(cx - 2, topY - 3);
        g.lineTo(cx + 8, topY + 1);
        g.strokePath();
      }
    } else if (terrain === "forest") {
      g.fillStyle(0x1a3018, 0.4 * alpha);
      g.fillEllipse(cx, topY + 2, 18, 8);
      g.fillStyle(0x243820, 0.25 * alpha);
      g.fillEllipse(cx - 5, topY, 8, 4);
    }

    // Soft rim light on NE edge (strategy-map depth cue)
    if (terrain !== "water") {
      g.lineStyle(1.25, shadeColor(fill, 1.35), 0.22 * alpha);
      g.beginPath();
      g.moveTo(N.x, N.y);
      g.lineTo(E.x, E.y);
      g.strokePath();
    }

    g.lineStyle(1, terrain === "water" ? 0x1a3a58 : 0x1b2618, alpha * 0.5);
    g.beginPath();
    g.moveTo(N.x, N.y);
    g.lineTo(E.x, E.y);
    g.lineTo(S.x, S.y);
    g.lineTo(W.x, W.y);
    g.closePath();
    g.strokePath();
  }
}
