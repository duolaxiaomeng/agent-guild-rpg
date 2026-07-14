import type { AgentDef, NpcDef, OfficeOutfit } from "./zone-config";

export type CharacterRenderSpec = {
  headRadius: number;
  bodyWidth: number;
  bodyHeight: number;
  legHeight: number;
  armReach: number;
  shadowWidth: number;
  jacket: boolean;
  lanyard: boolean;
  headset: boolean;
  glasses: boolean;
  leadBadge: boolean;
  cuffColor: string | null;
  motion: "typing" | "focus" | "talking" | "walking" | "breathing";
  walkCycleFrames: number;
  stridePx: number;
  seatedDeskPose: boolean;
  seatedFacing: "side-desk" | "front";
  hairStyle: "short-side" | "cropped" | "long-side" | "neat" | "staff-cap";
  faceDetail: "single-eye" | "glasses" | "profile";
  deskProp: "coffee" | "keyboard" | "folder" | "status-panel" | "dual-screen" | null;
};

function outfitFlags(outfit: OfficeOutfit | undefined) {
  return {
    jacket:
      outfit === "green-jacket" ||
      outfit === "orange-jacket" ||
      outfit === "navy-lead",
    lanyard: outfit === "navy-lead" || outfit === "teal-staff",
  };
}

export function buildCharacterRenderSpec(
  actor: AgentDef | NpcDef,
): CharacterRenderSpec {
  const flags = outfitFlags(actor.outfit);
  const pose = actor.pose ?? "standing";
  const isMaker = actor.archetype === "maker";
  const isLead = actor.archetype === "lead";
  const isStaff = actor.archetype === "staff";

  return {
    headRadius: isLead ? 6 : 5,
    bodyWidth: isLead ? 14 : 13,
    bodyHeight: pose === "walking" ? 15 : 14,
    legHeight: pose === "walking" ? 12 : 11,
    armReach: pose === "typing" || pose === "focus" ? 5 : 4,
    shadowWidth: pose === "walking" ? 22 : 20,
    jacket: flags.jacket,
    lanyard: flags.lanyard,
    headset: isMaker && pose === "typing",
    glasses: isLead || actor.outfit === "purple-shirt",
    leadBadge: isLead,
    cuffColor:
      actor.outfit === "green-jacket"
        ? "#bbf7d0"
        : actor.outfit === "orange-jacket"
          ? "#fed7aa"
          : actor.outfit === "navy-lead"
            ? "#bfdbfe"
            : null,
    motion:
      pose === "typing" || pose === "focus" || pose === "talking" || pose === "walking"
        ? pose
        : isStaff
          ? "walking"
          : "breathing",
    walkCycleFrames: pose === "walking" ? 2 : 1,
    stridePx: pose === "walking" ? 4 : 0,
    seatedDeskPose: Boolean("seated" in actor && actor.seated),
    seatedFacing: actor.facing === "left" || actor.facing === "right" ? "side-desk" : "front",
    hairStyle:
      actor.outfit === "green-jacket"
        ? "cropped"
        : actor.outfit === "purple-shirt"
          ? "long-side"
          : actor.outfit === "navy-lead"
            ? "neat"
            : actor.outfit === "teal-staff" || actor.outfit === "gray-visitor"
              ? "staff-cap"
              : "short-side",
    faceDetail:
      actor.outfit === "green-jacket" || isLead ? "glasses" : actor.facing === "left" || actor.facing === "right" ? "profile" : "single-eye",
    deskProp:
      isLead
        ? "dual-screen"
        : actor.outfit === "blue-shirt"
          ? "coffee"
          : actor.outfit === "green-jacket"
            ? "keyboard"
            : actor.outfit === "purple-shirt"
              ? "folder"
              : actor.outfit === "orange-jacket"
                ? "status-panel"
                : null,
  };
}
