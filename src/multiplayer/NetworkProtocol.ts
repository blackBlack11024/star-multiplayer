/**
 * Network protocol definitions for Stargazer Simulator Multiplayer.
 */

export enum PacketType {
  PLAYER_JOIN = 'PLAYER_JOIN',
  PLAYER_LEAVE = 'PLAYER_LEAVE',
  PLAYER_UPDATE = 'PLAYER_UPDATE',
  CHAT_BUBBLE = 'CHAT_BUBBLE',
  TIME_SYNC = 'TIME_SYNC',
  TELESCOPE_SPAWN = 'TELESCOPE_SPAWN',
  TELESCOPE_STATE = 'TELESCOPE_STATE',
  TELESCOPE_SEIZE = 'TELESCOPE_SEIZE',
  CAMP_PHOTO_SHARE = 'CAMP_PHOTO_SHARE',
}

export type PlayerPosture = 'stand' | 'walk' | 'run' | 'lie_down' | 'in_telescope';

export interface PlayerJoinPacket {
  type: PacketType.PLAYER_JOIN;
  id: string;
  name: string;
  color: string;
  hatType: number;
  pos: [number, number, number];
  telescopeLevel: number;
}

export interface PlayerLeavePacket {
  type: PacketType.PLAYER_LEAVE;
  id: string;
}

export interface PlayerUpdatePacket {
  type: PacketType.PLAYER_UPDATE;
  id: string;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  posture: PlayerPosture;
  laserActive: boolean;
  laserDir?: [number, number, number];
  laserTarget?: string;
}

export interface ChatBubblePacket {
  type: PacketType.CHAT_BUBBLE;
  id: string;
  text: string;
}

export interface TimeSyncPacket {
  type: PacketType.TIME_SYNC;
  timeScale: number;
  gameTimeMs: number;
  senderId: string;
  isStarTrailAccelerating?: boolean;
}

export interface TelescopeSpawnPacket {
  type: PacketType.TELESCOPE_SPAWN;
  telescopeId: string;
  ownerId: string;
  ownerName: string;
  level: number;
  pos: [number, number, number];
  rotY: number;
}

export interface TelescopeStatePacket {
  type: PacketType.TELESCOPE_STATE;
  telescopeId: string;
  ra: number;
  dec: number;
  fov: number;
  isLocked: boolean;
  operatorId: string | null;
  laserMounted?: boolean;
}

export interface TelescopeSeizePacket {
  type: PacketType.TELESCOPE_SEIZE;
  telescopeId: string;
  newOperatorId: string;
  previousOperatorId: string | null;
}

export interface CampPhotoSharePacket {
  type: PacketType.CAMP_PHOTO_SHARE;
  id: string;
  photographerName: string;
  targetName: string;
  targetType: string;
  exposureSeconds: number;
  quality: string;
  timestamp: string;
  imageDataUrl: string;
  locationName: string;
  telescopeLevel: number;
}

export type NetworkPacket =
  | PlayerJoinPacket
  | PlayerLeavePacket
  | PlayerUpdatePacket
  | ChatBubblePacket
  | TimeSyncPacket
  | TelescopeSpawnPacket
  | TelescopeStatePacket
  | TelescopeSeizePacket
  | CampPhotoSharePacket;
