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

export class MainScene extends Phaser.Scene {
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private buildingLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Graphics;
  private lastHash = "";
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
    this.ghost = this.add.graphics();

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
        this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
        this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
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
      const origin = this.mapOrigin(state);
      const { x, y } = screenToGrid(world.x - origin.ox, world.y - origin.oy);
      const err = useGameStore.getState().placeAt(x, y);
      if (err && useGameStore.getState().selectedBuilding) {
        useGameStore.getState().setStatus(err);
      }
    });

    const state = useGameStore.getState().state;
    if (state) {
      this.redraw(state, true);
      const { sx, sy } = gridToScreen(Math.floor(state.map.width / 2), Math.floor(state.map.height / 2));
      const origin = this.mapOrigin(state);
      this.cameras.main.centerOn(origin.ox + sx, origin.oy + sy);
    }
  }

  update() {
    const state = useGameStore.getState().state;
    if (!state) return;

    if (this.panKeys) {
      const speed = 6 / this.cameras.main.zoom;
      if (this.panKeys.w.isDown) this.cameras.main.scrollY -= speed;
      if (this.panKeys.s.isDown) this.cameras.main.scrollY += speed;
      if (this.panKeys.a.isDown) this.cameras.main.scrollX -= speed;
      if (this.panKeys.d.isDown) this.cameras.main.scrollX += speed;
    }

    const hash = `${state.tick}:${state.age}:${state.buildings.length}:${state.buildings
      .map((b) => `${b.id}:${b.progress.toFixed(2)}`)
      .join(",")}`;
    if (hash !== this.lastHash) {
      this.redraw(state, false);
      this.lastHash = hash;
    }
  }

  private mapOrigin(state: GameState) {
    return {
      ox: this.scale.width / 2,
      oy: 80,
      width: state.map.width,
      height: state.map.height,
    };
  }

  private redraw(state: GameState, _full: boolean) {
    const { ox, oy } = this.mapOrigin(state);
    this.tileGraphics.clear();
    this.buildingLayer.removeAll(true);

    const farmingTint = state.age === "farming";

    for (const tile of state.map.tiles) {
      const { sx, sy } = gridToScreen(tile.x, tile.y);
      let color = TERRAIN_COLORS[tile.terrain];
      if (farmingTint && tile.terrain === "grass") color = 0x6fa85a;
      this.drawDiamond(this.tileGraphics, ox + sx, oy + sy, color, 0x1b2618);
    }

    const sorted = [...state.buildings].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const b of sorted) {
      const def = BUILDINGS[b.type];
      const { sx, sy } = gridToScreen(b.x, b.y);
      const g = this.add.graphics();
      const alpha = b.progress < 1 ? 0.55 : 1;
      const color =
        state.age === "farming" && b.type === "house" ? 0xe0c089 : def.color;
      g.fillStyle(color, alpha);
      g.fillRoundedRect(-14, -28, 28, 32, 4);
      g.lineStyle(2, 0x221c14, alpha);
      g.strokeRoundedRect(-14, -28, 28, 32, 4);
      if (b.progress < 1) {
        g.fillStyle(0xffffff, 0.35);
        g.fillRect(-12, -4, 24 * b.progress, 4);
      }
      g.setPosition(ox + sx, oy + sy);
      g.setDepth(b.x + b.y);
      this.buildingLayer.add(g);
    }
  }

  private drawGhost(pointer: Phaser.Input.Pointer) {
    const state = useGameStore.getState().state;
    const selected = useGameStore.getState().selectedBuilding;
    this.ghost.clear();
    if (!state || !selected) return;

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { ox, oy } = this.mapOrigin(state);
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
    g.lineStyle(1, stroke, alpha * 0.8);
    g.strokePath();
  }
}
