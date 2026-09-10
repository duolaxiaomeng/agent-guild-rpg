import { describe, expect, it } from "vitest";
import {
  OFFICE_ZONE_DEPTHS,
  buildOfficeZoneVisualManifest,
  formatLobbyClock,
  officeFootDepth,
} from "./office-zone-visuals";

describe("buildOfficeZoneVisualManifest", () => {
  it("declares complete visual blocks for each dedicated room", () => {
    expect(buildOfficeZoneVisualManifest()).toEqual({
      lobby: [
        "studio-header",
        "reception-desk",
        "waiting-sofa",
        "announcement-wall",
        "portal-workstations",
        "portal-collab",
        "portal-review",
      ],
      "collab-room": [
        "collaboration-board",
        "round-table-back",
        "round-table-front",
        "six-seats",
        "materials-cabinet",
        "consensus-display",
      ],
      "review-station": [
        "review-status-screen",
        "decision-desk-back",
        "decision-desk-front",
        "waiting-benches",
        "quality-console",
        "presentation-spot",
      ],
      showRouteOverlay: false,
      showRouteLegends: false,
    });
  });

  it("sorts furniture and actors by their floor contact point", () => {
    expect(OFFICE_ZONE_DEPTHS.wall).toBeLessThan(officeFootDepth(120));
    expect(officeFootDepth(280)).toBeLessThan(officeFootDepth(360));
    expect(OFFICE_ZONE_DEPTHS.labels).toBeGreaterThan(officeFootDepth(540));
  });

  it("formats the lobby clock from the browser local time", () => {
    expect(formatLobbyClock(new Date(2026, 6, 15, 9, 8, 7))).toBe("09:08:07");
    expect(formatLobbyClock(new Date(2026, 6, 15, 23, 59, 59))).toBe("23:59:59");
  });
});
