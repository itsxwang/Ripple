import { Server, Socket } from "socket.io";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { randomBytes, randomUUID } from "crypto";
import {
  addAdmin,
  addBan,
  clearAdmins,
  countUsers,
  getBan,
  listAdmins,
  listBans,
  loadHistory,
  loadRoom,
  pruneRooms,
  removeAdmin,
  removeBan,
  saveHost,
  saveMessage,
  savePolicy,
  saveRoom,
  saveScreenPolicy,
  touchUser,
} from "./db";

dotenv.config();

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 3000;
const MAX_PRIVATE = 8;
const MAX_DUO = 2;
const MAX_PARTY = 6;
const HISTORY_LIMIT = 80;
const MESSAGE_LIMIT = 2000;
const PHOTO_LIMIT = 420_000;
const FULL_PHOTO_LIMIT = 900_000;
const GIF_LIMIT = 1_600_000;
const REACTION_COOLDOWN = 180;

const REACTION_EMOJIS = [
  "❤️", "😂", "🔥", "👏", "😮", "🎉", "💯", "🙌",
  "😍", "🥰", "😎", "🤯", "😭", "😅", "🤔", "🫡",
  "👀", "💀", "🤡", "👻", "🤖", "🐶", "🐱", "🦊",
  "🐼", "🦄", "🌈", "⚡", "✨", "💥", "🌟", "🎯",
  "🏆", "🍕", "🍿", "☕", "🍻", "🎵", "🎮", "🚀",
  "💜", "💚", "💙", "🧡", "🤍", "🖤", "👑", "🤝",
];
const REACTION_SET = new Set(REACTION_EMOJIS);

type RoomKind = "private" | "duo" | "party";
type JoinPolicy = "open" | "request";
type ScreenSharePolicy = "open" | "admins" | "off";
type Role = "host" | "admin" | "member";

interface MediaState {
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
}

interface UserInfo {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  photo?: string;
  photoFull?: string;
  color: string;
  media: MediaState;
  handRaised: boolean;
  joinedAt: number;
}

