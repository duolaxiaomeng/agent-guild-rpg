import { io, type Socket } from "socket.io-client";
import type { ChatMessage } from "../../lib/api-client";
import { getRealtimeUrl } from "../../lib/realtime-url";

export type ChatConnectionState = "connecting" | "connected" | "disconnected";

export function createChatSocket({
  roomId,
  token,
  onMessage,
  onConnectionState
}: {
  roomId: string;
  token?: string;
  onMessage: (message: ChatMessage) => void;
  onConnectionState?: (state: ChatConnectionState) => void;
}): { disconnect: () => void } {
  let socket: Socket | undefined;
  onConnectionState?.("connecting");

  try {
    socket = io(getRealtimeUrl(), {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      auth: token ? { token } : undefined,
      withCredentials: true
    });

    socket.on("connect", () => {
      onConnectionState?.("connected");
      socket?.emit("chat:subscribe", { roomId });
    });
    socket.on("disconnect", () => onConnectionState?.("disconnected"));
    socket.on("connect_error", () => onConnectionState?.("disconnected"));
    socket.on("chat:message", (message: ChatMessage) => {
      if (message?.roomId === roomId) {
        onMessage(message);
      }
    });
  } catch {
    onConnectionState?.("disconnected");
  }

  return {
    disconnect() {
      socket?.emit("chat:unsubscribe", { roomId });
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = undefined;
      onConnectionState?.("disconnected");
    }
  };
}
