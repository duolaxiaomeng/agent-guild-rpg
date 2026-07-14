import { io, type Socket } from "socket.io-client";
import { getRealtimeUrl } from "../../lib/realtime-url";

export type ClassroomConnectionState = "connecting" | "connected" | "disconnected";

export type ClassroomStageUpdatePayload = {
  sessionId: string;
  version: number;
  serverNow: string;
  status?: "draft" | "live" | "completed";
  currentStage?: import("contracts").ClassroomStage | null;
};

export type ClassroomHelpUpdatePayload = {
  sessionId: string;
  version: number;
  serverNow: string;
  helpRequest: import("contracts").HelpRequest;
};

export function createClassroomSocket({
  token,
  sessionId,
  onStageUpdate,
  onHelpUpdate,
  onConnectionState,
  initialVersion = 0
}: {
  token: string;
  sessionId: string;
  onStageUpdate?: (payload: ClassroomStageUpdatePayload) => void;
  onHelpUpdate?: (payload: ClassroomHelpUpdatePayload) => void;
  onConnectionState?: (state: ClassroomConnectionState) => void;
  initialVersion?: number;
}): { disconnect: () => void } {
  let stageVersion = initialVersion;
  const helpVersions = new Map<string, number>();
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
      socket?.emit("classroom:subscribe", { sessionId });
    });
    socket.on("disconnect", () => onConnectionState?.("disconnected"));
    socket.on("connect_error", () => onConnectionState?.("disconnected"));
    socket.on("classroom:stage:update", (payload: ClassroomStageUpdatePayload) => {
      if (!payload || payload.sessionId !== sessionId || payload.version < stageVersion) return;
      stageVersion = payload.version;
      onStageUpdate?.(payload);
    });
    socket.on("classroom:help:update", (payload: ClassroomHelpUpdatePayload) => {
      if (!payload || payload.sessionId !== sessionId) return;
      const currentVersion = helpVersions.get(payload.helpRequest.id) ?? -1;
      if (payload.version < currentVersion) return;
      helpVersions.set(payload.helpRequest.id, payload.version);
      onHelpUpdate?.(payload);
    });
  } catch {
    onConnectionState?.("disconnected");
  }

  return {
    disconnect() {
      socket?.emit("classroom:unsubscribe", { sessionId });
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = undefined;
      onConnectionState?.("disconnected");
    }
  };
}
