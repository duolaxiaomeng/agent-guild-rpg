import { describe, expect, it } from "vitest";
import {
  WORKSTATION_DEPTHS,
  buildWorkstationCharacterManifest,
  buildWorkstationModelManifest,
  buildWorkstationPreloadEntries,
  resolveWorkstationPlacement,
  resolveSeatedDeskScale,
  resolveWorkstationCharacterKey,
  workstationRoleFromOutfit,
} from "./workstation-visuals";

describe("buildWorkstationModelManifest", () => {
  it("defines separate rear and front furniture layers with a shared seated anchor", () => {
    const manifest = buildWorkstationModelManifest();

    expect(Object.keys(manifest)).toEqual(["browser", "coder", "files", "ops", "lead"]);
    expect(manifest.browser.props).toEqual(["dual-browser", "coffee", "notes"]);
    expect(manifest.coder.props).toEqual(["code-screen", "keyboard", "terminal"]);
    expect(manifest.files.props).toEqual(["file-rack", "documents", "folder"]);
    expect(manifest.ops.props).toEqual(["alert-screen", "status-light", "toolbox"]);
    expect(manifest.lead.props).toEqual(["dual-screen", "task-docs", "comms"]);

    for (const model of Object.values(manifest)) {
      expect(model.rearKey).toMatch(/^workstation-.+-rear$/);
      expect(model.frontKey).toMatch(/^workstation-.+-front$/);
      expect(model.rearUrl).toMatch(/^\/world\/workstations\/models\/.+-empty\.png$/);
      expect(model.frontUrl).toMatch(/^\/world\/workstations\/models\/.+-front\.png$/);
      expect(model.seatAnchor.y).toBe(0.72);
      expect(model.seatAnchor.x).toBeGreaterThan(0.6);
      expect(model.floorAnchor).toEqual({ x: 0.5, y: 0.94 });
      expect(model.characterHeight).toBe(72);
      expect(model.screenAnchors.length).toBeGreaterThan(0);
      expect(model.screenAnchors.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
    }
    expect(manifest.browser).toMatchObject({ width: 132, height: 108 });
    expect(manifest.lead).toMatchObject({ width: 170, height: 114 });
  });

  it("keeps furniture and labels in a stable depth order", () => {
    expect(WORKSTATION_DEPTHS).toEqual({ room: 0, rear: 3, actor: 4, front: 5, labels: 6 });
  });

  it("keeps desk and character proportions stable on narrow viewports", () => {
    const model = buildWorkstationModelManifest().browser;

    expect(resolveWorkstationPlacement(model, 960, 540)).toMatchObject({
      deskWidth: 132,
      deskHeight: 108,
      characterHeight: 72,
      deskOffsetY: 52,
      seatedSpriteX: 24,
      seatedSpriteY: 22,
    });
    expect(resolveWorkstationPlacement(model, 720, 540)).toMatchObject({
      deskWidth: 99,
      deskHeight: 81,
      characterHeight: 54,
      deskOffsetY: 39,
      seatedSpriteX: 24,
      seatedSpriteY: 22,
    });
  });
});

describe("buildWorkstationCharacterManifest", () => {
  it("keeps seated workstation characters facing their screens after a route flip", () => {
    expect(resolveSeatedDeskScale(-1)).toBe(1);
    expect(resolveSeatedDeskScale(0.75)).toBe(0.75);
  });

  it("defines independent seated assets for desk roles and walking assets for every actor", () => {
    const manifest = buildWorkstationCharacterManifest();

    expect(Object.keys(manifest)).toEqual(["browser", "coder", "files", "ops", "lead", "staff", "visitor"]);
    for (const role of ["browser", "coder", "files", "ops", "lead"] as const) {
      expect(manifest[role].seatedUrl).toMatch(/-seated\.png$/);
    }
    for (const character of Object.values(manifest)) {
      expect(character.standingUrl).toMatch(/\.png$/);
      expect(character.walkUrls).toHaveLength(2);
      expect(character.walkUrls[0]).not.toBe(character.walkUrls[1]);
    }
  });

  it("maps existing outfits to visual roles without changing AgentDef", () => {
    expect(workstationRoleFromOutfit("blue-shirt")).toBe("browser");
    expect(workstationRoleFromOutfit("green-jacket")).toBe("coder");
    expect(workstationRoleFromOutfit("purple-shirt")).toBe("files");
    expect(workstationRoleFromOutfit("orange-jacket")).toBe("ops");
    expect(workstationRoleFromOutfit("navy-lead")).toBe("lead");
    expect(workstationRoleFromOutfit("teal-staff")).toBe("staff");
    expect(workstationRoleFromOutfit("gray-visitor")).toBe("visitor");
  });

  it("flattens all runtime assets and resolves texture keys by visual state", () => {
    const entries = buildWorkstationPreloadEntries();

    expect(entries).toHaveLength(72);
    expect(new Set(entries.map(({ key }) => key)).size).toBe(72);
    expect(entries.some(({ key }) => key.includes("occupied") || key.includes("-empty"))).toBe(false);
    expect(resolveWorkstationCharacterKey("browser", "seated-idle")).toBe("browser-seated");
    expect(resolveWorkstationCharacterKey("ops", "standing")).toBe("ops-standing");
    expect(resolveWorkstationCharacterKey("lead", "walking", 0)).toBe("lead-walk-a");
    expect(resolveWorkstationCharacterKey("lead", "walking", 1)).toBe("lead-standing");
    expect(resolveWorkstationCharacterKey("lead", "walking", 2)).toBe("lead-walk-b");
    expect(resolveWorkstationCharacterKey("lead", "walking", 3)).toBe("lead-standing");
    expect(resolveWorkstationCharacterKey("staff", "standing", 0, "down")).toBe("staff-front-standing");
    expect(resolveWorkstationCharacterKey("staff", "walking", 0, "down")).toBe("staff-front-walk-a");
    expect(resolveWorkstationCharacterKey("staff", "walking", 1, "down")).toBe("staff-front-standing");
    expect(resolveWorkstationCharacterKey("staff", "walking", 2, "down")).toBe("staff-front-walk-b");
    expect(resolveWorkstationCharacterKey("staff", "standing", 0, "up")).toBe("staff-back-standing");
    expect(resolveWorkstationCharacterKey("staff", "walking", 0, "up")).toBe("staff-back-walk-a");
    expect(resolveWorkstationCharacterKey("staff", "walking", 2, "up")).toBe("staff-back-walk-b");
    expect(resolveWorkstationCharacterKey("browser", "standing", 0, "down")).toBe("browser-front-standing");
    expect(resolveWorkstationCharacterKey("browser", "walking", 0, "down")).toBe("browser-front-walk-a");
    expect(resolveWorkstationCharacterKey("coder", "standing", 0, "up")).toBe("coder-back-standing");
    expect(resolveWorkstationCharacterKey("files", "walking", 2, "down")).toBe("files-front-walk-b");
    expect(resolveWorkstationCharacterKey("ops", "standing", 0, "down")).toBe("ops-front-standing");
    expect(resolveWorkstationCharacterKey("lead", "standing", 0, "up")).toBe("lead-back-standing");
  });
});
