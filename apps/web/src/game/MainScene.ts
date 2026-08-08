import Phaser from "phaser";
import { BUILDINGS } from "../data/buildings";
import { RESOURCES } from "../data/resources";
import { canPlaceBuilding } from "../sim/engine";
import type { GameState, ResourceId, TerrainId } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { stepCitizens, syncCitizens, type Citizen } from "./citizens";
import { gridToScreen, screenToGrid, TILE_HEIGHT, TILE_WIDTH } from "./iso";
import { drawResourceMark } from "./resourceArt";

const TERRAIN_COLORS: Record<TerrainId, number> = {
  grass: 0x5a8f4d,
  forest: 0x3d6b36,
  rock: 0x7a7f88,
  water: 0x3a6ea5,
};

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
  private lastStructureHash = "";
  private floaters: Floater[] = [];
  private centeredOnce = false;
  private citizens: Citizen[] = [];
  private citizenGfx = new Map<number, Phaser.GameObjects.Container>();

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

    for (const tile of state.map.tiles) {
      const { sx, sy } = gridToScreen(tile.x, tile.y);
      let color = TERRAIN_COLORS[tile.terrain];
      if (farmingTint && tile.terrain === "grass") color = 0x6fa85a;
      this.drawDiamond(this.tileGraphics, ox + sx, oy + sy, color, 0x1b2618);
      if (tile.deposit === "wood") {
        drawResourceMark(this.tileGraphics, ox + sx, oy + sy, "wood", 1);
      } else if (tile.deposit === "stone") {
        drawResourceMark(this.tileGraphics, ox + sx, oy + sy, "stone", 1);
      }
    }

    const sorted = [...state.buildings].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of sorted) {
      const def = BUILDINGS[b.type];
      const { sx, sy } = gridToScreen(b.x, b.y);
      const g = this.add.graphics();
      const alpha = b.progress < 1 ? 0.6 : 1;
      const color =
        state.age === "farming" && b.type === "house" ? 0xe0c089 : def.color;

      // Iso building footprint + tower
      g.fillStyle(0x000000, 0.18 * alpha);
      g.fillEllipse(0, 6, 34, 14);
      g.fillStyle(color, alpha);
      g.fillRoundedRect(-16, -30, 32, 34, 5);
      g.fillStyle(0xf0e2b0, 0.35 * alpha);
      g.fillTriangle(-16, -30, 16, -30, 0, -42);
      g.lineStyle(2, 0x1a160f, alpha);
      g.strokeRoundedRect(-16, -30, 32, 34, 5);

      if (b.progress < 1) {
        g.fillStyle(0x1b2618, 0.6);
        g.fillRect(-14, -2, 28, 5);
        g.fillStyle(0xe8c95a, 1);
        g.fillRect(-14, -2, 28 * b.progress, 5);
        // Scaffold lines
        g.lineStyle(1, 0xd8c090, 0.7);
        g.strokeRect(-16, -30, 32, 34);
      }

      // Soft work glow + produced-resource badge on active buildings
      if (b.progress >= 1 && b.workers > 0) {
        g.fillStyle(0xfff3c4, 0.12);
        g.fillCircle(0, -10, 22);
      }
      if (b.progress >= 1 && def.produces) {
        const res = Object.keys(def.produces)[0] as ResourceId | undefined;
        if (res) drawResourceMark(g, 12, -36, res, 0.55);
      }

      g.setPosition(ox + sx, oy + sy);
      g.setDepth(b.x + b.y);
      this.buildingLayer.add(g);
    }
  }

  private renderCitizens() {
    const live = new Set<number>();
    for (const c of this.citizens) {
      live.add(c.id);
      let node = this.citizenGfx.get(c.id);
      if (!node) {
        node = this.createCitizenNode(c);
        this.citizenGfx.set(c.id, node);
        this.citizenLayer.add(node);
      }
      const walking = c.job.kind === "walk";
      const working = c.job.kind === "gather" || c.job.kind === "work";
      const bob = walking
        ? Math.abs(Math.sin(c.bobPhase * 2)) * 3
        : Math.sin(c.bobPhase) * 1.2;
      const workBounce = working ? Math.abs(Math.sin(c.bobPhase * 4)) * 2.5 : 0;
      node.setPosition(c.x, c.y - bob - workBounce);
      node.setDepth(10_000 + c.y);

      const body = node.getAt(0) as Phaser.GameObjects.Arc;
      const bundle = node.getAt(4) as Phaser.GameObjects.Arc;
      const label = node.getAt(5) as Phaser.GameObjects.Text;

      if (c.job.kind === "gather" || c.job.kind === "work") {
        body.setFillStyle(0xffe08a);
      } else if (c.carryAmount > 0) {
        body.setFillStyle(0xf0d2a0);
      } else {
        body.setFillStyle(0xf5e6c8);
      }

      if (c.carryAmount > 0 && c.carrying) {
        const visual = RESOURCES[c.carrying];
        bundle.setVisible(true);
        bundle.setFillStyle(visual.color);
        const fill = Math.min(1, c.carryAmount / 8);
        bundle.setRadius(2.2 + fill * 2.2);
        label.setVisible(true);
        label.setColor(`#${visual.hex}`);
        label.setText(`${visual.glyph}${Math.max(1, Math.round(c.carryAmount))}`);
      } else {
        bundle.setVisible(false);
        label.setVisible(false);
      }
    }

    for (const [id, node] of this.citizenGfx) {
      if (!live.has(id)) {
        node.destroy(true);
        this.citizenGfx.delete(id);
      }
    }
  }

  private createCitizenNode(c: Citizen): Phaser.GameObjects.Container {
    const body = this.add.circle(0, -6, 5, 0xf5e6c8);
    body.setStrokeStyle(1, 0x3a2a18);
    const head = this.add.circle(0, -14, 3.2, 0xffe0b8);
    head.setStrokeStyle(1, 0x3a2a18);
    const shadow = this.add.ellipse(0, 2, 10, 4, 0x000000, 0.25);
    const tool = this.add.rectangle(6, -8, 2, 8, 0x8b6914);
    const bundle = this.add.circle(-6, -7, 3, 0x6b8f4e);
    bundle.setVisible(false);
    bundle.setStrokeStyle(1, 0x2a2010);
    const label = this.add.text(-6, -18, "", {
      fontFamily: "DM Sans, sans-serif",
      fontSize: "9px",
      color: "#fff8e8",
      stroke: "#142017",
      strokeThickness: 2,
    });
    label.setOrigin(0.5, 1);
    label.setVisible(false);
    const node = this.add.container(c.x, c.y, [body, head, shadow, tool, bundle, label]);
    node.setScale(0.9 + (c.id % 5) * 0.04);
    return node;
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
    if (!state || !selected || this.isPanning) return;

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { ox, oy } = this.mapOrigin();
    const { x, y } = screenToGrid(world.x - ox, world.y - oy);
    const { sx, sy } = gridToScreen(x, y);
    const check = canPlaceBuilding(state, selected, x, y);
    const color = check.ok ? 0x8fd18a : 0xd16a6a;
    this.drawDiamond(this.ghost, ox + sx, oy + sy, color, color, 0.45);
  }

  private drawDiamond(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    fill: number,
    stroke: number,
    alpha = 1,
  ) {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.fillStyle(fill, alpha);
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, stroke, alpha * 0.85);
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
    g.strokePath();
  }
}
