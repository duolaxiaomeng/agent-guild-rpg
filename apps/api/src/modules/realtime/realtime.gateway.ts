import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

export type PresencePayload = {
  userId: string;
  location: string;
  state: string;
};

@WebSocketGateway({
  cors: { origin: "*" }
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  broadcastPresence(payload: PresencePayload) {
    this.server.emit("presence:update", payload);
  }
}
