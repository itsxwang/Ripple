import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

/* ------------------------------------------------------------------ */
/*  Ripple persistence                                                */
/*                                                                    */
/*  Uses Node's built-in SQLite (node:sqlite). No native deps to      */
/*  compile. Stores anonymous profiles, durable rooms, admins, bans,   */
/*  and non-direct message history.                                    */
/* ------------------------------------------------------------------ */

export type StoredKind = "private" | "duo" | "party";
export type StoredPolicy = "open" | "request";
export type StoredScreenPolicy = "open" | "admins" | "off";

export interface StoredProfile {
  id: string;
  name: string;
  avatar: string;
  photo?: string | null;
  photoFull?: string | null;
  color: string;
}

export interface StoredRoom {
  id: string;
  kind: StoredKind;
  hostId: string;
  maxSize: number;
  joinPolicy: StoredPolicy;
  screenShare: StoredScreenPolicy;
  createdAt: number;
}

export interface StoredBan {
  userId: string;
  expiresAt: number | null;
  reason: string | null;
  bannedBy: string;
  name?: string | null;
  avatar?: string | null;
  photo?: string | null;
}

export interface StoredMessage {
  id: string;
  roomId: string;
  from: string;
  fromName: string;
  fromAvatar: string;
  fromPhoto?: string | null;
  fromColor: string;
  to?: string | null;
  text: string;
  ts: number;
  system: boolean;
}

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "..", "data", "ripple.sqlite");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    photo TEXT,
    photo_full TEXT,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    visits INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    host_id TEXT NOT NULL DEFAULT '',
    max_size INTEGER NOT NULL,
    join_policy TEXT NOT NULL DEFAULT 'open',
    screen_share TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_admins (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS room_bans (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    banned_by TEXT NOT NULL,
    reason TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    from_user TEXT NOT NULL,
    from_name TEXT NOT NULL,
    from_avatar TEXT NOT NULL,
    from_photo TEXT,
    from_color TEXT NOT NULL,
    to_user TEXT,
    text TEXT NOT NULL,
    ts INTEGER NOT NULL,
    system INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room
    ON messages(room_id, ts);
`);

/* Tiny in-place migrations for databases created by older versions. */
function ensureColumn(table: string, column: string, definition: string) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name?: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("users", "photo_full", "TEXT");
ensureColumn("rooms", "screen_share", "TEXT NOT NULL DEFAULT 'open'");

/* ----------------------------- users ----------------------------- */

const upsertUserStmt = db.prepare(`
  INSERT INTO users (id, name, avatar, photo, photo_full, color, created_at, last_seen, visits)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    avatar = excluded.avatar,
    photo = excluded.photo,
    photo_full = excluded.photo_full,
    color = excluded.color,
    last_seen = excluded.last_seen,
    visits = users.visits + 1
`);

export function touchUser(profile: StoredProfile): void {
  const now = Date.now();
  upsertUserStmt.run(
    profile.id,
    profile.name,
    profile.avatar,
    profile.photo ?? null,
    profile.photoFull ?? null,
    profile.color,
    now,
    now,
  );
}

const countUsersStmt = db.prepare(`SELECT COUNT(*) AS total FROM users`);

export function countUsers(): number {
  const row = countUsersStmt.get() as { total?: number } | undefined;
  return Number(row?.total ?? 0);
}

/* ----------------------------- rooms ----------------------------- */

const insertRoomStmt = db.prepare(`
  INSERT INTO rooms (id, kind, host_id, max_size, join_policy, screen_share, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    host_id = excluded.host_id,
    join_policy = excluded.join_policy,
    screen_share = excluded.screen_share,
    max_size = excluded.max_size
`);

export function saveRoom(room: StoredRoom): void {
  insertRoomStmt.run(
    room.id,
    room.kind,
    room.hostId,
    room.maxSize,
    room.joinPolicy,
    room.screenShare,
    room.createdAt,
  );
}

const getRoomStmt = db.prepare(`SELECT * FROM rooms WHERE id = ?`);

export function loadRoom(id: string): StoredRoom | null {
  const row = getRoomStmt.get(id) as
    | {
        id: string;
        kind: string;
        host_id: string;
        max_size: number;
        join_policy: string;
        screen_share: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    kind: (row.kind as StoredKind) ?? "private",
    hostId: row.host_id,
    maxSize: Number(row.max_size),
    joinPolicy: row.join_policy === "request" ? "request" : "open",
    screenShare:
      row.screen_share === "admins" || row.screen_share === "off"
        ? row.screen_share
        : "open",
    createdAt: Number(row.created_at),
  };
}

const updatePolicyStmt = db.prepare(
  `UPDATE rooms SET join_policy = ? WHERE id = ?`,
);

export function savePolicy(roomId: string, policy: StoredPolicy): void {
  updatePolicyStmt.run(policy, roomId);
}

const updateScreenPolicyStmt = db.prepare(
  `UPDATE rooms SET screen_share = ? WHERE id = ?`,
);

export function saveScreenPolicy(
  roomId: string,
  policy: StoredScreenPolicy,
): void {
  updateScreenPolicyStmt.run(policy, roomId);
}

const updateHostStmt = db.prepare(`UPDATE rooms SET host_id = ? WHERE id = ?`);

export function saveHost(roomId: string, hostId: string): void {
  updateHostStmt.run(hostId, roomId);
}

const deleteRoomStmt = db.prepare(`DELETE FROM rooms WHERE id = ?`);

export function deleteRoom(roomId: string): void {
  deleteRoomStmt.run(roomId);
  db.prepare(`DELETE FROM room_admins WHERE room_id = ?`).run(roomId);
  db.prepare(`DELETE FROM room_bans WHERE room_id = ?`).run(roomId);
  db.prepare(`DELETE FROM messages WHERE room_id = ?`).run(roomId);
}

const listStaleRoomsStmt = db.prepare(
  `SELECT id FROM rooms WHERE created_at < ?`,
);

/**
 * Retention: drop rooms (and everything attached to them) that are older
 * than the cutoff. Called by the signaling server's housekeeping timer so
 * abandoned links and their chat history don't accumulate forever.
 */
export function pruneRooms(cutoff: number): number {
  const stale = listStaleRoomsStmt.all(cutoff) as Array<{ id: string }>;
  for (const row of stale) deleteRoom(row.id);
  return stale.length;
}

/* ----------------------------- admins ---------------------------- */

const listAdminsStmt = db.prepare(
  `SELECT user_id FROM room_admins WHERE room_id = ?`,
);

export function listAdmins(roomId: string): string[] {
  return (listAdminsStmt.all(roomId) as Array<{ user_id: string }>).map(
    (row) => row.user_id,
  );
}

const addAdminStmt = db.prepare(`
  INSERT INTO room_admins (room_id, user_id, granted_by, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(room_id, user_id) DO NOTHING
`);

export function addAdmin(
  roomId: string,
  userId: string,
  grantedBy: string,
): void {
  addAdminStmt.run(roomId, userId, grantedBy, Date.now());
}

const removeAdminStmt = db.prepare(
  `DELETE FROM room_admins WHERE room_id = ? AND user_id = ?`,
);

export function removeAdmin(roomId: string, userId: string): void {
  removeAdminStmt.run(roomId, userId);
}

const clearAdminsStmt = db.prepare(
  `DELETE FROM room_admins WHERE room_id = ?`,
);

export function clearAdmins(roomId: string): void {
  clearAdminsStmt.run(roomId);
}

/* ------------------------------ bans ----------------------------- */

const purgeExpiredBansStmt = db.prepare(
  `DELETE FROM room_bans WHERE expires_at IS NOT NULL AND expires_at <= ?`,
);

const listBansStmt = db.prepare(`
  SELECT b.user_id, b.expires_at, b.reason, b.banned_by,
         u.name AS user_name, u.avatar AS user_avatar, u.photo AS user_photo
  FROM room_bans b
  LEFT JOIN users u ON u.id = b.user_id
  WHERE b.room_id = ?
  ORDER BY b.created_at DESC
`);

export function listBans(roomId: string): StoredBan[] {
  purgeExpiredBansStmt.run(Date.now());
  return (
    listBansStmt.all(roomId) as Array<{
      user_id: string;
      expires_at: number | null;
      reason: string | null;
      banned_by: string;
      user_name: string | null;
      user_avatar: string | null;
      user_photo: string | null;
    }>
  ).map((row) => ({
    userId: row.user_id,
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    reason: row.reason,
    bannedBy: row.banned_by,
    name: row.user_name,
    avatar: row.user_avatar,
    photo: row.user_photo,
  }));
}

const getBanStmt = db.prepare(`
  SELECT user_id, expires_at, reason, banned_by
  FROM room_bans
  WHERE room_id = ? AND user_id = ?
`);

export function getBan(roomId: string, userId: string): StoredBan | null {
  const row = getBanStmt.get(roomId, userId) as
    | {
        user_id: string;
        expires_at: number | null;
        reason: string | null;
        banned_by: string;
      }
    | undefined;
  if (!row) return null;
  if (row.expires_at !== null && Number(row.expires_at) <= Date.now()) {
    removeBan(roomId, userId);
    return null;
  }
  return {
    userId: row.user_id,
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    reason: row.reason,
    bannedBy: row.banned_by,
  };
}

const addBanStmt = db.prepare(`
  INSERT INTO room_bans (room_id, user_id, banned_by, reason, expires_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(room_id, user_id) DO UPDATE SET
    banned_by = excluded.banned_by,
    reason = excluded.reason,
    expires_at = excluded.expires_at,
    created_at = excluded.created_at
`);

export function addBan(
  roomId: string,
  userId: string,
  bannedBy: string,
  reason: string | null,
  expiresAt: number | null,
): void {
  addBanStmt.run(roomId, userId, bannedBy, reason, expiresAt, Date.now());
}

const removeBanStmt = db.prepare(
  `DELETE FROM room_bans WHERE room_id = ? AND user_id = ?`,
);

export function removeBan(roomId: string, userId: string): void {
  removeBanStmt.run(roomId, userId);
}

/* ---------------------------- messages --------------------------- */

const insertMessageStmt = db.prepare(`
  INSERT OR IGNORE INTO messages
    (id, room_id, from_user, from_name, from_avatar, from_photo, from_color,
     to_user, text, ts, system)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function saveMessage(message: StoredMessage): void {
  insertMessageStmt.run(
    message.id,
    message.roomId,
    message.from,
    message.fromName,
    message.fromAvatar,
    message.fromPhoto ?? null,
    message.fromColor,
    message.to ?? null,
    message.text,
    message.ts,
    message.system ? 1 : 0,
  );
}

const historyStmt = db.prepare(`
  SELECT * FROM messages
  WHERE room_id = ? AND to_user IS NULL
  ORDER BY ts DESC
  LIMIT ?
`);

export function loadHistory(
  roomId: string,
  limit = 80,
): StoredMessage[] {
  const rows = historyStmt.all(roomId, limit) as Array<{
    id: string;
    room_id: string;
    from_user: string;
    from_name: string;
    from_avatar: string;
    from_photo: string | null;
    from_color: string;
    to_user: string | null;
    text: string;
    ts: number;
    system: number;
  }>;
  return rows.reverse().map((row) => ({
    id: row.id,
    roomId: row.room_id,
    from: row.from_user,
    fromName: row.from_name,
    fromAvatar: row.from_avatar,
    fromPhoto: row.from_photo,
    fromColor: row.from_color,
    to: row.to_user,
    text: row.text,
    ts: Number(row.ts),
    system: Boolean(row.system),
  }));
}
