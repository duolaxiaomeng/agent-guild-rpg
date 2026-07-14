import { describe, expect, it } from "vitest";
import { ZONE_DEFS } from "./zone-config";
import { buildWorkstationsWalkGraph } from "./phaser-scene";

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
    expect(zone.npcs.map((npc) => npc.facing)).toEqual(["down", "left"]);
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

  it("maps visible workstation agents to backend student avatars", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;

    expect(zone.agents.map((agent) => agent.studentId)).toEqual([
      "student-1",
      "student-2",
      "student-3",
      undefined,
      undefined,
    ]);
  });

  it("assigns valid deterministic walk routes to workstation actors", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;
    const graph = buildWorkstationsWalkGraph(960, 540);
    const routeIds = new Set(graph.routes.map((route) => route.id));
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const routedActors = [...zone.agents, ...zone.npcs].filter(
      (actor) => actor.routeId,
    );

    expect(routedActors.map((actor) => actor.routeId)).toEqual([
      "browser-board-loop",
      "coder-board-loop",
      "files-lounge-loop",
      "ops-review-loop",
      "lead-review-loop",
      "staff-patrol-loop",
      "visitor-lounge-loop",
    ]);
    expect(routedActors.every((actor) => routeIds.has(actor.routeId!))).toBe(true);
    expect(routedActors.every((actor) => nodeIds.has(actor.homeNodeId!))).toBe(true);
    expect(routedActors.map((actor) => actor.routeNumber)).toEqual([
      1,
      1,
      3,
      4,
      4,
      2,
      3,
    ]);
  });
});

describe("dedicated office zones", () => {
  it("uses detailed office outfits and real student avatars outside workstations", () => {
    const lobby = ZONE_DEFS.find((item) => item.id === "lobby")!;
    const collab = ZONE_DEFS.find((item) => item.id === "collab-room")!;
    const review = ZONE_DEFS.find((item) => item.id === "review-station")!;

    expect(lobby.npcs.every((npc) => npc.outfit && npc.pose && npc.facing)).toBe(true);
    expect(collab.npcs.every((npc) => npc.outfit && npc.pose && npc.facing)).toBe(true);
    expect(review.npcs.every((npc) => npc.outfit && npc.pose && npc.facing)).toBe(true);
    expect(collab.agents.map((agent) => agent.studentId)).toEqual([
      "student-1",
      "student-2",
      "student-3",
    ]);
    expect(review.agents.map((agent) => agent.studentId)).toEqual([
      "student-1",
      "student-2",
    ]);
    expect(collab.agents.map((agent) => agent.y)).toEqual([210, 210, 410]);
    expect(collab.npcs.find((npc) => npc.id === "pm")?.y).toBe(194);
    expect(review.npcs.find((npc) => npc.id === "reviewer")?.y).toBe(226);
    expect(review.agents.map((agent) => agent.y)).toEqual([248, 330]);
    expect(review.agents.map((agent) => agent.label)).toEqual(["A-01", "B-02"]);
  });
});
