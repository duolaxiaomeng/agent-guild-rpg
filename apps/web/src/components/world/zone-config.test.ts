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

  it("gives workstations actors realistic poses and facing directions", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;

    expect(zone.agents.map((agent) => agent.pose)).toEqual([
      "focus",
      "typing",
      "focus",
      "typing",
      "standing",
    ]);
    expect(zone.agents.map((agent) => agent.facing)).toEqual([
      "right",
      "left",
      "right",
      "left",
      "down",
    ]);
    expect(zone.npcs.map((npc) => npc.pose)).toEqual(["walking", "talking"]);
    expect(zone.npcs.map((npc) => npc.facing)).toEqual(["left", "left"]);
  });

  it("assigns mature office archetypes for the third-round polish", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;

    expect(zone.agents.map((agent) => agent.pose)).toEqual([
      "focus",
      "typing",
      "focus",
      "typing",
      "standing",
    ]);
    expect(zone.agents.map((agent) => agent.archetype)).toEqual([
      "maker",
      "maker",
      "operator",
      "operator",
      "lead",
    ]);
    expect(zone.agents.map((agent) => agent.outfit)).toEqual([
      "blue-shirt",
      "green-jacket",
      "purple-shirt",
      "orange-jacket",
      "navy-lead",
    ]);
    expect(zone.npcs.map((npc) => npc.pose)).toEqual(["walking", "talking"]);
    expect(zone.npcs.map((npc) => npc.outfit)).toEqual([
      "teal-staff",
      "gray-visitor",
    ]);
  });
});
