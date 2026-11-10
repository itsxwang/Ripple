import type { DmBlock, DmBlockScope, IgnoredMember, Prefs } from "../types";

const PREFS_KEY = "ripple:prefs";
const IDENTITY_KEY = "ripple:identity";

export const DEFAULT_PREFS: Prefs = {
  micOn: true,
  camOn: true,
  reactionsVisible: true,
  reactionSounds: true,
  notifyEveryone: true,
  notifyDms: true,
  dmNotifyOverrides: {},
  dmBlocks: {},
  ignoredUsers: {},
};

function sanitizeOverrides(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, boolean> = {};
  for (const [userId, enabled] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (userId && typeof enabled === "boolean") result[userId] = enabled;
  }
  return result;
}

function sanitizeBlocks(value: unknown): Record<string, DmBlock> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, DmBlock> = {};
  for (const [key, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const parsed = raw as Partial<DmBlock>;
    const scope: DmBlockScope | null =
      parsed.scope === "all"
        ? "all"
        : parsed.scope === "room"
          ? "room"
          : null;
    if (!scope) continue;
    const userId =
      typeof parsed.userId === "string" && parsed.userId
        ? parsed.userId
        : key;
    if (!userId) continue;
    result[userId] = {
      userId,
      name:
        typeof parsed.name === "string" && parsed.name
          ? parsed.name
          : "Member",
      avatar:
        typeof parsed.avatar === "string" && parsed.avatar
          ? parsed.avatar
          : "🚫",
      photo:
        typeof parsed.photo === "string" &&
        parsed.photo.startsWith("data:image/")
          ? parsed.photo
          : undefined,
      color:
        typeof parsed.color === "string" && parsed.color
          ? parsed.color
          : "ember",
      scope,
      roomId:
        scope === "room" && typeof parsed.roomId === "string"
          ? parsed.roomId
          : undefined,
      ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
    };
  }
  return result;
}

function sanitizeIgnored(value: unknown): Record<string, IgnoredMember> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, IgnoredMember> = {};
  for (const [key, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const parsed = raw as Partial<IgnoredMember>;
    const userId =
      typeof parsed.userId === "string" && parsed.userId
        ? parsed.userId
        : key;
    if (!userId) continue;
    result[userId] = {
      userId,
      name:
        typeof parsed.name === "string" && parsed.name
          ? parsed.name
          : "Member",
      avatar:
        typeof parsed.avatar === "string" && parsed.avatar
          ? parsed.avatar
          : "🙈",
      photo:
        typeof parsed.photo === "string" &&
        parsed.photo.startsWith("data:image/")
          ? parsed.photo
          : undefined,
      color:
        typeof parsed.color === "string" && parsed.color
          ? parsed.color
          : "ember",
      ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
    };
  }
  return result;
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      micOn: parsed.micOn !== false,
      camOn: parsed.camOn !== false,
      reactionsVisible: parsed.reactionsVisible !== false,
      reactionSounds: parsed.reactionSounds !== false,
      notifyEveryone: parsed.notifyEveryone !== false,
      notifyDms: parsed.notifyDms !== false,
      dmNotifyOverrides: sanitizeOverrides(parsed.dmNotifyOverrides),
      dmBlocks: sanitizeBlocks(parsed.dmBlocks),
      ignoredUsers: sanitizeIgnored(parsed.ignoredUsers),
      audioDeviceId:
        typeof parsed.audioDeviceId === "string"
          ? parsed.audioDeviceId
          : undefined,
      videoDeviceId:
        typeof parsed.videoDeviceId === "string"
          ? parsed.videoDeviceId
          : undefined,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage can be full or blocked */
  }
}

/**
 * A stable anonymous identity. Admin roles and bans survive reloads
 * without asking anyone to create an account.
 */
export function getUserId(): string {
  try {
    const existing = localStorage.getItem(IDENTITY_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    /* ignore */
  }
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    localStorage.setItem(IDENTITY_KEY, generated);
  } catch {
    /* ignore */
  }
  return generated;
}
