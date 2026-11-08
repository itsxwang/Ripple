import type { Prefs } from "../types";

const PREFS_KEY = "ripple:prefs";
const IDENTITY_KEY = "ripple:identity";

export const DEFAULT_PREFS: Prefs = {
  micOn: true,
  camOn: true,
  reactionsVisible: true,
  reactionSounds: true,
};

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
