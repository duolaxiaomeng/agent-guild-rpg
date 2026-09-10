import { Injectable } from "@nestjs/common";

/**
 * Runtime presence is deliberately kept in memory: a user is online only while
 * at least one authenticated browser socket is connected to this API instance.
 */
@Injectable()
export class PresenceService {
  private readonly socketIdsByUser = new Map<string, Set<string>>();
  private readonly zoneByUser = new Map<string, string>();

  connect(userId: string, socketId: string) {
    const sockets = this.socketIdsByUser.get(userId) ?? new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(socketId);
    this.socketIdsByUser.set(userId, sockets);
    return wasOffline;
  }

  disconnect(userId: string, socketId: string) {
    const sockets = this.socketIdsByUser.get(userId);
    if (!sockets) return false;

    sockets.delete(socketId);
    if (sockets.size > 0) return false;

    this.socketIdsByUser.delete(userId);
    return true;
  }

  isOnline(userId: string) {
    return (this.socketIdsByUser.get(userId)?.size ?? 0) > 0;
  }

  onlineUserIds() {
    return [...this.socketIdsByUser.keys()];
  }

  setZone(userId: string, zone: string) {
    this.zoneByUser.set(userId, zone);
  }

  getZone(userId: string) {
    return this.zoneByUser.get(userId);
  }

  clear() {
    this.socketIdsByUser.clear();
    this.zoneByUser.clear();
  }
}
