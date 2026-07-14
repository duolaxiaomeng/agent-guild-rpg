import { describe, expect, it } from "vitest";
import {
  WorkstationMotionCoordinator,
  resolveWorkstationVisualState,
} from "./workstation-motion";

describe("resolveWorkstationVisualState", () => {
  it("maps backend status and route phase to a visual state", () => {
    expect(resolveWorkstationVisualState("online", "home")).toBe("seated-idle");
    expect(resolveWorkstationVisualState("idle", "home")).toBe("seated-idle");
    expect(resolveWorkstationVisualState("working", "home")).toBe("seated-active");
    expect(resolveWorkstationVisualState("reviewing", "home")).toBe("seated-active");
    expect(resolveWorkstationVisualState("working", "departing")).toBe("standing");
    expect(resolveWorkstationVisualState("working", "traveling")).toBe("walking");
    expect(resolveWorkstationVisualState("reviewing", "paused")).toBe("standing");
    expect(resolveWorkstationVisualState("online", "returning")).toBe("walking");
  });
});

describe("WorkstationMotionCoordinator", () => {
  it("uses deterministic low-frequency delays between 20 and 35 seconds", () => {
    const coordinator = new WorkstationMotionCoordinator();
    const first = coordinator.getDelayMs("coding-agent", 0);

    expect(first).toBeGreaterThanOrEqual(20_000);
    expect(first).toBeLessThanOrEqual(35_000);
    expect(coordinator.getDelayMs("coding-agent", 0)).toBe(first);
    expect(coordinator.getDelayMs("coding-agent", 1)).not.toBe(first);
  });

  it("limits movement to two non-offline actors", () => {
    const coordinator = new WorkstationMotionCoordinator(2);

    expect(coordinator.tryBegin("browser-agent", "online")).toBe(true);
    expect(coordinator.tryBegin("coding-agent", "working")).toBe(true);
    expect(coordinator.tryBegin("files-agent", "online")).toBe(false);
    expect(coordinator.tryBegin("ops-agent", "offline")).toBe(false);
    coordinator.complete("browser-agent");
    expect(coordinator.tryBegin("files-agent", "online")).toBe(true);
  });

  it("queues status updates while moving and applies them on completion", () => {
    const coordinator = new WorkstationMotionCoordinator();
    coordinator.tryBegin("browser-agent", "online");

    expect(coordinator.updateStatus("browser-agent", "reviewing")).toEqual({ applyNow: false });
    expect(coordinator.complete("browser-agent")).toBe("reviewing");
    expect(coordinator.updateStatus("browser-agent", "working")).toEqual({ applyNow: true });
  });
});
