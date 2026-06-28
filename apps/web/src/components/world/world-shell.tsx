"use client";

import { useEffect } from "react";
import {
  createMainCityGame,
  PIXEL_WORLD_MOUNT_ID,
  type DestroyableGame
} from "./phaser-scene";

export function WorldShell() {
  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    let game: DestroyableGame | undefined;
    let disposed = false;

    async function bootWorld() {
      const nextGame = await createMainCityGame(PIXEL_WORLD_MOUNT_ID);

      if (disposed) {
        nextGame.destroy(true);
        return;
      }

      game = nextGame;
    }

    void bootWorld();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <section>
      <p>个人家园环绕主城区，像素世界在这里加载。</p>
      <div
        id={PIXEL_WORLD_MOUNT_ID}
        aria-label="像素世界画布"
        style={{ width: 960, height: 540, background: "#d9c7a3" }}
      />
    </section>
  );
}
