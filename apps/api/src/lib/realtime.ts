import type { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export function setIO(instance: SocketIOServer) {
  io = instance;
}

/** Emits an event scoped to a society's room, e.g. for live parking/guest updates. */
export function emitToSociety(societyId: string, event: string, payload: unknown) {
  io?.to(`society:${societyId}`).emit(event, payload);
}
