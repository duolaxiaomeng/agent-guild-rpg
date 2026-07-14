export const WORLD_HUD_SAFE_AREAS = {
  top: 56,
  bottom: 72,
} as const;

export function scaleHudSafeAreas(viewportHeight: number) {
  const scale = viewportHeight / 540;
  return {
    top: Math.round(WORLD_HUD_SAFE_AREAS.top * scale),
    bottom: Math.round(WORLD_HUD_SAFE_AREAS.bottom * scale),
  };
}
