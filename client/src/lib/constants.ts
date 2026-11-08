import type { JoinPolicy, MemberRole, RoomKind } from "../types";

export const SOCKET_URL: string =
  import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:3000";

export const AVATARS = [
  "🦊", "🐼", "🐸", "🦄", "🐙", "🐯", "🐨", "🐧",
  "🦁", "🐳", "🦋", "🐢", "🐰", "🦉", "🐝", "🐺",
  "🦖", "🫧", "🦭", "🐬", "🐹", "🐻", "🦔", "🐲",
  "👽", "🤖", "👾", "🎃", "🌊", "🌈", "⚡", "🌙",
];

export const GRADIENTS: Record<string, string> = {
  aurora: "linear-gradient(135deg, #22d3ee 0%, #a78bfa 55%, #f472b6 100%)",
  lime: "linear-gradient(135deg, #bef264 0%, #22d3ee 100%)",
  sunset: "linear-gradient(135deg, #fb7185 0%, #f59e0b 100%)",
  ocean: "linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)",
  candy: "linear-gradient(135deg, #f0abfc 0%, #818cf8 100%)",
  forest: "linear-gradient(135deg, #34d399 0%, #a3e635 100%)",
  ember: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
  midnight: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
};

export const COLOR_KEYS = Object.keys(GRADIENTS);

/**
 * Must stay in sync with the signaling server's allow-list.
 * The picker groups these for a nicer browsing experience.
 */
export const EMOJI_REACTIONS = [
  "❤️", "😂", "🔥", "👏", "😮", "🎉", "💯", "🙌",
  "😍", "🥰", "😎", "🤯", "😭", "😅", "🤔", "🫡",
  "👀", "💀", "🤡", "👻", "🤖", "🐶", "🐱", "🦊",
  "🐼", "🦄", "🌈", "⚡", "✨", "💥", "🌟", "🎯",
  "🏆", "🍕", "🍿", "☕", "🍻", "🎵", "🎮", "🚀",
  "💜", "💚", "💙", "🧡", "🤍", "🖤", "👑", "🤝",
];

export const REACTION_GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: "Classic",
    emojis: ["❤️", "😂", "🔥", "👏", "😮", "🎉", "💯", "🙌"],
  },
  {
    label: "Faces",
    emojis: ["😍", "🥰", "😎", "🤯", "😭", "😅", "🤔", "🫡", "👀", "💀", "🤡", "👻"],
  },
  {
    label: "Cute",
    emojis: ["🤖", "🐶", "🐱", "🦊", "🐼", "🦄", "🌈"],
  },
  {
    label: "Hype",
    emojis: ["⚡", "✨", "💥", "🌟", "🎯", "🏆", "🚀", "👑"],
  },
  {
    label: "Vibes",
    emojis: ["🍕", "🍿", "☕", "🍻", "🎵", "🎮", "🤝"],
  },
  {
    label: "Hearts",
    emojis: ["💜", "💚", "💙", "🧡", "🤍", "🖤"],
  },
];

export const GIF_MAX_BYTES = 1_500_000;

export const BAN_DURATIONS: Array<{ label: string; ms: number }> = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Forever", ms: 0 },
];

export const ROOM_LABELS: Record<RoomKind, string> = {
  private: "Private room",
  duo: "Instant match",
  party: "Party room",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  host: "Host",
  admin: "Admin",
  member: "Member",
};

export const POLICY_LABELS: Record<JoinPolicy, string> = {
  open: "Anyone can join",
  request: "Approval required",
};

export function gradientFor(color: string): string {
  return GRADIENTS[color] ?? GRADIENTS.aurora;
}

const NAME_ADJECTIVES = [
  "Neon", "Cosmic", "Velvet", "Lunar", "Mellow", "Turbo",
  "Sunny", "Electric", "Quiet", "Golden", "Misty", "Atomic",
];

const NAME_NOUNS = [
  "Otter", "Falcon", "Panda", "Comet", "Tiger", "Mochi",
  "Koala", "Pixel", "Fox", "Nova", "Willow", "Echo",
];

export function randomName(): string {
  const a = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const n = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  return `${a} ${n}`;
}

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export function randomColor(): string {
  return COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBanExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "permanent";
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "expired";
  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
}

export function inviteLink(roomId: string): string {
  const url = new URL(window.location.href);
  url.search = `?room=${encodeURIComponent(roomId)}`;
  url.hash = "";
  return url.toString();
}

export function roomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room ? room.trim().toUpperCase() : null;
}

export function roleFor(
  hostId: string,
  admins: string[],
  userId: string,
): MemberRole {
  if (hostId && hostId === userId) return "host";
  if (admins.includes(userId)) return "admin";
  return "member";
}
