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

  return {
    headRadius: actor.archetype === "lead" ? 6 : 5,
    bodyWidth: actor.archetype === "lead" ? 14 : 13,
    bodyHeight: actor.pose === "walking" ? 15 : 14,
    legHeight: actor.pose === "walking" ? 12 : 11,
    armReach: actor.pose === "typing" || actor.pose === "focus" ? 5 : 4,
    shadowWidth: actor.pose === "walking" ? 22 : 20,
    jacket: flags.jacket,
    lanyard: flags.lanyard,
  };
}
