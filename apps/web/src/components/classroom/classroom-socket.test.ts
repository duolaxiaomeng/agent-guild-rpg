import { describe, expect, it, vi } from "vitest";
import { createClassroomSocket } from "./classroom-socket";

type Handler = (...args: any[]) => void;
const fakeSocket = {
  handlers: new Map<string, Handler[]>(),
  on(event: string, handler: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); return this; },
  emit: vi.fn(),
  removeAllListeners: vi.fn(),
  disconnect: vi.fn()
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => fakeSocket)
}));

function trigger(event: string, payload: unknown) {
  for (const handler of fakeSocket.handlers.get(event) ?? []) handler(payload);
}

describe("createClassroomSocket", () => {
  it("filters stage and help versions independently", () => {
    const onStageUpdate = vi.fn();
    const onHelpUpdate = vi.fn();
    fakeSocket.handlers.clear();
    createClassroomSocket({ token: "token", sessionId: "class-1", initialVersion: 0, onStageUpdate, onHelpUpdate });

    trigger("classroom:stage:update", { sessionId: "class-1", version: 1, serverNow: "2026-07-12T09:00:00.000Z", currentStage: null });
    trigger("classroom:help:update", { sessionId: "class-1", version: 0, serverNow: "2026-07-12T09:00:00.000Z", helpRequest: { id: "help-1", status: "open" } });

    expect(onStageUpdate).toHaveBeenCalledTimes(1);
    expect(onHelpUpdate).toHaveBeenCalledTimes(1);
  });
});
