export type RoomKind = "private" | "duo" | "party";
export type JoinPolicy = "open" | "request";
export type LobbyMode = "duo" | "party" | "private";

/** Remembered lobby choices, so people don't reselect them every visit. */
export interface LobbyPrefs {
  mode: LobbyMode;
  joinPolicy: JoinPolicy;
}
export type MemberRole = "host" | "admin" | "member";
export type ScreenSharePolicy = "open" | "admins" | "off";
export type DmBlockScope = "room" | "all";

/** A viewer-side block on direct messages from one member. */
export interface DmBlock {
  userId: string;
  name: string;
  avatar: string;
  photo?: string;
  color: string;
  scope: DmBlockScope;
  /** Set only when scope is "room". */
  roomId?: string;
  ts: number;
}

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

/** Snapshot of the message a chat message replies to. */
export interface ChatReply {
  id: string;
  name: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  from: string;
  /** Stable profile id of the sender, so local blocks survive socket changes. */
  fromUserId?: string;
  fromName: string;
  fromAvatar: string;
  fromPhoto?: string;
  fromColor: string;
  to?: string;
  text: string;
  ts: number;
  system?: boolean;
  /** Quoted message this one replies to. */
  replyTo?: ChatReply;
  /** Client-only marker for messages that arrived live (not room history). */
  receivedAt?: number;
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
  /** Toast for messages sent to the whole room. */
  notifyEveryone: boolean;
  /** Master switch for direct-message toasts. */
  notifyDms: boolean;
  /** Per-member overrides; false mutes that member's DM toasts. */
  dmNotifyOverrides: Record<string, boolean>;
  /** Viewer-side DM blocks keyed by the blocked member's stable userId. */
  dmBlocks: Record<string, DmBlock>;
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
  /** Chat message this toast points at; clicking opens it in the panel. */
  action?: {
    messageId: string;
    conversation: string;
  };
}

export interface TypingEntry {
  from: string;
  userId?: string;
  name: string;
  to?: string;
  ts: number;
}

export type TypingMap = Record<string, TypingEntry>;

/** A toast click target: which message to reveal in the chat panel. */
export interface FocusMessage {
  id: string;
  nonce: number;
}

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
