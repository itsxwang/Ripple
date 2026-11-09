export type RoomKind = "private" | "duo" | "party";
export type JoinPolicy = "open" | "request";
export type MemberRole = "host" | "admin" | "member";
export type ScreenSharePolicy = "open" | "admins" | "off";

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
}

export interface Restriction {
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  photo?: string;
  photoFull?: string;
  color: string;
  media: MediaState;
  isSelf?: boolean;
  role: MemberRole;
  handRaised: boolean;
  restricted: Restriction;
}

/** Purely local: what this viewer has chosen to hear/see. */
export interface LocalMute {
  audio: boolean;
  video: boolean;
}

export interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  fromAvatar: string;
  fromPhoto?: string;
  fromColor: string;
  to?: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface Reaction {
  id: string;
  from: string;
  userId: string;
  name: string;
  emoji?: string;
  gif?: string;
  ts: number;
  /** Assigned client-side so concurrent reactions never overlap. */
  lane?: number;
}

export interface BanInfo {
  userId: string;
  name?: string | null;
  avatar?: string | null;
  photo?: string | null;
  expiresAt: number | null;
  reason?: string | null;
  bannedBy: string;
}

export interface JoinRequest {
  userId: string;
  name: string;
  avatar: string;
  photo?: string;
  photoFull?: string;
  color: string;
  ts: number;
}

export interface RoomInfo {
  id: string;
  kind: RoomKind;
  maxSize: number;
  hostId: string;
  joinPolicy: JoinPolicy;
  screenShare: ScreenSharePolicy;
  admins: string[];
  createdAt: number;
  bans: BanInfo[];
  requests: JoinRequest[];
}

export interface Profile {
  name: string;
  avatar: string;
  color: string;
  photo?: string;
  photoFull?: string;
}

export interface Prefs {
  micOn: boolean;
  camOn: boolean;
  reactionsVisible: boolean;
  reactionSounds: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}

export interface Presence {
  online: number;
  totalUsers: number;
  rooms: number;
  waiting: number;
  inCalls: number;
}

export interface DiscoverRoom {
  id: string;
  kind: RoomKind;
  members: number;
  maxSize: number;
  hostName: string | null;
  hostPhoto: string | null;
  hostAvatar: string | null;
  hostColor: string | null;
  createdAt: number;
}

export type JoinIntent =
  | { type: "create"; kind?: "private" | "party"; joinPolicy?: JoinPolicy }
  | { type: "join"; roomId: string }
  | { type: "random"; mode: "duo" | "party" };

export interface Toast {
  id: string;
  kind: "join" | "leave" | "error" | "info";
  title: string;
  subtitle?: string;
  avatar?: string;
  color?: string;
  photo?: string;
}

export interface TypingEntry {
  from: string;
  userId?: string;
  name: string;
  to?: string;
  ts: number;
}

export type TypingMap = Record<string, TypingEntry>;

export interface AdminActionPayload {
  action:
    | "kick"
    | "ban"
    | "unban"
    | "mute"
    | "unmute"
    | "cameraOff"
    | "cameraOn"
    | "screenOff"
    | "screenOn"
    | "muteAll"
    | "clearRestrictions"
    | "promote"
    | "demote"
    | "revokeAll"
    | "setPolicy"
    | "setScreenPolicy"
    | "approve"
    | "deny";
  targetUserId?: string;
  durationMs?: number;
  reason?: string;
  policy?: JoinPolicy;
  screenPolicy?: ScreenSharePolicy;
}