interface ChatMessage {
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

interface PendingRequest {
  userId: string;
  socketId: string;
  name: string;
  avatar: string;
  photo?: string;
  photoFull?: string;
  color: string;
  media: MediaState;
  ts: number;
}

interface Restriction {
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

interface Room {
  id: string;
  kind: RoomKind;
  maxSize: number;
  hostId: string;
  joinPolicy: JoinPolicy;
  screenShare: ScreenSharePolicy;
  members: Map<string, UserInfo>;
  history: ChatMessage[];
  pending: Map<string, PendingRequest>;
  admins: Set<string>;
  restrictions: Map<string, Restriction>;
  createdAt: number;
  persisted: boolean;
}

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
const socketIdentity = new Map<string, string>();
const lastReaction = new Map<string, number>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function cleanUserId(value: unknown): string {
  const candidate = cleanText(value, 64);
  if (/^[A-Za-z0-9_-]{8,64}$/.test(candidate)) return candidate;
  return randomUUID();
}

function cleanPhoto(value: unknown, limit = PHOTO_LIMIT): string | undefined {
  const photo = String(value ?? "");
  if (!photo) return undefined;
  if (photo.length > limit) return undefined;
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
    return undefined;
  }
  return photo;
}

function cleanScreenPolicy(value: unknown): ScreenSharePolicy {
  return value === "admins" || value === "off" ? value : "open";
}

function cleanMedia(value: unknown): MediaState {
  const media = (value ?? {}) as Partial<MediaState>;
  return {
    micOn: Boolean(media.micOn),
    camOn: Boolean(media.camOn),
    screenOn: Boolean(media.screenOn),
  };
}

interface ProfilePayload {
  name: string;
  avatar: string;
  photo?: string;
  photoFull?: string;
  color: string;
  media: MediaState;
}

function readProfile(value: unknown): ProfilePayload {
  const profile = (value ?? {}) as Record<string, unknown>;
  return {
    name: cleanText(profile.name, 28) || "Guest",
    avatar: cleanText(profile.avatar, 16) || "🦊",
    photo: cleanPhoto(profile.photo),
    photoFull: cleanPhoto(profile.photoFull, FULL_PHOTO_LIMIT),
    color: cleanText(profile.color, 24) || "aurora",
    media: cleanMedia(profile.media),
  };
}

function roleFor(room: Room, userId: string): Role {
  if (room.hostId && room.hostId === userId) return "host";
  if (room.admins.has(userId)) return "admin";
  return "member";
}

function canAdmin(room: Room, userId: string): boolean {
  return roleFor(room, userId) !== "member";
}

/**
 * Screen sharing is governed by a room policy (party rooms) and by a
 * per-member restriction. Hosts/admins can always override the policy.
 */
function canShareScreen(room: Room, userId: string): boolean {
  const restriction = room.restrictions.get(userId);
  if (restriction?.screen || restriction?.cam) return false;
  if (canAdmin(room, userId)) return true;
  if (room.kind !== "party") return true;
  return room.screenShare === "open";
}

function findMember(
  room: Room,
  userId: string,
): UserInfo | undefined {
  for (const member of room.members.values()) {
    if (member.userId === userId) return member;
  }
  return undefined;
}

function memberPayload(room: Room, member: UserInfo) {
  return {
    id: member.id,
    userId: member.userId,
    name: member.name,
    avatar: member.avatar,
    photo: member.photo,
    photoFull: member.photoFull,
    color: member.color,
    media: member.media,
    handRaised: member.handRaised,
    role: roleFor(room, member.userId),
    restricted: room.restrictions.get(member.userId) ?? {
      mic: false,
      cam: false,
      screen: false,
    },
  };
}

function roomInfo(room: Room) {
  return {
    id: room.id,
    kind: room.kind,
    maxSize: room.maxSize,
    hostId: room.hostId,
    joinPolicy: room.joinPolicy,
    screenShare: room.screenShare,
    admins: Array.from(room.admins),
    createdAt: room.createdAt,
    bans: listBans(room.id),
    requests: Array.from(room.pending.values())
      .sort((a, b) => a.ts - b.ts)
      .map((request) => ({
        userId: request.userId,
        name: request.name,
        avatar: request.avatar,
        photo: request.photo,
        photoFull: request.photoFull,
        color: request.color,
        ts: request.ts,
      })),
  };
}

function systemMessage(text: string): ChatMessage {
  return {
    id: randomUUID(),
    from: "system",
    fromName: "Ripple",
    fromAvatar: "🌊",
    fromColor: "aurora",
    text,
    ts: Date.now(),
    system: true,
  };
}

function pushHistory(room: Room, message: ChatMessage) {
  room.history.push(message);
  if (room.history.length > HISTORY_LIMIT) {
    room.history.splice(0, room.history.length - HISTORY_LIMIT);
  }
  saveMessage({
    id: message.id,
    roomId: room.id,
    from: message.from,
    fromName: message.fromName,
    fromAvatar: message.fromAvatar,
    fromPhoto: message.fromPhoto,
    fromColor: message.fromColor,
    to: message.to,
    text: message.text,
    ts: message.ts,
    system: Boolean(message.system),
  });
}

function broadcastStats(io: Server) {
  let inCalls = 0;
  let waiting = 0;
  for (const room of rooms.values()) {
    inCalls += room.members.size;
    if (room.kind !== "private") waiting += 1;
  }
  io.emit("presence", {
    online: io.engine.clientsCount,
    totalUsers: countUsers(),
    rooms: rooms.size,
    waiting,
    inCalls,
  });
}

function broadcastRoom(io: Server, room: Room) {
  io.to(room.id).emit("room:updated", { room: roomInfo(room) });
}

function emitAdmins(
  io: Server,
  room: Room,
  event: string,
  payload: unknown,
) {
  const sent = new Set<string>();
  for (const member of room.members.values()) {
    if (!canAdmin(room, member.userId) || sent.has(member.id)) continue;
    sent.add(member.id);
    io.to(member.id).emit(event, payload);
  }
}

function persistRoom(room: Room) {
  if (!room.persisted) return;
  saveRoom({
    id: room.id,
    kind: room.kind,
    hostId: room.hostId,
    maxSize: room.maxSize,
    joinPolicy: room.joinPolicy,
    screenShare: room.screenShare,
    createdAt: room.createdAt,
  });
}

function resolveRoom(roomId: string): Room | undefined {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const stored = loadRoom(roomId);
  if (!stored) return undefined;

  const history = loadHistory(roomId, HISTORY_LIMIT).map((message) => ({
    id: message.id,
    from: message.from,
    fromName: message.fromName,
    fromAvatar: message.fromAvatar,
    fromPhoto: message.fromPhoto ?? undefined,
    fromColor: message.fromColor,
    to: message.to ?? undefined,
    text: message.text,
    ts: message.ts,
    system: message.system,
  }));

  const room: Room = {
    id: stored.id,
    kind: stored.kind,
    maxSize: stored.maxSize,
    hostId: stored.hostId,
    joinPolicy: stored.joinPolicy,
    screenShare: stored.screenShare,
    members: new Map(),
    history,
    pending: new Map(),
    admins: new Set(listAdmins(roomId)),
    restrictions: new Map(),
    createdAt: stored.createdAt,
    persisted: true,
  };
  rooms.set(room.id, room);
  return room;
}

function leaveRoom(
  io: Server,
  socket: Socket,
  options?: { silent?: boolean; notice?: string; keepPersisted?: boolean },
) {
  const roomId = socketRoom.get(socket.id);
  socketRoom.delete(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  socket.leave(roomId);
  if (!room) return;

  const member = room.members.get(socket.id);
  room.members.delete(socket.id);
  if (member) room.restrictions.delete(member.userId);

  if (member && !options?.silent) {
    socket.to(roomId).emit("member:left", {
      id: socket.id,
      userId: member.userId,
      name: member.name,
    });
    const note = systemMessage(
      options?.notice ?? `${member.name} left the room`,
    );
    pushHistory(room, note);
    io.to(roomId).emit("chat:new", note);
  }

  let hostChanged = false;
  if (member && room.hostId === member.userId && room.members.size > 0) {
    const nextHost =
      Array.from(room.members.values()).find(
        (candidate) => room.admins.has(candidate.userId),
      ) ?? Array.from(room.members.values())[0];
    room.hostId = nextHost.userId;
    room.admins.delete(nextHost.userId);
    saveHost(room.id, room.hostId);
    removeAdmin(room.id, nextHost.userId);
    hostChanged = true;
    const note = systemMessage(
      `${nextHost.name} is now the room host`,
    );
    pushHistory(room, note);
    io.to(room.id).emit("chat:new", note);
  }

  if (hostChanged) broadcastRoom(io, room);

  if (room.members.size === 0) {
    for (const request of room.pending.values()) {
      io.to(request.socketId).emit("join:denied", {
        roomId: room.id,
        message: "The room closed before you were let in.",
      });
    }
    room.pending.clear();
    if (!room.persisted || options?.keepPersisted === false) {
      rooms.delete(room.id);
    }
  }

  broadcastStats(io);
}

function sendRoomError(
  socket: Socket,
  message: string,
  code: string,
  extra?: Record<string, unknown>,
) {
  socket.emit("room:error", { message, code, ...extra });
}

function joinRoom(
  io: Server,
  socket: Socket,
  room: Room,
  userId: string,
  profile: ProfilePayload,
): boolean {
  const ban = getBan(room.id, userId);
  if (ban) {
    sendRoomError(
      socket,
      ban.expiresAt
        ? `You are banned from this room until ${new Date(
            ban.expiresAt,
          ).toLocaleString()}.`
        : "You are permanently banned from this room.",
      "banned",
      { expiresAt: ban.expiresAt },
    );
    return false;
  }

  // One live session per profile per room. This also clears out stale
  // tabs that used to linger as ghost ("Bob") participants.
  for (const [existingId, existing] of Array.from(room.members)) {
    if (existing.userId !== userId || existingId === socket.id) continue;
    io.to(existingId).emit("session:replaced", {
      message: "This profile joined the room from another tab.",
    });
    socketRoom.delete(existingId);
    room.members.delete(existingId);
    io.sockets.sockets.get(existingId)?.leave(room.id);
    socket.to(room.id).emit("member:left", {
      id: existingId,
      userId: existing.userId,
      name: existing.name,
    });
  }

  if (room.members.size >= room.maxSize) {
    sendRoomError(socket, "That room is already full. Try another one.", "full");
    return false;
  }

  leaveRoom(io, socket, { silent: true });

  const existingMembers = Array.from(room.members.values());
  const isFirst = existingMembers.length === 0;
  const user: UserInfo = {
    id: socket.id,
    userId,
    name: profile.name,
    avatar: profile.avatar,
    photo: profile.photo,
    photoFull: profile.photoFull,
    color: profile.color,
    media: profile.media,
    handRaised: false,
    joinedAt: Date.now(),
  };

  if (!isFirst) {
    const note = systemMessage(`${user.name} joined the room`);
    pushHistory(room, note);
    socket.to(room.id).emit("chat:new", note);
  }

  room.members.set(socket.id, user);
  room.pending.delete(userId);
  socket.join(room.id);
  socketRoom.set(socket.id, room.id);
  touchUser({
    id: userId,
    name: profile.name,
    avatar: profile.avatar,
    photo: profile.photo,
    photoFull: profile.photoFull,
    color: profile.color,
  });

  socket.emit("room:joined", {
    room: roomInfo(room),
    self: memberPayload(room, user),
    members: existingMembers.map((member) => memberPayload(room, member)),
    history: room.history.slice(-HISTORY_LIMIT),
    role: roleFor(room, userId),
  });

  socket.to(room.id).emit("member:joined", {
    member: memberPayload(room, user),
  });

  broadcastRoom(io, room);
  broadcastStats(io);
  return true;
}

function createRoom(
  kind: RoomKind,
  hostId: string,
  joinPolicy: JoinPolicy,
  persisted: boolean,
): Room {
  const length = kind === "private" ? 6 : 5;
  let id = makeRoomCode(length);
  let attempts = 0;
  while (rooms.has(id) || loadRoom(id)) {
    id = makeRoomCode(length);
    attempts += 1;
    if (attempts > 20) break;
  }

  const room: Room = {
    id,
    kind,
    maxSize:
      kind === "private" ? MAX_PRIVATE : kind === "party" ? MAX_PARTY : MAX_DUO,
    hostId,
    joinPolicy,
    screenShare: "open",
    members: new Map(),
    history: [],
    pending: new Map(),
    admins: new Set(),
    restrictions: new Map(),
    createdAt: Date.now(),
    persisted,
  };
  rooms.set(id, room);
  persistRoom(room);
  return room;
}

function requestJoin(
  io: Server,
  socket: Socket,
  room: Room,
  userId: string,
  profile: ProfilePayload,
) {
  const request: PendingRequest = {
    userId,
    socketId: socket.id,
    name: profile.name,
    avatar: profile.avatar,
    photo: profile.photo,
    photoFull: profile.photoFull,
    color: profile.color,
    media: profile.media,
    ts: Date.now(),
  };
  room.pending.set(userId, request);
  socket.emit("join:pending", {
    roomId: room.id,
    room: roomInfo(room),
  });
  broadcastRoom(io, room);
  emitAdmins(io, room, "join:request", {
    request: {
      userId: request.userId,
      name: request.name,
      avatar: request.avatar,
      photo: request.photo,
      photoFull: request.photoFull,
      color: request.color,
      ts: request.ts,
    },
    room: roomInfo(room),
  });
  touchUser({
    id: userId,
    name: profile.name,
    avatar: profile.avatar,
    photo: profile.photo,
    photoFull: profile.photoFull,
    color: profile.color,
  });
}

/**
 * When a room switches to open, anyone already waiting for approval should
 * walk straight in instead of being stranded on the waiting screen.
 */
function admitPending(io: Server, room: Room) {
  for (const request of Array.from(room.pending.values())) {
    if (room.members.size >= room.maxSize) break;
    const requesterSocket = io.sockets.sockets.get(request.socketId);
    if (!requesterSocket) {
      room.pending.delete(request.userId);
      continue;
    }
    room.pending.delete(request.userId);
    joinRoom(io, requesterSocket, room, request.userId, {
      name: request.name,
      avatar: request.avatar,
      photo: request.photo,
      photoFull: request.photoFull,
      color: request.color,
      media: request.media,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  HTTP                                                              */
/* ------------------------------------------------------------------ */

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 6 * 1024 * 1024,
});

app.get("/", (_req, res) => {
  res.json({
    name: "Ripple signaling server",
    ok: true,
    online: io.engine.clientsCount,
    rooms: rooms.size,
    totalUsers: countUsers(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get("/stats", (_req, res) => {
  let inCalls = 0;
  let waiting = 0;
  for (const room of rooms.values()) {
    inCalls += room.members.size;
    if (room.kind !== "private") waiting += 1;
  }
  res.json({
    online: io.engine.clientsCount,
    totalUsers: countUsers(),
    rooms: rooms.size,
    waiting,
    inCalls,
  });
});

app.get("/rooms", (_req, res) => {
  const list = Array.from(rooms.values())
    .filter(
      (room) =>
        room.kind === "party" &&
        room.members.size > 0 &&
        room.members.size < room.maxSize &&
        room.joinPolicy === "open",
    )
    .map((room) => {
      const host = room.hostId ? findMember(room, room.hostId) : undefined;
      return {
        id: room.id,
        kind: room.kind,
        members: room.members.size,
        maxSize: room.maxSize,
        hostName: host?.name ?? null,
        hostPhoto: host?.photo ?? null,
        hostAvatar: host?.avatar ?? null,
        hostColor: host?.color ?? null,
        createdAt: room.createdAt,
      };
    })
    .sort((a, b) => b.members - a.members);
  res.json({ rooms: list });
});

/* ------------------------------------------------------------------ */
/*  Socket handlers                                                   */
/* ------------------------------------------------------------------ */

io.on("connection", (socket: Socket) => {
  console.log(
    `[socket] connected ${socket.id} (${io.engine.clientsCount} online)`,
  );
  broadcastStats(io);

  const identityFrom = (payload: unknown) => {
    const record = (payload ?? {}) as Record<string, unknown>;
    return {
      userId: cleanUserId(record.userId),
      profile: readProfile(record.profile),
    };
  };

  const actorFor = () => {
    const roomId = socketRoom.get(socket.id);
    const room = roomId ? rooms.get(roomId) : undefined;
    const member = room?.members.get(socket.id);
    if (!room || !member) return null;
    return { room, member };
  };

  /* -------------------------- create room -------------------------- */
  socket.on(
    "room:create",
    (payload: { userId?: unknown; profile?: unknown; kind?: unknown; joinPolicy?: unknown }) => {
      const { userId, profile } = identityFrom(payload);
      socketIdentity.set(socket.id, userId);
      const kind: RoomKind = payload?.kind === "party" ? "party" : "private";
      const joinPolicy: JoinPolicy =
        payload?.joinPolicy === "request" ? "request" : "open";

      leaveRoom(io, socket, { silent: true });
      const room = createRoom(kind, userId, joinPolicy, true);
      joinRoom(io, socket, room, userId, profile);
    },
  );

  /* ----------------------------- join code -------------------------- */
  socket.on(
    "room:join",
    (payload: { roomId?: unknown; userId?: unknown; profile?: unknown }) => {
      const { userId, profile } = identityFrom(payload);
      socketIdentity.set(socket.id, userId);
      const roomId = cleanText(payload?.roomId, 12).toUpperCase();
      const room = resolveRoom(roomId);

      if (!room) {
        sendRoomError(
          socket,
          "That room doesn't exist (anymore). Check the code.",
          "not_found",
        );
        return;
      }

      const ban = getBan(room.id, userId);
      if (ban) {
        sendRoomError(
          socket,
          ban.expiresAt
            ? `You're banned here until ${new Date(
                ban.expiresAt,
              ).toLocaleString()}.`
            : "You're permanently banned from this room.",
          "banned",
          { expiresAt: ban.expiresAt },
        );
        return;
      }

      if (room.members.size >= room.maxSize) {
        sendRoomError(socket, "That room is already full. Try another one.", "full");
        return;
      }

      // An empty room has nobody to approve join requests, so the first
      // person back through the door claims it. This keeps an abandoned
      // approval-only room from locking everyone out forever.
      if (room.members.size === 0) {
        if (room.hostId !== userId) {
          room.hostId = userId;
          saveHost(room.id, userId);
        }
      }

      if (room.joinPolicy === "request" && !canAdmin(room, userId)) {
        const existing = room.pending.get(userId);
        if (!existing) {
          leaveRoom(io, socket, { silent: true });
          requestJoin(io, socket, room, userId, profile);
        } else {
          room.pending.set(userId, {
            ...existing,
            socketId: socket.id,
            name: profile.name,
            avatar: profile.avatar,
            photo: profile.photo,
            photoFull: profile.photoFull,
            color: profile.color,
            media: profile.media,
          });
          socket.emit("join:pending", { roomId: room.id, room: roomInfo(room) });
        }
        return;
      }

      joinRoom(io, socket, room, userId, profile);
    },
  );

  /* --------------------------- random match ------------------------- */
  socket.on(
    "room:random",
    (payload: {
      userId?: unknown;
      profile?: unknown;
      mode?: unknown;
      ignoreRooms?: unknown;
    }) => {
      const { userId, profile } = identityFrom(payload);
      socketIdentity.set(socket.id, userId);
      const kind: RoomKind = payload?.mode === "party" ? "party" : "duo";
      const ignore = new Set(
        Array.isArray(payload?.ignoreRooms)
          ? payload.ignoreRooms
              .map((id) => cleanText(id, 12).toUpperCase())
              .filter(Boolean)
              .slice(-12)
          : [],
      );

      leaveRoom(io, socket, { silent: true });

      const candidates = Array.from(rooms.values())
        .filter(
          (room) =>
            room.kind === kind &&
            room.joinPolicy === "open" &&
            room.members.size > 0 &&
            room.members.size < room.maxSize &&
            !ignore.has(room.id) &&
            !getBan(room.id, userId) &&
            !Array.from(room.members.values()).some(
              (member) => member.userId === userId,
            ),
        )
        .sort((a, b) => b.members.size - a.members.size);

      let room: Room | undefined;
      if (candidates.length > 0) {
        const pool = candidates.slice(0, Math.min(3, candidates.length));
        room = pool[Math.floor(Math.random() * pool.length)];
      }

      if (!room) {
        room = createRoom(kind, userId, "open", false);
      }

      joinRoom(io, socket, room, userId, profile);
    },
  );

  /* --------------------------- discover ---------------------------- */
  socket.on("room:discover", () => {
    const list = Array.from(rooms.values())
      .filter(
        (room) =>
          room.kind === "party" &&
          room.members.size > 0 &&
          room.members.size < room.maxSize &&
          room.joinPolicy === "open",
      )
      .map((room) => {
        const host = room.hostId ? findMember(room, room.hostId) : undefined;
        return {
          id: room.id,
          kind: room.kind,
          members: room.members.size,
          maxSize: room.maxSize,
          hostName: host?.name ?? null,
          hostPhoto: host?.photo ?? null,
          hostAvatar: host?.avatar ?? null,
          hostColor: host?.color ?? null,
          createdAt: room.createdAt,
        };
      })
      .sort((a, b) => b.members - a.members);
    socket.emit("room:discovered", { rooms: list });
  });

  /* ------------------------------ leave ----------------------------- */
  socket.on("room:leave", () => {
    leaveRoom(io, socket);
    socketIdentity.delete(socket.id);
  });

  /* ---------------------------- signaling --------------------------- */
  socket.on("signal", (payload: { to?: unknown; data?: unknown }) => {
    const to = cleanText(payload?.to, 64);
    const data = payload?.data as
      | { type?: string; sdp?: unknown; candidate?: unknown }
      | undefined;

    if (!to || !data) return;

    const actor = actorFor();
    if (!actor || !actor.room.members.has(to)) return;

    io.to(to).emit("signal", { from: socket.id, data });
  });

  /* ----------------------------- media ------------------------------ */
  socket.on("media:update", (payload: Partial<MediaState>) => {
    const actor = actorFor();
    if (!actor) return;
    const { room, member } = actor;
    const next = { ...member.media, ...cleanMedia(payload) };
    const restriction = room.restrictions.get(member.userId);
    if (restriction?.mic) next.micOn = false;
    if (restriction?.cam) {
      next.camOn = false;
      next.screenOn = false;
    }
    if (restriction?.screen) next.screenOn = false;
    if (next.screenOn && !canShareScreen(room, member.userId)) {
      next.screenOn = false;
    }
    if (payload?.screenOn && !canShareScreen(room, member.userId)) {
      socket.emit("screen:stop", {
        message: restriction?.screen
          ? "A host turned off screen sharing for you."
          : room.screenShare === "admins"
            ? "Only hosts and admins can share their screen in this room."
            : "Screen sharing is turned off in this room.",
      });
    }
    member.media = next;
    io.to(room.id).emit("member:updated", {
      id: member.id,
      userId: member.userId,
      media: member.media,
      handRaised: member.handRaised,
      restricted: restriction ?? { mic: false, cam: false, screen: false },
    });
  });

  /* ---------------------------- chat -------------------------------- */
  socket.on(
    "chat:send",
    (payload: { text?: unknown; to?: unknown }) => {
      const actor = actorFor();
      if (!actor) return;
      const { room, member } = actor;

      const text = cleanMultiline(payload?.text, MESSAGE_LIMIT);
      if (!text) return;

      const to = cleanText(payload?.to, 64) || undefined;
      if (to && !room.members.has(to)) return;

      const message: ChatMessage = {
        id: randomUUID(),
        from: member.id,
        fromName: member.name,
        fromAvatar: member.avatar,
        fromPhoto: member.photo,
        fromColor: member.color,
        to,
        text,
        ts: Date.now(),
      };

      if (to) {
        // Direct messages are delivered live only — never written to disk.
        io.to(to).emit("chat:new", message);
        socket.emit("chat:new", message);
      } else {
        pushHistory(room, message);
        io.to(room.id).emit("chat:new", message);
      }
    },
  );

  socket.on("chat:typing", (payload: { to?: unknown }) => {
    const actor = actorFor();
    if (!actor) return;
    const { room, member } = actor;

    const to = cleanText(payload?.to, 64) || undefined;
    if (to && !room.members.has(to)) return;

    const typing = {
      from: member.id,
      userId: member.userId,
      name: member.name,
      to,
      ts: Date.now(),
    };

    if (to) {
      io.to(to).emit("chat:typing", typing);
    } else {
      socket.to(room.id).emit("chat:typing", typing);
    }
  });

  /* --------------------------- reactions ---------------------------- */
  socket.on("reaction", (payload: { emoji?: unknown; gif?: unknown }) => {
    const actor = actorFor();
    if (!actor) return;
    const { room, member } = actor;

    const now = Date.now();
    if (now - (lastReaction.get(socket.id) ?? 0) < REACTION_COOLDOWN) return;
    lastReaction.set(socket.id, now);

    const emoji = cleanText(payload?.emoji, 8);
    const gif = String(payload?.gif ?? "");

    let reaction: {
      id: string;
      from: string;
      userId: string;
      name: string;
      emoji?: string;
      gif?: string;
      ts: number;
    };

    if (emoji && REACTION_SET.has(emoji)) {
      reaction = {
        id: randomUUID(),
        from: member.id,
        userId: member.userId,
        name: member.name,
        emoji,
        ts: now,
      };
    } else if (
      gif.length > 0 &&
      gif.length <= GIF_LIMIT &&
      /^data:image\/(gif|webp|png);base64,[A-Za-z0-9+/=]+$/.test(gif)
    ) {
      reaction = {
        id: randomUUID(),
        from: member.id,
        userId: member.userId,
        name: member.name,
        gif,
        ts: now,
      };
    } else {
      return;
    }

    io.to(room.id).emit("reaction", reaction);
  });

  /* -------------------------- hand raise ---------------------------- */
  socket.on("hand:raise", () => {
    const actor = actorFor();
    if (!actor) return;
    const { room, member } = actor;
    member.handRaised = !member.handRaised;
    io.to(room.id).emit("hand:updated", {
      id: member.id,
      userId: member.userId,
      raised: member.handRaised,
    });
  });

  /* --------------------------- admin -------------------------------- */
  socket.on(
    "admin:action",
    (payload: {
      action?: unknown;
      targetUserId?: unknown;
      durationMs?: unknown;
      reason?: unknown;
      policy?: unknown;
      screenPolicy?: unknown;
    }) => {
      const actor = actorFor();
      if (!actor) return;
      const { room, member } = actor;
      if (!canAdmin(room, member.userId)) {
        socket.emit("admin:error", { message: "Only hosts and admins can do that." });
        return;
      }

      const action = cleanText(payload?.action, 32);
      const targetUserId = cleanText(payload?.targetUserId, 64);
      const target = targetUserId ? findMember(room, targetUserId) : undefined;
      const targetRole = target ? roleFor(room, target.userId) : "member";

      const guardHost = () => {
        if (targetRole === "host" && member.userId !== room.hostId) {
          socket.emit("admin:error", {
            message: "Only the host can manage the host.",
          });
          return false;
        }
        if (targetRole === "host") {
          socket.emit("admin:error", {
            message: "The host can't be removed. Revoke all admins to decentralize the room.",
          });
          return false;
        }
        return true;
      };

      const note = (text: string) => {
        const message = systemMessage(text);
        pushHistory(room, message);
        io.to(room.id).emit("chat:new", message);
      };

      switch (action) {
        case "kick": {
          if (!target || !guardHost()) return;
          const targetSocket = io.sockets.sockets.get(target.id);
          if (!targetSocket) return;
          io.to(target.id).emit("room:kicked", {
            message: `${member.name} removed you from the room.`,
            by: member.name,
          });
          leaveRoom(io, targetSocket, {
            notice: `${target.name} was removed by ${member.name}`,
          });
          break;
        }

        case "ban": {
          if (!target || !guardHost()) return;
          const rawDuration = Number(payload?.durationMs ?? 0);
          const duration =
            Number.isFinite(rawDuration) && rawDuration > 0
              ? Math.min(rawDuration, 1000 * 60 * 60 * 24 * 365)
              : 0;
          const expiresAt = duration ? Date.now() + duration : null;
          const reason = cleanText(payload?.reason, 160) || null;
          addBan(room.id, target.userId, member.userId, reason, expiresAt);
          const targetSocket = io.sockets.sockets.get(target.id);
          if (targetSocket) {
            io.to(target.id).emit("room:banned", {
              message: expiresAt
                ? `${member.name} banned you until ${new Date(
                    expiresAt,
                  ).toLocaleString()}.`
                : `${member.name} permanently banned you.`,
              expiresAt,
            });
            leaveRoom(io, targetSocket, {
              notice: `${target.name} was banned by ${member.name}${
                expiresAt
                  ? ` for ${Math.round(duration / 60000)} min`
                  : " permanently"
              }`,
            });
          }
          broadcastRoom(io, room);
          break;
        }

        case "unban": {
          if (!targetUserId) return;
          removeBan(room.id, targetUserId);
          broadcastRoom(io, room);
          note(`A banned user was allowed back by ${member.name}`);
          break;
        }

        case "mute":
        case "unmute":
        case "cameraOff":
        case "cameraOn":
        case "screenOff":
        case "screenOn": {
          if (!target || !guardHost()) return;
          const previous = room.restrictions.get(target.userId) ?? {
            mic: false,
            cam: false,
            screen: false,
          };
          const next: Restriction = { ...previous };
          if (action === "mute") next.mic = true;
          if (action === "unmute") next.mic = false;
          if (action === "cameraOff") next.cam = true;
          if (action === "cameraOn") next.cam = false;
          if (action === "screenOff") next.screen = true;
          if (action === "screenOn") next.screen = false;
          room.restrictions.set(target.userId, next);
          if (next.mic) target.media.micOn = false;
          if (next.cam) {
            target.media.camOn = false;
            target.media.screenOn = false;
          }
          if (next.screen) target.media.screenOn = false;
          io.to(room.id).emit("restriction:updated", {
            userId: target.userId,
            mic: next.mic,
            cam: next.cam,
            screen: next.screen,
          });
          io.to(target.id).emit("restriction", {
            mic: next.mic,
            cam: next.cam,
            screen: next.screen,
            by: member.name,
          });
          if (next.screen) {
            io.to(target.id).emit("screen:stop", {
              message: `${member.name} turned off screen sharing for you.`,
            });
          }
          io.to(room.id).emit("member:updated", {
            id: target.id,
            userId: target.userId,
            media: target.media,
            handRaised: target.handRaised,
            restricted: next,
          });
          if (action === "mute") note(`${member.name} muted ${target.name}`);
          if (action === "cameraOff") {
            note(`${member.name} turned off ${target.name}'s camera`);
          }
          if (action === "screenOff") {
            note(`${member.name} turned off ${target.name}'s screen share`);
          }
          break;
        }

        case "muteAll": {
          let count = 0;
          for (const other of room.members.values()) {
            if (other.id === member.id) continue;
            const previous = room.restrictions.get(other.userId) ?? {
              mic: false,
              cam: false,
              screen: false,
            };
            room.restrictions.set(other.userId, { ...previous, mic: true });
            other.media.micOn = false;
            io.to(other.id).emit("restriction", {
              mic: true,
              cam: previous.cam,
              screen: previous.screen,
              by: member.name,
            });
            io.to(room.id).emit("member:updated", {
              id: other.id,
              userId: other.userId,
              media: other.media,
              handRaised: other.handRaised,
              restricted: { ...previous, mic: true },
            });
            count += 1;
          }
          if (count > 0) note(`${member.name} muted everyone`);
          break;
        }

        case "clearRestrictions": {
          for (const [userId] of Array.from(room.restrictions)) {
            room.restrictions.delete(userId);
            const other = findMember(room, userId);
            if (other) {
              io.to(other.id).emit("restriction", {
                mic: false,
                cam: false,
                screen: false,
                by: member.name,
              });
              io.to(room.id).emit("member:updated", {
                id: other.id,
                userId: other.userId,
                media: other.media,
                handRaised: other.handRaised,
                restricted: { mic: false, cam: false, screen: false },
              });
            }
          }
          note(`${member.name} lifted all media restrictions`);
          break;
        }

        case "setScreenPolicy": {
          const policy = cleanScreenPolicy(payload?.screenPolicy);
          room.screenShare = policy;
          saveScreenPolicy(room.id, policy);
          for (const other of room.members.values()) {
            if (!other.media.screenOn) continue;
            if (canShareScreen(room, other.userId)) continue;
            other.media.screenOn = false;
            io.to(other.id).emit("screen:stop", {
              message:
                policy === "off"
                  ? "A host turned off screen sharing for everyone."
                  : "Only hosts and admins can share their screen in this room.",
            });
            io.to(room.id).emit("member:updated", {
              id: other.id,
              userId: other.userId,
              media: other.media,
              handRaised: other.handRaised,
              restricted: room.restrictions.get(other.userId) ?? {
                mic: false,
                cam: false,
                screen: false,
              },
            });
          }
          broadcastRoom(io, room);
          note(
            policy === "off"
              ? `${member.name} turned off screen sharing for everyone`
              : policy === "admins"
                ? `${member.name} limited screen sharing to hosts and admins`
                : `${member.name} opened screen sharing for everyone`,
          );
          break;
        }

        case "promote": {
          if (!target || targetRole === "host") return;
          room.admins.add(target.userId);
          addAdmin(room.id, target.userId, member.userId);
          broadcastRoom(io, room);
          note(`${target.name} is now an admin`);
          break;
        }

        case "demote": {
          if (!target || targetRole === "host") return;
          room.admins.delete(target.userId);
          removeAdmin(room.id, target.userId);
          broadcastRoom(io, room);
          note(`${target.name} is no longer an admin`);
          break;
        }

        case "revokeAll": {
          room.admins.clear();
          clearAdmins(room.id);
          room.hostId = "";
          room.joinPolicy = "open";
          saveHost(room.id, "");
          savePolicy(room.id, "open");
          admitPending(io, room);
          broadcastRoom(io, room);
          note("All admin privileges were revoked — this room is now decentralized");
          break;
        }

        case "setPolicy": {
          const policy: JoinPolicy =
            payload?.policy === "request" ? "request" : "open";
          room.joinPolicy = policy;
          savePolicy(room.id, policy);
          if (policy === "open") admitPending(io, room);
          broadcastRoom(io, room);
          note(
            policy === "request"
              ? `Join requests are now ON (${member.name})`
              : `Anyone can join now (${member.name})`,
          );
          break;
        }

        case "approve":
        case "deny": {
          const request = room.pending.get(targetUserId);
          if (!request) return;
          room.pending.delete(targetUserId);
          if (action === "deny") {
            io.to(request.socketId).emit("join:denied", {
              roomId: room.id,
              message: "The host didn't let you in this time.",
            });
            broadcastRoom(io, room);
            note(`${member.name} declined a join request`);
            return;
          }
          if (getBan(room.id, targetUserId)) {
            io.to(request.socketId).emit("join:denied", {
              roomId: room.id,
              message: "You're banned from this room.",
            });
            broadcastRoom(io, room);
            return;
          }
          if (room.members.size >= room.maxSize) {
            io.to(request.socketId).emit("join:denied", {
              roomId: room.id,
              message: "The room filled up before you could join.",
            });
            broadcastRoom(io, room);
            return;
          }
          const requesterSocket = io.sockets.sockets.get(request.socketId);
          if (!requesterSocket) {
            broadcastRoom(io, room);
            return;
          }
          joinRoom(io, requesterSocket, room, request.userId, {
            name: request.name,
            avatar: request.avatar,
            photo: request.photo,
            photoFull: request.photoFull,
            color: request.color,
            media: request.media,
          });
          note(`${member.name} let ${request.name} in`);
          broadcastRoom(io, room);
          break;
        }

        default:
          socket.emit("admin:error", { message: "Unknown admin action." });
      }
    },
  );

  /* --------------------------- disconnect --------------------------- */
  socket.on("disconnecting", () => {
    // Drop any join request this socket was waiting on, otherwise admins
    // keep seeing ghost requests after someone closes their tab.
    for (const room of rooms.values()) {
      let changed = false;
      for (const [userId, request] of Array.from(room.pending)) {
        if (request.socketId === socket.id) {
          room.pending.delete(userId);
          changed = true;
        }
      }
      if (changed) broadcastRoom(io, room);
    }
    leaveRoom(io, socket);
  });

  socket.on("disconnect", (reason) => {
    socketRoom.delete(socket.id);
    socketIdentity.delete(socket.id);
    lastReaction.delete(socket.id);
    console.log(`[socket] ${socket.id} disconnected (${reason})`);
    broadcastStats(io);
  });
});

/* ------------------------------------------------------------------ */
/*  Housekeeping                                                      */
/* ------------------------------------------------------------------ */

const cleanup = setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60 * 3;
  for (const [id, room] of Array.from(rooms)) {
    if (room.members.size === 0 && room.createdAt < cutoff) {
      rooms.delete(id);
    }
  }
  // Database retention: abandoned rooms (and their history) expire.
  const retention = Date.now() - 1000 * 60 * 60 * 24 * 30;
  pruneRooms(retention);
}, 1000 * 60 * 10);
cleanup.unref?.();

server.listen(PORT, () => {
  console.log(`Ripple signaling server → http://localhost:${PORT}`);
  console.log(`SQLite + admin controls enabled · ${countUsers()} known profiles`);
});
