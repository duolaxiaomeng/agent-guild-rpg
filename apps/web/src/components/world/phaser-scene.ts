export const PIXEL_WORLD_MOUNT_ID = "pixel-world";
export const MAIN_CITY_SCENE_KEY = "main-city";

type PhaserModule = typeof import("phaser");

export type DestroyableGame = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
};

function createMainCityScene(Phaser: PhaserModule) {
  return class MainCityScene extends Phaser.Scene {
    constructor() {
      super(MAIN_CITY_SCENE_KEY);
    }

    create() {
      this.cameras.main.setBackgroundColor("#d9c7a3");
      this.add.text(32, 32, "Agent Guild RPG", {
        color: "#1f2937"
      });
      this.add.text(32, 72, "主城区", {
        color: "#7c3f00"
      });
    }
  };
}

export async function createMainCityGame(parent: string): Promise<DestroyableGame> {
  const phaserModule = await import("phaser");
  const Phaser = ("default" in phaserModule ? phaserModule.default : phaserModule) as PhaserModule;
  const MainCityScene = createMainCityScene(Phaser);

  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    parent,
    backgroundColor: "#d9c7a3",
    scene: MainCityScene,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  });
}
