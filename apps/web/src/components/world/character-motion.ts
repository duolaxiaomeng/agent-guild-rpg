export const CHARACTER_WALK_FRAME_MS = 160;

export type CharacterWalkPose = {
  textureFrame: 0 | 1;
  yOffset: number;
  angle: number;
};

const WALK_POSES: readonly CharacterWalkPose[] = [
  // Contact: left foot forward, right foot behind.
  { textureFrame: 0, yOffset: 0, angle: -0.24 },
  // Passing: feet come back under the body before the opposite step.
  { textureFrame: 0, yOffset: -1, angle: 0.06 },
  // Contact: right foot forward, left foot behind.
  { textureFrame: 1, yOffset: 0, angle: 0.24 },
  // Passing: weight shifts back through the centre.
  { textureFrame: 1, yOffset: -1, angle: -0.06 },
];

function normalizeWalkFrame(frame: number) {
  return ((Math.trunc(frame) % WALK_POSES.length) + WALK_POSES.length) % WALK_POSES.length;
}

export function resolveCharacterWalkPose(frame: number): CharacterWalkPose {
  return WALK_POSES[normalizeWalkFrame(frame)];
}

export function nextCharacterWalkFrame(frame: number) {
  return (normalizeWalkFrame(frame) + 1) % WALK_POSES.length;
}
