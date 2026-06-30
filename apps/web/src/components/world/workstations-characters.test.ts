import { describe, expect, it } from "vitest";
import { buildCharacterRenderSpec } from "./workstations-characters";
import type { AgentDef } from "./zone-config";

const lead: AgentDef = {
  id: "focus-agent",
  label: "Lead",
  badgeNum: 5,
  x: 512,
  y: 426,
  tooltip: "正在协调任务...",
  shirtColor: "#2563eb",
  hairColor: "#6b21a8",
  seated: false,
  pose: "standing",
  facing: "down",
  archetype: "lead",
  outfit: "navy-lead",
};

describe("buildCharacterRenderSpec", () => {
  it("returns mature office proportions for the lead character", () => {
    const spec = buildCharacterRenderSpec(lead);

    expect(spec.headRadius).toBe(6);
    expect(spec.bodyWidth).toBe(14);
    expect(spec.legHeight).toBe(11);
    expect(spec.jacket).toBe(true);
    expect(spec.lanyard).toBe(true);
    expect(spec.shadowWidth).toBe(20);
  });
});
