import { useCallback, useEffect, useState } from "react";
import { Lobby } from "./components/Lobby";
import { CallRoom } from "./components/CallRoom";
import {
  randomAvatar,
  randomColor,
  randomName,
  roomFromUrl,
} from "./lib/constants";
import { loadPrefs, savePrefs } from "./lib/prefs";
import type { JoinIntent, Prefs, Profile } from "./types";

const STORAGE_KEY = "ripple:profile";

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        return {
          name: parsed.name.slice(0, 28),
          avatar: parsed.avatar || randomAvatar(),
          photo:
            typeof parsed.photo === "string" &&
            parsed.photo.startsWith("data:image/")
              ? parsed.photo
              : undefined,
          photoFull:
            typeof parsed.photoFull === "string" &&
            parsed.photoFull.startsWith("data:image/")
              ? parsed.photoFull
              : undefined,
          color: parsed.color || randomColor(),
        };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return {
    name: randomName(),
    avatar: randomAvatar(),
    color: randomColor(),
  };
}

export default function App() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [intent, setIntent] = useState<JoinIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialRoom] = useState<string | null>(() => roomFromUrl());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* storage can be full (large photos) or blocked */
    }
  }, [profile]);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const handleExit = useCallback((message?: string) => {
    setIntent(null);
    if (message) setError(message);
    if (window.location.search) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url);
    }
  }, []);

  if (intent) {
    return (
      <CallRoom
        profile={profile}
        intent={intent}
        prefs={prefs}
        onPrefsChange={updatePrefs}
        onExit={handleExit}
      />
    );
  }

  return (
    <Lobby
      profile={profile}
      onProfileChange={setProfile}
      prefs={prefs}
      onPrefsChange={updatePrefs}
      onJoin={(next) => {
        setError(null);
        setIntent(next);
      }}
      initialRoom={initialRoom}
      error={error}
      onClearError={() => setError(null)}
    />
  );
}
