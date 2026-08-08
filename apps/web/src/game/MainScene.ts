import Phaser from "phaser";
import { BUILDINGS } from "../data/buildings";
import { canPlaceBuilding } from "../sim/engine";
import type { GameState, TerrainId } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { gridToScreen, screenToGrid, TILE_HEIGHT, TILE_WIDTH } from "./iso";

const TERRAIN_COLORS: Record<TerrainId, number> = {
  grass: 0x5a8f4d,
  forest: 0x3d6b36,
  rock: 0x7a7f88,
  water: 0x3a6ea5,
};

interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  color: number;
}

export class MainScene extends Phaser.Scene {
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private buildingLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Graphics;
  private lastHash = "";
  private lastTick = -1;
  private floaters: Floater[] = [];
  private centeredOnce = false;
  private panKeys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("main");
  }

  create() {
    this.cameras.main.setBackgroundColor("#1a2218");
    this.tileGraphics = this.add.graphics();
    this.buildingLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.ghost = this.add.graphics();
    this.ghost.setDepth(10000);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.panKeys = {
        w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.rightButtonDown()) {
        this.cameras.main.scrollX -=
          (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
        this.cameras.main.scrollY -=
          (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
      }
      this.drawGhost(pointer);
    });

    this.input.on("wheel", (_p: unknown, _dx: number, _dy: number, dz: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dz * 0.001, 0.45, 1.8));
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased()) return;
      const state = useGameStore.getState().state;
      if (!state) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const origin = this.mapOrigin();
      const { x, y } = screenToGrid(world.x - origin.ox, world.y - origin.oy);
      const err = useGameStore.getState().placeAt(x, y);
      if (err && useGameStore.getState().selectedBuilding) {
        useGameStore.getState().setStatus(err);
      }
    });

    this.scale.on("resize", () => {
      this.lastHash = "";
      const state = useGameStore.getState().state;
      if (state) this.centerOnSettlement(state);
    });

    const state = useGameStore.getState().state;
    if (state) {
      this.redraw(state);
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
      this.lastHash = "";
    }

    if (this.panKeys) {
      const speed = 6 / this.cameras.main.zoom;
      if (this.panKeys.w.isDown) this.cameras.main.scrollY -= speed;
      if (this.panKeys.s.isDown) this.cameras.main.scrollY += speed;
      if (this.panKeys.a.isDown) this.cameras.main.scrollX -= speed;
      if (this.panKeys.d.isDown) this.cameras.main.scrollX += speed;
    }

    if (state.tick !== this.lastTick) {
      this.spawnProductionFloaters(state);
      this.lastTick = state.tick;
    }

    const hash = `${state.tick}:${state.age}:${state.buildings.length}:${state.buildings
      .map((b) => `${b.id}:${b.progress.toFixed(2)}:${b.workers}`)
      .join(",")}:${this.scale.width}x${this.scale.height}`;
    if (hash !== this.lastHash) {
      this.redraw(state);
      this.lastHash = hash;
    }

    this.updateFloaters(delta);
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
    this.cameras.main.setZoom(1);
  }

  private redraw(state: GameState) {
    const { ox, oy } = this.mapOrigin();
    this.tileGraphics.clear();
    this.buildingLayer.removeAll(true);

    const farmingTint = state.age === "farming";
    const pulse = 0.85 + 0.15 * Math.sin(state.tick * 0.8);

    for (const tile of state.map.tiles) {
      const { sx, sy } = gridToScreen(tile.x, tile.y);
      let color = TERRAIN_COLORS[tile.terrain];
      if (farmingTint && tile.terrain === "grass") color = 0x6fa85a;
      this.drawDiamond(this.tileGraphics, ox + sx, oy + sy, color, 0x1b2618);
      if (tile.deposit === "wood") {
        this.tileGraphics.fillStyle(0x2f5a28, 1);
        this.tileGraphics.fillCircle(ox + sx, oy + sy - 6, 4);
      } else if (tile.deposit === "stone") {
        this.tileGraphics.fillStyle(0xb0b4bc, 1);
        this.tileGraphics.fillCircle(ox + sx, oy + sy - 4, 3);
      }
    }

    const sorted = [...state.buildings].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of sorted) {
      const def = BUILDINGS[b.type];
      const { sx, sy } = gridToScreen(b.x, b.y);
      const g = this.add.graphics();
      const alpha = b.progress < 1 ? 0.55 : 1;
      const color =
        state.age === "farming" && b.type === "house" ? 0xe0c089 : def.color;
      const active = b.progress >= 1 && b.workers > 0;
      g.fillStyle(color, active ? alpha * pulse : alpha);
      g.fillRoundedRect(-14, -28, 28, 32, 4);
      g.lineStyle(2, active ? 0xf0e6c8 : 0x221c14, alpha);
      g.strokeRoundedRect(-14, -28, 28, 32, 4);
      if (b.progress < 1) {
        g.fillStyle(0x1b2618, 0.55);
        g.fillRect(-12, -4, 24, 5);
        g.fillStyle(0xe8c95a, 0.95);
        g.fillRect(-12, -4, 24 * b.progress, 5);
      }
      // Worker dots
      for (let i = 0; i < b.workers; i++) {
        g.fillStyle(0xfff2c4, 1);
        g.fillCircle(-10 + i * 7, -34, 2.5);
      }
      g.setPosition(ox + sx, oy + sy);
      g.setDepth(b.x + b.y);
      this.buildingLayer.add(g);
    }
  }

  private spawnProductionFloaters(state: GameState) {
    const { ox, oy } = this.mapOrigin();
    for (const b of state.buildings) {
      if (b.progress < 1 || b.workers <= 0) continue;
      const def = BUILDINGS[b.type];
      if (!def.produces) continue;
      const [res, amount] = Object.entries(def.produces)[0] ?? [];
      if (!res || !amount) continue;
      const { sx, sy } = gridToScreen(b.x, b.y);
      this.floaters.push({
        x: ox + sx,
        y: oy + sy - 36,
        text: `+${(amount * b.workers).toFixed(1)} ${res}`,
        life: 900,
        color: res === "food" ? 0xd4c05a : res === "knowledge" ? 0xb39dff : 0xa8d48a,
      });
    }
    // Cap floaters
    if (this.floaters.length > 40) {
      this.floaters.splice(0, this.floaters.length - 40);
    }
  }

  private updateFloaters(delta: number) {
    this.fxLayer.removeAll(true);
    const next: Floater[] = [];
    for (const f of this.floaters) {
      f.life -= delta;
      f.y -= delta * 0.03;
      if (f.life <= 0) continue;
      next.push(f);
      const label = this.add.text(f.x, f.y, f.text, {
        fontFamily: "DM Sans, sans-serif",
        fontSize: "12px",
        color: `#${f.color.toString(16).padStart(6, "0")}`,
      });
      label.setOrigin(0.5, 1);
      label.setAlpha(Math.min(1, f.life / 400));
      label.setDepth(20000);
      this.fxLayer.add(label);
    }
    this.floaters = next;
  }

  private drawGhost(pointer: Phaser.Input.Pointer) {
    const state = useGameStore.getState().state;
    const selected = useGameStore.getState().selectedBuilding;
    this.ghost.clear();
    if (!state || !selected) return;

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
