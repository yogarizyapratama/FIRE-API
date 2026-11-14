import { FireContext } from '../types';

export interface FireWebSocket {
  id: string;
  data: Record<string, any>;
  send(message: any): void;
  close(code?: number, reason?: string): void;
  join(room: string): void;
  leave(room: string): void;
  publish(room: string, message: any, excludeSelf?: boolean): void;
  broadcast(message: any, excludeSelf?: boolean): void;
}

export interface FireWebSocketHandler {
  open?(ws: FireWebSocket, ctx: FireContext): void | Promise<void>;
  message?(ws: FireWebSocket, message: any, ctx: FireContext): void | Promise<void>;
  close?(ws: FireWebSocket, code: number, reason: string, ctx: FireContext): void | Promise<void>;
}

export class MockWebSocket {
  public receivedMessages: string[] = [];
  public isClosed = false;

  constructor(public id: string) {}

  public send(msg: string): void {
    if (!this.isClosed) {
      this.receivedMessages.push(msg);
    }
  }

  public close(): void {
    this.isClosed = true;
  }
}

export class WebSocketHub {
  private clients: Map<string, FireWebSocket> = new Map();
  private rooms: Map<string, Set<string>> = new Map(); // room -> Set of client IDs

  public register(rawSocket: any, id?: string): FireWebSocket {
    const socketId = id || rawSocket.id || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const joinedRooms: Set<string> = new Set();
    const data: Record<string, any> = {};

    const fireWs: FireWebSocket = {
      id: socketId,
      data,

      send(message: any) {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        rawSocket.send(payload);
      },

      close(code = 1000, reason = '') {
        rawSocket.close(code, reason);
      },

      join: (room: string) => {
        joinedRooms.add(room);
        if (!this.rooms.has(room)) {
          this.rooms.set(room, new Set());
        }
        this.rooms.get(room)!.add(socketId);
      },

      leave: (room: string) => {
        joinedRooms.delete(room);
        const roomClients = this.rooms.get(room);
        if (roomClients) {
          roomClients.delete(socketId);
          if (roomClients.size === 0) {
            this.rooms.delete(room);
          }
        }
      },

      publish: (room: string, message: any, excludeSelf = true) => {
        const targetIds = this.rooms.get(room);
        if (!targetIds) return;

        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        for (const targetId of targetIds) {
          if (excludeSelf && targetId === socketId) continue;
          const targetClient = this.clients.get(targetId);
          if (targetClient) {
            targetClient.send(payload);
          }
        }
      },

      broadcast: (message: any, excludeSelf = false) => {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        for (const [targetId, targetClient] of this.clients.entries()) {
          if (excludeSelf && targetId === socketId) continue;
          targetClient.send(payload);
        }
      },
    };

    this.clients.set(socketId, fireWs);
    return fireWs;
  }

  public unregister(socketId: string): void {
    this.clients.delete(socketId);
    for (const [room, clientSet] of this.rooms.entries()) {
      clientSet.delete(socketId);
      if (clientSet.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  public getClient(id: string): FireWebSocket | undefined {
    return this.clients.get(id);
  }
}
