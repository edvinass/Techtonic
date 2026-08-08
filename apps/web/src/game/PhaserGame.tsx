import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: hostRef.current.clientWidth || 960,
      height: hostRef.current.clientHeight || 640,
      backgroundColor: "#1a2218",
      scene: [MainScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        mouse: { preventDefaultWheel: false },
      },
    });
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="phaser-host" ref={hostRef} />;
}
