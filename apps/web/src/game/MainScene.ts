import Phaser from "phaser";
import { play } from "../audio/sfx";
import { BUILDINGS } from "../data/buildings";
import { RESOURCES } from "../data/resources";
import { canPlaceBuilding } from "../sim/engine";
import { tileRemainingPct } from "../sim/mapgen";
import type { GameState, ResourceId, SeasonId, TerrainId, Tile } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { drawBuildingArt } from "./buildingArt";
import {
  createCitizenArt,
  isCitizenArtCurrent,
  updateCitizenArt,
  type CitizenNode,
} from "./citizenArt";
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

/** Labels for hover hints; null means skip (plain grass is noise). */
const TERRAIN_HINT: Record<TerrainId, string | null> = {
  grass: null,
  forest: "Forest",
  rock: "Rock",
  water: "Water",
  sand: "Sand",
  fertile: "Fertile land",
};

/** Dwell time before a map object hint appears. */
const HOVER_HINT_DELAY_MS = 1200;

function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function lerpColor(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
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

  private hoverHint!: Phaser.GameObjects.Text;
  private hoverTargetKey = "";
  private hoverTargetLabel = "";
  private hoverAccum = 0;
  private hoverPtrX = 0;
  private hoverPtrY = 0;

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

    this.hoverHint = this.add.text(0, 0, "", {
      fontFamily: "DM Sans, sans-serif",
      fontSize: "13px",
      color: "#e8f0e4",
      backgroundColor: "#142017",
      padding: { x: 8, y: 5 },
      stroke: "#0a120c",
      strokeThickness: 2,
      resolution: mapTextResolution(this.dpr(), this.userZoom),
    });
    this.hoverHint.setScrollFactor(0);
    this.hoverHint.setDepth(60_000);
    this.hoverHint.setOrigin(0, 1);
    this.hoverHint.setVisible(false);
    this.hoverHint.setAlpha(0.94);

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
        const state = useGameStore.getState().state;
        if (state) this.clampCameraToMap(state);
      }
      this.drawGhost(pointer);
      this.trackHover(pointer);
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
      const state = useGameStore.getState().state;
      if (state) this.clampCameraToMap(state);
    });

    // Only re-draw structure on resize; do not yank camera back to spawn
    this.scale.on("resize", () => {
      this.lastStructureHash = "";
      this.drawAmbience();
      // Re-apply zoom so DPR × userZoom stays correct after framebuffer resize
      this.applyZoom(this.userZoom);
      const state = useGameStore.getState().state;
      if (state) this.clampCameraToMap(state);
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
    this.clampCameraToMap(state);
    this.tickHover(delta);
    this.waterPulse += delta;

    const { ox, oy } = this.mapOrigin();
    let forestN = 0;
    let stockBuckets = 0;
    for (const t of state.map.tiles) {
      if (t.terrain === "forest") forestN += 1;
      if (t.deposit || t.terrain === "fertile") {
        // Bucket by remaining % so visuals refresh as tiles deplete
        const pct = tileRemainingPct(t) ?? 0;
        stockBuckets += 1 + Math.floor(pct / 10);
      }
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
          play("deposit");
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

  private resolveHoverTarget(
    state: GameState,
    gx: number,
    gy: number,
  ): { key: string; label: string } | null {
    if (gx < 0 || gy < 0 || gx >= state.map.width || gy >= state.map.height) return null;

    const building = state.buildings.find((b) => b.x === gx && b.y === gy);
    if (building) {
      const name = BUILDINGS[building.type]?.name ?? building.type;
      const label = building.progress < 1 ? `${name} (building…)` : name;
      return { key: `b:${building.id}`, label };
    }

    const tile = state.map.tiles[gy * state.map.width + gx];
    if (!tile) return null;

    if (tile.deposit) {
      const name = RESOURCES[tile.deposit].label;
      const pct = tileRemainingPct(tile);
      const label =
        pct == null || pct <= 0
          ? `${name} deposit (depleted)`
          : `${name} deposit · ${pct}%`;
      return { key: `d:${gx},${gy}:${tile.deposit}:${pct ?? 0}`, label };
    }

    const terrainLabel = TERRAIN_HINT[tile.terrain];
    if (!terrainLabel) return null;
    const pct = tileRemainingPct(tile);
    const label =
      pct != null ? `${terrainLabel} · ${pct}%` : terrainLabel;
    return { key: `t:${gx},${gy}:${tile.terrain}:${pct ?? "x"}`, label };
  }

  private clearHover() {
    this.hoverTargetKey = "";
    this.hoverTargetLabel = "";
    this.hoverAccum = 0;
    this.hoverHint.setVisible(false);
  }

  private trackHover(pointer: Phaser.Input.Pointer) {
    this.hoverPtrX = pointer.x;
    this.hoverPtrY = pointer.y;

    if (this.isPanning || useGameStore.getState().selectedBuilding) {
      this.clearHover();
      return;
    }

    const state = useGameStore.getState().state;
    if (!state) {
      this.clearHover();
      return;
    }

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { ox, oy } = this.mapOrigin();
    const { x, y } = screenToGrid(world.x - ox, world.y - oy);
    const target = this.resolveHoverTarget(state, x, y);

    if (!target) {
      this.clearHover();
      return;
    }

    if (target.key !== this.hoverTargetKey) {
      this.hoverTargetKey = target.key;
      this.hoverTargetLabel = target.label;
      this.hoverAccum = 0;
      this.hoverHint.setVisible(false);
    } else {
      this.hoverTargetLabel = target.label;
      if (this.hoverHint.visible) {
        if (this.hoverHint.text !== target.label) this.hoverHint.setText(target.label);
        this.placeHoverHint();
      }
    }
  }

  private tickHover(delta: number) {
    const ptr = this.input.activePointer;
    if (ptr) this.trackHover(ptr);

    if (!this.hoverTargetKey || !this.hoverTargetLabel) return;
    if (this.isPanning || useGameStore.getState().selectedBuilding) {
      this.clearHover();
      return;
    }

    this.hoverAccum += delta;
    if (this.hoverAccum < HOVER_HINT_DELAY_MS) return;

    if (!this.hoverHint.visible || this.hoverHint.text !== this.hoverTargetLabel) {
      this.hoverHint.setText(this.hoverTargetLabel);
      this.hoverHint.setResolution(mapTextResolution(this.dpr(), this.userZoom));
      this.hoverHint.setVisible(true);
    }
    this.placeHoverHint();
  }

  private placeHoverHint() {
    const pad = 12;
    const w = this.scale.width;
    const h = this.scale.height;
    const tw = this.hoverHint.width;
    const th = this.hoverHint.height;
    let x = this.hoverPtrX + 14;
    let y = this.hoverPtrY - 10;
    if (x + tw > w - pad) x = this.hoverPtrX - tw - 10;
    if (y - th < pad) y = this.hoverPtrY + th + 18;
    if (y > h - pad) y = h - pad;
    if (x < pad) x = pad;
    this.hoverHint.setPosition(x, y);
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

  /** Keep the camera centered over the map diamond — no infinite void scrolling. */
  private clampCameraToMap(state: GameState) {
    const cam = this.cameras.main;
    const { ox, oy } = this.mapOrigin();
    const mw = state.map.width;
    const mh = state.map.height;
    const corners = [
      gridToScreen(0, 0),
      gridToScreen(mw, 0),
      gridToScreen(0, mh),
      gridToScreen(mw, mh),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const { sx, sy } of corners) {
      minX = Math.min(minX, ox + sx);
      maxX = Math.max(maxX, ox + sx);
      minY = Math.min(minY, oy + sy);
      maxY = Math.max(maxY, oy + sy);
    }
    // Slack for tile sides / underlay so the rim can still reach mid-screen
    const padX = TILE_WIDTH * 0.5;
    const padY = TILE_HEIGHT * 2;
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY + 24;

    // Derive center from scroll — midPoint is only refreshed in preRender, so using
    // it here would undo pans applied earlier in the same frame / pointer event.
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width * 0.5, minX, maxX);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height * 0.5, minY, maxY);
    cam.centerOn(cx, cy);
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
    this.clampCameraToMap(state);
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

      const remainPct = tileRemainingPct(tile);
      const remain = remainPct == null ? 1 : remainPct / 100;

      if (tile.terrain === "grass") {
        color = SEASON_GRASS[season].top;
        side = SEASON_GRASS[season].side;
        if (state.age !== "stone") color = shadeColor(color, 1.08);
      } else if (tile.terrain === "fertile") {
        // Rich green when full → dull straw as forage is stripped
        const lush = season === "winter" ? 0x7a8a5a : 0x6aaa42;
        const spent = season === "winter" ? 0x8a8470 : 0x9a8a4a;
        color = lerpColor(lush, spent, 1 - remain);
        side = shadeColor(color, 0.72);
      } else if (tile.terrain === "forest") {
        const lush = season === "autumn" ? 0x6a5a28 : season === "winter" ? 0x4a5a48 : 0x2f5a28;
        const spent = season === "winter" ? 0x6a6a58 : 0x5a4a28;
        color = lerpColor(lush, spent, 1 - remain);
        side = shadeColor(color, 0.7);
      } else if (tile.terrain === "water") {
        color = shadeColor(0x2f6a9e, 0.92 + shimmer * 0.12);
        side = 0x1e4a78;
      } else if (tile.terrain === "sand") {
        color = season === "winter" ? 0xb8b0a0 : 0xc4b07a;
      } else if (tile.terrain === "rock") {
        // Cooler slate for stone veins; warmer brown-grey under metal ore
        if (tile.deposit === "metal") {
          color = shadeColor(0x6a655c, 0.96 + remain * 0.06);
          side = shadeColor(0x4a463e, 0.95);
        } else if (tile.deposit === "stone") {
          color = shadeColor(0x727880, 0.97 + remain * 0.05);
          side = shadeColor(0x4e545c, 0.95);
        }
      }

      // Checker warmth for depth
      if ((tile.x + tile.y) % 2 === 0 && tile.terrain !== "water") {
        color = shadeColor(color, 1.04);
      }

      this.drawIsoTile(this.tileGraphics, ox + sx, oy + sy, color, side, elev, 1, tile.terrain);

      const topY = oy + sy - elev;
      const salt = tile.x * 31 + tile.y * 17;
      if (tile.terrain === "forest" || tile.deposit === "wood") {
        this.drawForestStand(
          this.tileGraphics,
          ox + sx,
          topY,
          remain,
          season,
          salt,
        );
      } else if (tile.deposit === "stone") {
        drawResourceMark(this.tileGraphics, ox + sx, topY, "stone", 0.72 + 0.38 * remain, salt);
      } else if (tile.deposit === "metal") {
        drawResourceMark(this.tileGraphics, ox + sx, topY, "metal", 0.7 + 0.4 * remain, salt);
      } else if (tile.terrain === "grass" && (tile.x + tile.y) % 3 === 0) {
        this.drawGrassTufts(this.tileGraphics, ox + sx, topY, season);
      } else if (tile.terrain === "fertile" && !state.buildings.some((b) => b.x === tile.x && b.y === tile.y)) {
        this.drawFertileTufts(this.tileGraphics, ox + sx, topY, remain, salt);
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
    remain = 1,
  ) {
    const s = scale;
    // Low remaining → brown/sparse “depleted” canopy instead of lush green
    const lush =
      season === "autumn" ? 0x9a6a2a : season === "winter" ? 0x5a6a58 : 0x2f6a28;
    const spent = season === "winter" ? 0x6a6558 : 0x6a5a28;
    const canopy = lerpColor(spent, lush, remain);
    const canopyLit = shadeColor(canopy, 1.18);
    const canopyDeep = shadeColor(canopy, 0.78);
    g.fillStyle(0x000000, 0.22 * s);
    g.fillEllipse(x, y + 2, 20 * s, 9 * s);
    g.fillStyle(0x5a3d22, 1);
    g.fillRect(x - 1.6 * s, y - 5 * s, 3.2 * s, 9 * s);

    if (remain < 0.28) {
      // Stump / bare trunk — stand has been stripped
      g.fillStyle(0x4a3220, 1);
      g.fillEllipse(x, y - 1 * s, 7 * s, 3.2 * s);
      g.fillStyle(0x6a4a28, 1);
      g.fillRect(x - 2 * s, y - 6 * s, 4 * s, 5 * s);
      return;
    }

    const ox = ((salt * 17) % 5) - 2;
    const layers =
      remain < 0.5
        ? ([
            [-14, 8, canopyDeep],
            [-8, 6, canopy],
          ] as const)
        : ([
            [-24, 12, canopyDeep],
            [-17, 11, canopy],
            [-11, 9, canopyLit],
            [-6, 7, canopy],
          ] as const);
    for (const [dy, hw, col] of layers) {
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

  /** Dense multi-tree stand; thins to stumps as wood stock falls. */
  private drawForestStand(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    remain: number,
    season: SeasonId,
    salt: number,
  ) {
    const scale = Math.max(0.4, Math.min(1, 0.35 + remain * 0.65));
    const count = remain < 0.35 ? 1 : remain < 0.65 ? 2 : 2 + (salt % 2);
    const layout = salt % 3;
    const offsets =
      count === 1
        ? ([[(salt % 5) - 2, ((salt * 3) % 3) - 1, 0.92 + (salt % 3) * 0.04]] as const)
        : count === 2
          ? layout === 0
            ? ([
                [-6, 2, 0.8],
                [5, -1, 1],
              ] as const)
            : layout === 1
              ? ([
                  [-4, -1, 0.9],
                  [7, 2, 0.78],
                ] as const)
              : ([
                  [-7, 1, 0.75],
                  [3, 2, 0.95],
                ] as const)
          : layout === 0
            ? ([
                [-7, 3, 0.72],
                [8, 2, 0.78],
                [0, -2, 1],
              ] as const)
            : layout === 1
              ? ([
                  [-8, 1, 0.7],
                  [6, -2, 0.85],
                  [2, 3, 0.95],
                ] as const)
              : ([
                  [-5, -2, 0.8],
                  [9, 1, 0.72],
                  [-1, 2, 1],
                ] as const);
    for (let i = 0; i < offsets.length; i++) {
      const [dx, dy, sc] = offsets[i];
      this.drawTree(g, x + dx, y + dy, scale * sc, season, salt + i * 13, remain);
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

  private drawFertileTufts(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    remain = 1,
    salt = 0,
  ) {
    const tip = shadeColor(lerpColor(0xb0a050, 0x8fbf4a, remain), 0.94 + (salt % 5) * 0.03);
    g.fillStyle(tip, 0.55 + 0.35 * remain);
    const layouts = [
      [
        [-6, 0],
        [4, -2],
        [2, 3],
        [-2, -3],
        [7, 1],
        [-8, -1],
      ],
      [
        [-4, 2],
        [6, 0],
        [-1, -2],
        [3, 3],
        [-7, -1],
        [8, -2],
      ],
      [
        [-5, -1],
        [5, 2],
        [0, 1],
        [-8, 2],
        [7, -2],
        [2, -3],
      ],
    ] as const;
    const all = layouts[salt % layouts.length];
    const n = remain < 0.25 ? 2 : remain < 0.55 ? 3 : all.length;
    const start = salt % Math.max(1, all.length - n + 1);
    for (let i = 0; i < n; i++) {
      const [dx, dy] = all[(start + i) % all.length];
      const h = 2.2 + 2 * remain + ((salt + i * 7) % 3) * 0.35;
      const w = 1.7 + ((salt + i * 5) % 3) * 0.25;
      g.fillTriangle(x + dx, y + dy - h, x + dx - w, y + dy, x + dx + w, y + dy);
    }
  }

  private renderCitizens() {
    const live = new Set<number>();
    for (const c of this.citizens) {
      live.add(c.id);
      let node = this.citizenGfx.get(c.id);
      if (node && !isCitizenArtCurrent(node)) {
        node.destroy(true);
        this.citizenGfx.delete(c.id);
        node = undefined;
      }
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
      if (terrain === "rock") {
        const seed = Math.abs(Math.round(cx * 11 + cy * 19)) % 7;
        // Fractured slab patches on the tile face
        g.fillStyle(shadeColor(fill, 0.72), 0.4 * alpha);
        g.fillTriangle(
          cx - 10 + (seed % 3),
          topY + 1,
          cx - 2,
          topY - 5,
          cx + 4,
          topY + 4,
        );
        g.fillStyle(shadeColor(fill, 1.22), 0.38 * alpha);
        g.fillTriangle(
          cx + 2,
          topY - 6,
          cx + 11,
          topY,
          cx + 3,
          topY + 3,
        );
        g.fillStyle(shadeColor(fill, 0.88), 0.35 * alpha);
        g.fillTriangle(
          cx - 4,
          topY + 5,
          cx + 6,
          topY + 3,
          cx + 1,
          topY - 1,
        );
        // Crack lines across the crown
        g.lineStyle(1, shadeColor(fill, 0.55), 0.4 * alpha);
        g.lineBetween(cx - 8, topY - 1, cx + 3, topY + 4);
        g.lineBetween(cx - 1, topY - 5, cx + 8, topY + 1);
        if (seed % 2 === 0) {
          g.lineBetween(cx - 5, topY + 3, cx + 6, topY - 2);
        }
        // Speckle grit
        g.fillStyle(shadeColor(fill, 1.3), 0.5 * alpha);
        g.fillCircle(cx - 6, topY - 2, 1.6);
        g.fillCircle(cx + 8, topY + 3, 1.3);
        g.fillCircle(cx + 1, topY - 4, 1.8);
        g.fillStyle(shadeColor(fill, 0.6), 0.4 * alpha);
        g.fillCircle(cx - 2, topY + 4, 2.4);
      } else {
        const speck = shadeColor(fill, 0.85);
        g.fillStyle(speck, 0.55 * alpha);
        g.fillCircle(cx - 6, topY - 2, 1.8);
        g.fillCircle(cx + 8, topY + 3, 1.4);
        g.fillCircle(cx + 2, topY - 5, 2);
        g.fillCircle(cx - 9, topY + 3, 1.2);
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
