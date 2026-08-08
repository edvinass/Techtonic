import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) return;

    const width = Math.max(host.clientWidth, 640);
    const height = Math.max(host.clientHeight, 400);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width,
      height,
      backgroundColor: "#1a2218",
      scene: [MainScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width,
        height,
      },
      input: {
        mouse: {
          preventDefaultWheel: false,
        },
      },
      render: {
        antialias: true,
        roundPixels: false,
      },
    });
    gameRef.current = game;

    // Prevent browser context menu so right-drag pan works
    const blockMenu = (e: Event) => e.preventDefault();
    host.addEventListener("contextmenu", blockMenu);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !gameRef.current) return;
      const { width: w, height: h } = entry.contentRect;
      if (w < 32 || h < 32) return;
      gameRef.current.scale.resize(Math.floor(w), Math.floor(h));
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
