import Phaser from "phaser";
import { BUILDINGS } from "../data/buildings";
import { RESOURCES } from "../data/resources";
import { canPlaceBuilding } from "../sim/engine";
import type { GameState, ResourceId, TerrainId } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { drawBuildingArt } from "./buildingArt";
import { createCitizenArt, updateCitizenArt, type CitizenNode } from "./citizenArt";
import { stepCitizens, syncCitizens, type Citizen } from "./citizens";
import { gridToScreen, screenToGrid, TILE_HEIGHT, TILE_WIDTH } from "./iso";
import { drawResourceMark } from "./resourceArt";

const TERRAIN_COLORS: Record<TerrainId, number> = {
  grass: 0x5a8f4d,
  forest: 0x3d6b36,
  rock: 0x7a7f88,
  water: 0x3a6ea5,
};

const TERRAIN_SIDE: Record<TerrainId, number> = {
  grass: 0x3f6a35,
  forest: 0x2a4a24,
  rock: 0x555960,
  water: 0x2a5080,
};

function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function tileElev(terrain: TerrainId): number {
  if (terrain === "rock") return 5;
  if (terrain === "water") return 0;
  return 3;
}

interface Floater {
  x: number;
  y: number;
  resource: ResourceId;
  amount: number;
  life: number;
}

export class MainScene extends Phaser.Scene {
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

  private isPanning = false;
  private panMoved = false;
  private spaceDown = false;
  private lastPanX = 0;
  private lastPanY = 0;

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

  create() {
    this.cameras.main.setBackgroundColor("#1a2218");
    this.cameras.main.setRoundPixels(true);

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
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dz > 0 ? 0.9 : 1.1), 0.4, 2.2));
      const after = cam.getWorldPoint(cam.centerX, cam.centerY);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    // Only re-draw structure on resize; do not yank camera back to spawn
    this.scale.on("resize", () => {
      this.lastStructureHash = "";
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

    const { ox, oy } = this.mapOrigin();
    const structureHash = `${state.age}:${state.buildings
      .map((b) => `${b.id}:${b.type}:${b.progress.toFixed(2)}:${b.x},${b.y}`)
      .join("|")}:${this.scale.width}`;
    if (structureHash !== this.lastStructureHash) {
      this.redrawStructure(state);
      this.lastStructureHash = structureHash;
    }

    if (!state.paused) {
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
      });
    }
    this.renderCitizens();
    this.updateFloaters(delta);
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
    this.cameras.main.setZoom(1.05);
  }

  private redrawStructure(state: GameState) {
    const { ox, oy } = this.mapOrigin();
    this.tileGraphics.clear();
    this.buildingLayer.removeAll(true);

    const farmingTint = state.age === "farming";

    // Draw back-to-front so south faces of nearer tiles occlude correctly
    const tiles = [...state.map.tiles].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const tile of tiles) {
      const { sx, sy } = gridToScreen(tile.x, tile.y);
      let color = TERRAIN_COLORS[tile.terrain];
      let side = TERRAIN_SIDE[tile.terrain];
      if (farmingTint && tile.terrain === "grass") {
        color = 0x6fa85a;
        side = 0x4a7a3a;
      }
      const elev = tileElev(tile.terrain);
      this.drawIsoTile(this.tileGraphics, ox + sx, oy + sy, color, side, elev);
      if (tile.deposit === "wood") {
        drawResourceMark(this.tileGraphics, ox + sx, oy + sy - elev, "wood", 1);
      } else if (tile.deposit === "stone") {
        drawResourceMark(this.tileGraphics, ox + sx, oy + sy - elev, "stone", 1);
      }
    }

    const sorted = [...state.buildings].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of sorted) {
      const def = BUILDINGS[b.type];
      const { sx, sy } = gridToScreen(b.x, b.y);
      const tile = state.map.tiles[b.y * state.map.width + b.x];
      const elev = tile ? tileElev(tile.terrain) : 3;
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
    const elev = 3;
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
      // Left & right vertical faces for depth
      g.fillStyle(shadeColor(side, 0.85), alpha);
      g.beginPath();
      g.moveTo(W.x, W.y);
      g.lineTo(S.x, S.y);
      g.lineTo(Sb.x, Sb.y);
      g.lineTo(Wb.x, Wb.y);
      g.closePath();
      g.fillPath();

      g.fillStyle(side, alpha);
      g.beginPath();
      g.moveTo(S.x, S.y);
      g.lineTo(E.x, E.y);
      g.lineTo(Eb.x, Eb.y);
      g.lineTo(Sb.x, Sb.y);
      g.closePath();
      g.fillPath();
    }

    g.fillStyle(fill, alpha);
    g.beginPath();
    g.moveTo(N.x, N.y);
    g.lineTo(E.x, E.y);
    g.lineTo(S.x, S.y);
    g.lineTo(W.x, W.y);
    g.closePath();
    g.fillPath();

    // Subtle top shading: lighter north tip, darker south
    g.fillStyle(0xffffff, 0.06 * alpha);
    g.beginPath();
    g.moveTo(N.x, N.y);
    g.lineTo(E.x, E.y);
    g.lineTo(W.x, W.y);
    g.closePath();
    g.fillPath();

    g.lineStyle(1, 0x1b2618, alpha * 0.55);
    g.beginPath();
    g.moveTo(N.x, N.y);
    g.lineTo(E.x, E.y);
    g.lineTo(S.x, S.y);
    g.lineTo(W.x, W.y);
    g.closePath();
    g.strokePath();
  }
}
