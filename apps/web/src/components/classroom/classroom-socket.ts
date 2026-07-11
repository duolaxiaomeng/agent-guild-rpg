import { io, type Socket } from "socket.io-client";

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

function getWsUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

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
  let helpVersion = initialVersion;
  let socket: Socket | undefined;
  onConnectionState?.("connecting");

  try {
    socket = io(getWsUrl(), {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      auth: token ? { token } : undefined
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
      if (!payload || payload.sessionId !== sessionId || payload.version < helpVersion) return;
      helpVersion = payload.version;
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
