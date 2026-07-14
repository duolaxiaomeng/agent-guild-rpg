export type WorkstationVisualState =
  | "seated-idle"
  | "seated-active"
  | "standing"
  | "walking";

export type WorkstationRoutePhase =
  | "home"
  | "departing"
  | "traveling"
  | "paused"
  | "returning";

export type WorkstationMotionStatus =
  | "online"
  | "working"
  | "reviewing"
  | "idle"
  | "offline";

export function resolveWorkstationVisualState(
  status: WorkstationMotionStatus,
  routePhase: WorkstationRoutePhase,
): WorkstationVisualState {
  if (routePhase === "departing" || routePhase === "paused") return "standing";
  if (routePhase === "traveling" || routePhase === "returning") return "walking";
  return status === "working" || status === "reviewing" ? "seated-active" : "seated-idle";
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class WorkstationMotionCoordinator {
  private readonly active = new Set<string>();
  private readonly pendingStatus = new Map<string, WorkstationMotionStatus>();

  constructor(private readonly maxActive = 2) {}

  getDelayMs(actorId: string, cycle: number): number {
    return 20_000 + (stableHash(`${actorId}:${cycle}`) % 15_001);
  }

  tryBegin(actorId: string, status: WorkstationMotionStatus): boolean {
    if (status === "offline" || this.active.has(actorId) || this.active.size >= this.maxActive) {
      return false;
    }
    this.active.add(actorId);
    return true;
  }

  updateStatus(actorId: string, status: WorkstationMotionStatus): { applyNow: boolean } {
    if (!this.active.has(actorId)) return { applyNow: true };
    this.pendingStatus.set(actorId, status);
    return { applyNow: false };
  }

  complete(actorId: string): WorkstationMotionStatus | undefined {
    this.active.delete(actorId);
    const pending = this.pendingStatus.get(actorId);
    this.pendingStatus.delete(actorId);
    return pending;
  }

  isMoving(actorId: string): boolean {
    return this.active.has(actorId);
  }
}
