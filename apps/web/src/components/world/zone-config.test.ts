import { describe, expect, it } from "vitest";
import { ZONE_DEFS } from "./zone-config";

describe("workstations zone office replication", () => {
  it("matches the replicated office composition contract", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations");

    expect(zone).toBeDefined();
    expect(zone?.floorStyle).toBe("mixed");
    expect(zone?.agents).toHaveLength(5);
    expect(zone?.agents.filter((agent) => agent.seated)).toHaveLength(4);
    expect(zone?.npcs).toHaveLength(2);
    expect(zone?.landmarks.map((item) => item.label)).toEqual([
      "顶部展示墙",
      "中心工位",
      "休息区",
    ]);
  });
});
