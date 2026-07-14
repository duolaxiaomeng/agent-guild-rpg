import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatSocket } from "./chat-socket";

type Handler = (payload?: any) => void;

const { fakeSocket, ioMock } = vi.hoisted(() => {
  const socket = {
    handlers: new Map<string, Handler[]>(),
    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    },
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn()
  };
  return { fakeSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock("socket.io-client", () => ({ io: ioMock }));

function trigger(event: string, payload?: unknown) {
  for (const handler of fakeSocket.handlers.get(event) ?? []) {
    handler(payload);
  }
}

describe("createChatSocket", () => {
  beforeEach(() => {
    fakeSocket.handlers.clear();
    fakeSocket.emit.mockClear();
    fakeSocket.disconnect.mockClear();
    fakeSocket.removeAllListeners.mockClear();
    ioMock.mockClear();
  });

  it("subscribes to the room and forwards only matching messages", () => {
    const onMessage = vi.fn();
    const onConnectionState = vi.fn();
    const connection = createChatSocket({
      roomId: "room-chat-student-1",
      token: "session-token",
      onMessage,
      onConnectionState
    });

    trigger("connect");
    trigger("chat:message", {
      id: "message-1",
      roomId: "room-chat-student-1",
      authorId: "student-2",
      authorName: "Mo",
      body: "实时消息",
      createdAt: "2026-07-14T10:00:00.000Z"
    });
    trigger("chat:message", { id: "ignored", roomId: "room-chat-student-2" });

    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: "session-token" },
        withCredentials: true
      })
    );
    expect(fakeSocket.emit).toHaveBeenCalledWith("chat:subscribe", {
      roomId: "room-chat-student-1"
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onConnectionState).toHaveBeenCalledWith("connected");

    connection.disconnect();
    expect(fakeSocket.emit).toHaveBeenCalledWith("chat:unsubscribe", {
      roomId: "room-chat-student-1"
    });
  });

  it("supports HttpOnly-cookie authentication when no browser token is readable", () => {
    createChatSocket({
      roomId: "room-chat-student-1",
      onMessage: vi.fn()
    });

    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: undefined, withCredentials: true })
    );
  });
});
