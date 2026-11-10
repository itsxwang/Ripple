import type { JoinPolicy, LobbyMode, LobbyPrefs } from "../types";

const LOBBY_KEY = "ripple:lobby";

export const DEFAULT_LOBBY_PREFS: LobbyPrefs = {
  mode: "duo",
  joinPolicy: "open",
};

const MODES: LobbyMode[] = ["duo", "party", "private"];
const POLICIES: JoinPolicy[] = ["open", "request"];

function isMode(value: unknown): value is LobbyMode {
  return typeof value === "string" && MODES.includes(value as LobbyMode);
}

function isPolicy(value: unknown): value is JoinPolicy {
  return typeof value === "string" && POLICIES.includes(value as JoinPolicy);
}

export function loadLobbyPrefs(): LobbyPrefs {
  try {
    const raw = localStorage.getItem(LOBBY_KEY);
    if (!raw) return { ...DEFAULT_LOBBY_PREFS };
    const parsed = JSON.parse(raw) as Partial<LobbyPrefs>;
    return {
      mode: isMode(parsed.mode) ? parsed.mode : DEFAULT_LOBBY_PREFS.mode,
      joinPolicy: isPolicy(parsed.joinPolicy)
        ? parsed.joinPolicy
        : DEFAULT_LOBBY_PREFS.joinPolicy,
    };
  } catch {
    return { ...DEFAULT_LOBBY_PREFS };
  }
}

export function saveLobbyPrefs(prefs: LobbyPrefs): void {
  try {
    localStorage.setItem(LOBBY_KEY, JSON.stringify(prefs));
  } catch {
    /* storage can be blocked or full */
  }
}
