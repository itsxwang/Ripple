import type { DmBlock, Prefs } from "../types";

/**
 * Room-scoped blocks only apply inside the room they were created in.
 * "All meetings" blocks apply everywhere.
 */
export function isDmBlocked(
  block: DmBlock | undefined | null,
  roomId: string | null | undefined,
): boolean {
  if (!block) return false;
  if (block.scope === "all") return true;
  return Boolean(roomId) && block.roomId === roomId;
}

/** Global DM toasts are the master switch; per-member overrides can mute more. */
export function dmNotificationsEnabled(
  prefs: Prefs,
  userId?: string,
): boolean {
  if (!prefs.notifyDms) return false;
  if (userId && prefs.dmNotifyOverrides[userId] === false) return false;
  return true;
}

export function blockedUserIdsForRoom(
  blocks: Record<string, DmBlock>,
  roomId: string | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const block of Object.values(blocks)) {
    if (isDmBlocked(block, roomId)) ids.add(block.userId);
  }
  return ids;
}

export function blockScopeLabel(
  block: DmBlock,
  roomId?: string | null,
): string {
  if (block.scope === "all") return "All meetings";
  if (block.roomId && roomId && block.roomId === roomId) return "This meeting";
  return block.roomId ? `Room ${block.roomId}` : "This meeting";
}
