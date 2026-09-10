import { describe, expect, it } from "vitest";
import { buildCharacterRenderSpec, type CharacterRenderSpec } from "./workstations-characters";
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
    expect(spec.headset).toBe(false);
    expect(spec.glasses).toBe(true);
    expect(spec.leadBadge).toBe(true);
    expect(spec.shadowWidth).toBe(20);
    expect(spec.hairStyle).toBe("neat");
    expect(spec.faceDetail).toBe("glasses");
    expect(spec.deskProp).toBe("dual-screen");
  });

  it("gives typing makers a headset and cuffs for stronger workstation identity", () => {
    const typingMaker: AgentDef = {
      id: "coding-agent",
      label: "Coder",
      badgeNum: 2,
      x: 332,
      y: 246,
      tooltip: "正在实现界面...",
      shirtColor: "#22c55e",
      hairColor: "#1e293b",
      seated: true,
      pose: "typing",
      facing: "left",
      archetype: "maker",
      outfit: "green-jacket",
    };

    const spec = buildCharacterRenderSpec(typingMaker);

    expect(spec.headset).toBe(true);
    expect(spec.cuffColor).toBe("#bbf7d0");
    expect(spec.motion).toBe("typing");
    expect(spec.seatedDeskPose).toBe(true);
    expect(spec.seatedFacing).toBe("side-desk");
    expect(spec.hairStyle).toBe("cropped");
    expect(spec.faceDetail).toBe("glasses");
    expect(spec.deskProp).toBe("keyboard");
  });

  it("assigns a readable silhouette and prop to each workstation identity", () => {
    const outfits: Array<[AgentDef["outfit"], CharacterRenderSpec["hairStyle"], CharacterRenderSpec["deskProp"]]> = [
      ["blue-shirt", "short-side", "coffee"],
      ["purple-shirt", "long-side", "folder"],
      ["orange-jacket", "short-side", "status-panel"],
    ];

    for (const [outfit, hairStyle, deskProp] of outfits) {
      const spec = buildCharacterRenderSpec({
        ...lead,
        id: `agent-${outfit}`,
        label: outfit,
        archetype: "maker",
        outfit,
        seated: true,
        pose: "focus",
        facing: "right",
      });

      expect(spec.hairStyle).toBe(hairStyle);
      expect(spec.faceDetail).toBe("profile");
      expect(spec.deskProp).toBe(deskProp);
    }
  });

  it("gives walking actors a four-phase stride over the two pixel textures", () => {
    const walker: AgentDef = {
      id: "walking-agent",
      label: "Runner",
      badgeNum: 7,
      x: 560,
      y: 280,
      tooltip: "正在移动到任务点",
      shirtColor: "#0f766e",
      hairColor: "#78350f",
      pose: "walking",
      facing: "right",
      archetype: "staff",
      outfit: "teal-staff",
    };

    const spec = buildCharacterRenderSpec(walker);

    expect(spec.motion).toBe("walking");
    expect(spec.walkCycleFrames).toBe(4);
    expect(spec.stridePx).toBe(4);
  });
});
