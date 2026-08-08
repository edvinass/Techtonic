import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";

/** Cap DPR so retina is sharp without 3×/4× fill-rate cost. */
function displayDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) return;

    const dpr = displayDpr();
    const cssW = Math.max(host.clientWidth, 640);
    const cssH = Math.max(host.clientHeight, 400);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: Math.floor(cssW * dpr),
      height: Math.floor(cssH * dpr),
      backgroundColor: "#0c1410",
      scene: [MainScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Math.floor(cssW * dpr),
        height: Math.floor(cssH * dpr),
        autoRound: true,
      },
      input: {
        mouse: {
          preventDefaultWheel: false,
        },
      },
      render: {
        antialias: true,
        antialiasGL: true,
        roundPixels: false,
        powerPreference: "high-performance",
      },
    });
    game.registry.set("dpr", dpr);
    gameRef.current = game;

    const fitCanvasCss = (cssWidth: number, cssHeight: number) => {
      const canvas = game.canvas;
      if (!canvas) return;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    };
    fitCanvasCss(cssW, cssH);

    const blockMenu = (e: Event) => e.preventDefault();
    host.addEventListener("contextmenu", blockMenu);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !gameRef.current) return;
      const { width: w, height: h } = entry.contentRect;
      if (w < 32 || h < 32) return;
      const ratio = (game.registry.get("dpr") as number) || displayDpr();
      game.scale.resize(Math.floor(w * ratio), Math.floor(h * ratio));
      fitCanvasCss(Math.floor(w), Math.floor(h));
    });
    ro.observe(host);

    return () => {
      host.removeEventListener("contextmenu", blockMenu);
      ro.disconnect();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="phaser-host" ref={hostRef} />;
}
