import { Peer, DataConnection } from 'peerjs';
import {
  NetworkPacket,
  PacketType,
  PlayerJoinPacket,
  PlayerLeavePacket,
  PlayerUpdatePacket,
  ChatBubblePacket,
  TimeSyncPacket,
  TelescopeSpawnPacket,
  TelescopeStatePacket,
  TelescopeSeizePacket,
  CampPhotoSharePacket,
} from './NetworkProtocol';

export type PacketCallback<T extends NetworkPacket> = (packet: T, senderId: string) => void;

export class NetworkManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  public localId: string = '';
  public localName: string = '';
  public localColor: string = '#facc15';
  public localHatType: number = 0;
  public roomId: string | null = null;
  public isHost: boolean = false;

  private packetHandlers: Map<PacketType, Set<PacketCallback<any>>> = new Map();
  private onConnectCallbacks: Set<(peerId: string) => void> = new Set();
  private onDisconnectCallbacks: Set<(peerId: string) => void> = new Set();

  constructor() {
    // Generate a default player profile
    const savedName = localStorage.getItem('stargazer_player_name');
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.localName = savedName || `星野觀星者_${rand}`;
    const colors = ['#facc15', '#06b6d4', '#f43f5e', '#a855f7', '#fb923c', '#4ade80'];
    this.localColor = colors[Math.floor(Math.random() * colors.length)];
    this.localHatType = Math.floor(Math.random() * 5);
  }

  public setPlayerProfile(name: string, color: string, hatType: number) {
    this.localName = name;
    this.localColor = color;
    this.localHatType = hatType;
    localStorage.setItem('stargazer_player_name', name);
  }

  public on<T extends NetworkPacket>(type: PacketType, callback: PacketCallback<T>): () => void {
    if (!this.packetHandlers.has(type)) {
      this.packetHandlers.set(type, new Set());
    }
    this.packetHandlers.get(type)!.add(callback);
    return () => {
      this.packetHandlers.get(type)?.delete(callback);
    };
  }

  public onPeerConnect(callback: (peerId: string) => void) {
    this.onConnectCallbacks.add(callback);
    return () => this.onConnectCallbacks.delete(callback);
  }

  public onPeerDisconnect(callback: (peerId: string) => void) {
    this.onDisconnectCallbacks.add(callback);
    return () => this.onDisconnectCallbacks.delete(callback);
  }

  /** Create a new room as Host */
  public createRoom(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      // Generate clean 5-digit room code, e.g. STAR-8821
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const code = `STAR-${randSuffix}`;
      const peerId = `stargazer-room-${code}`;

      this.isHost = true;
      this.roomId = code;

      this.peer = new Peer(peerId, {
        debug: 1,
      });

      this.peer.on('open', (id) => {
        this.localId = id;
        this.setupHostListeners();
        resolve(code);
      });

      this.peer.on('error', (err) => {
        console.error('[Network] PeerJS host error:', err);
        reject(err);
      });
    });
  }

  /** Join an existing room as Guest */
  public joinRoom(roomCode: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      let code = roomCode.trim().toUpperCase();
      // If user only typed numbers (e.g. "8821"), automatically prepend "STAR-"
      if (/^\d+$/.test(code)) {
        code = `STAR-${code}`;
      }
      const hostPeerId = `stargazer-room-${code}`;

      this.isHost = false;
      this.roomId = code;

      this.peer = new Peer({
        debug: 1,
      });

      this.peer.on('open', (id) => {
        this.localId = id;
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true,
        });

        conn.on('open', () => {
          this.registerConnection(conn);
          resolve(code);
        });

        conn.on('error', (err) => {
          console.error('[Network] Connection to host failed:', err);
          reject(err);
        });

        setTimeout(() => {
          if (!this.connections.has(hostPeerId)) {
            reject(new Error('連線逾時，請檢查房間代碼是否正確或房主是否在線'));
          }
        }, 8000);
      });

      this.peer.on('error', (err) => {
        console.error('[Network] PeerJS guest error:', err);
        reject(err);
      });
    });
  }

  private setupHostListeners() {
    if (!this.peer) return;

    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.registerConnection(conn);
      });
    });
  }

  private registerConnection(conn: DataConnection) {
    this.connections.set(conn.peer, conn);

    conn.on('data', (data: any) => {
      this.handleIncomingData(data, conn.peer);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.notifyLeave(conn.peer);
      this.onDisconnectCallbacks.forEach((cb) => cb(conn.peer));
    });

    conn.on('error', (err) => {
      console.warn(`[Network] Peer ${conn.peer} error:`, err);
      this.connections.delete(conn.peer);
      this.notifyLeave(conn.peer);
    });

    this.onConnectCallbacks.forEach((cb) => cb(conn.peer));
  }

  private handleIncomingData(packet: NetworkPacket, senderPeerId: string) {
    if (!packet || !packet.type) return;

    // Trigger local listeners
    const handlers = this.packetHandlers.get(packet.type);
    if (handlers) {
      handlers.forEach((cb) => cb(packet, senderPeerId));
    }

    // If we are Host, relay broadcast packets to other peers (Star topology relay)
    if (this.isHost) {
      this.broadcastExcept(packet, senderPeerId);
    }
  }

  private notifyLeave(peerId: string) {
    const leavePacket: PlayerLeavePacket = {
      type: PacketType.PLAYER_LEAVE,
      id: peerId,
    };
    const handlers = this.packetHandlers.get(PacketType.PLAYER_LEAVE);
    if (handlers) {
      handlers.forEach((cb) => cb(leavePacket, peerId));
    }
    if (this.isHost) {
      this.broadcast(leavePacket);
    }
  }

  /** Send a packet to all connected peers */
  public broadcast(packet: NetworkPacket) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(packet);
      }
    });
  }

  /** Send packet to all except one peer */
  public broadcastExcept(packet: NetworkPacket, exceptPeerId: string) {
    this.connections.forEach((conn, id) => {
      if (id !== exceptPeerId && conn.open) {
        conn.send(packet);
      }
    });
  }

  /** Send a packet directly to a specific peer */
  public sendTo(peerId: string, packet: NetworkPacket) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(packet);
    }
  }

  public isConnected(): boolean {
    return Boolean(this.peer && !this.peer.destroyed && (this.isHost || this.connections.size > 0));
  }

  public getConnectedPeerCount(): number {
    return this.connections.size + (this.isConnected() ? 1 : 0);
  }

  public disconnect() {
    this.connections.forEach((c) => c.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.roomId = null;
    this.isHost = false;
    this.localId = '';
  }
}
