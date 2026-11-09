import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  LuArrowRight,
  LuAudioWaveform,
  LuCamera,
  LuCheck,
  LuCopy,
  LuDices,
  LuImage,
  LuLock,
  LuPartyPopper,
  LuShieldCheck,
  LuSparkles,
  LuLockOpen,
  LuUsers,
  LuX,
  LuZap,
} from "react-icons/lu";
import {
  AVATARS,
  COLOR_KEYS,
  SOCKET_URL,
  gradientFor,
  randomAvatar,
  randomColor,
} from "../lib/constants";
import { copyText } from "../lib/clipboard";
import { useMediaPreview } from "../hooks/useMediaPreview";
import { usePresence } from "../hooks/usePresence";
import { Avatar } from "./Avatar";
import { AvatarEditor } from "./AvatarEditor";
import { MediaTest } from "./MediaTest";
import type {
  DiscoverRoom,
  JoinIntent,
  JoinPolicy,
  Prefs,
  Profile,
} from "../types";

type LobbyMode = "duo" | "party" | "private";

interface LobbyProps {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  prefs: Prefs;
  onPrefsChange: (patch: Partial<Prefs>) => void;
  onJoin: (intent: JoinIntent) => void;
  initialRoom: string | null;
  error: string | null;
  onClearError: () => void;
}

const MODE_META: Array<{
  id: LobbyMode;
  title: string;
  description: string;
  icon: ReactNode;
  accent: string;
}> = [
  {
    id: "duo",
    title: "Instant match",
    description: "1-on-1 with a stranger. Skip anytime.",
    icon: <LuZap className="h-4 w-4" />,
    accent: "lime",
  },
  {
    id: "party",
    title: "Party room",
    description: "Host up to 6 people who drop in and out.",
    icon: <LuPartyPopper className="h-4 w-4" />,
    accent: "cyan",
  },
  {
    id: "private",
    title: "Private room",
    description: "Invite your people with a code.",
    icon: <LuLock className="h-4 w-4" />,
    accent: "violet",
  },
];

const ACCENTS: Record<string, string> = {
  lime: "border-lime-300/45 bg-lime-300/[0.09] text-lime-200",
  cyan: "border-cyan-300/45 bg-cyan-300/[0.09] text-cyan-200",
  violet: "border-violet-300/45 bg-violet-300/[0.09] text-violet-200",
};

export function Lobby({
  profile,
  onProfileChange,
  prefs,
  onPrefsChange,
  onJoin,
  initialRoom,
  error,
  onClearError,
}: LobbyProps) {
  const [mode, setMode] = useState<LobbyMode>(initialRoom ? "private" : "duo");
  const [roomCode, setRoomCode] = useState(initialRoom ?? "");
  const [copied, setCopied] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>("open");
  const [openRooms, setOpenRooms] = useState<DiscoverRoom[]>([]);
  const [discoverError, setDiscoverError] = useState(false);

  const presence = usePresence();
  const preview = useMediaPreview(prefs, onPrefsChange);

  const trimmedName = profile.name.trim();
  const canStart = trimmedName.length > 0;
  const canJoinCode = roomCode.trim().length >= 3;

  useEffect(() => {
    if (initialRoom) {
      setMode("private");
      setRoomCode(initialRoom);
    }
  }, [initialRoom]);

  useEffect(() => {
    let active = true;
    const base = SOCKET_URL.replace(/\/$/, "");

    const load = async () => {
      try {
        const response = await fetch(`${base}/rooms`);
        if (!response.ok) throw new Error("bad response");
        const data = (await response.json()) as { rooms?: DiscoverRoom[] };
        if (active) {
          setOpenRooms(Array.isArray(data.rooms) ? data.rooms : []);
          setDiscoverError(false);
        }
      } catch {
        if (active) setDiscoverError(true);
      }
    };

    void load();
    const timer = window.setInterval(load, 9000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const stack = useMemo(
    () => [
      { avatar: "🦊", color: "sunset" },
      { avatar: "🐼", color: "ocean" },
      { avatar: "🐸", color: "forest" },
      { avatar: "🦄", color: "candy" },
    ],
    [],
  );

  const createPrivateRoom = () => {
    if (!canStart) return;
    onClearError();
    onJoin({ type: "create", kind: "private", joinPolicy });
  };

  const start = () => {
    if (!canStart) return;
    onClearError();
    if (mode === "duo") {
      onJoin({ type: "random", mode: "duo" });
    } else if (mode === "party") {
      onJoin({ type: "create", kind: "party", joinPolicy });
    } else if (canJoinCode) {
      onJoin({ type: "join", roomId: roomCode.trim().toUpperCase() });
    } else {
      createPrivateRoom();
    }
  };

  const copyRoomCode = async () => {
    if (!roomCode.trim()) return;
    const ok = await copyText(roomCode.trim().toUpperCase());
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const shuffleAvatar = () => {
    const nextAvatar = randomAvatar();
    let nextColor = randomColor();
    if (nextColor === profile.color) {
      nextColor =
        COLOR_KEYS[(COLOR_KEYS.indexOf(nextColor) + 1) % COLOR_KEYS.length];
    }
    onProfileChange({
      ...profile,
      avatar: nextAvatar,
      color: nextColor,
      photo: undefined,
      photoFull: undefined,
    });
  };

  const online = presence.online;
  const totalKnown = presence.totalUsers;

  return (
    <div className="relative min-h-dvh overflow-x-hidden text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute -left-40 top-[-10%] h-[34rem] w-[34rem] rounded-full bg-lime-400/10 blur-[120px]" />
        <div className="absolute right-[-10%] top-[20%] h-[30rem] w-[30rem] rounded-full bg-cyan-400/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[28rem] w-[28rem] rounded-full bg-violet-500/10 blur-[130px]" />
      </div>

      {/* header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-lime-300 via-cyan-300 to-violet-400 text-[#071008] shadow-lg shadow-lime-400/20">
            <LuAudioWaveform className="h-5 w-5" />
          </span>
          <div className="leading-none">
            <span className="font-display text-lg font-bold tracking-tight">
              Ripple
            </span>
            <span className="ml-1.5 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 align-middle text-[8px] font-bold uppercase tracking-[0.16em] text-white/40">
              beta
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/50 sm:flex">
            <LuShieldCheck className="h-3.5 w-3.5 text-lime-300" />
            Peer-to-peer
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60"
            title="People with Ripple open right now, including those already in calls"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-300" />
            </span>
            {online > 0 ? `${online} online` : "live"}
          </span>
        </div>
      </header>

      {/* main */}
      <main className="relative z-10 mx-auto grid w-full max-w-6xl items-start gap-10 px-5 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pt-8">
        {/* hero */}
        <div className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50 backdrop-blur"
          >
            <LuSparkles className="h-3 w-3 text-lime-300" />
            spontaneous video rooms
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-display text-[2.75rem] font-bold leading-[0.98] tracking-tight sm:text-6xl lg:text-[4.25rem]"
          >
            Meet anyone.
            <br />
            <span className="bg-gradient-to-r from-lime-200 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              Or everyone.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-5 max-w-md text-[15px] leading-relaxed text-white/50 sm:text-base"
          >
            Ripple drops you into spontaneous video rooms with real people.
            One-on-one or a whole party — no accounts, no downloads, no
            nonsense.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.19 }}
            className="mt-7 flex flex-wrap gap-2"
          >
            {[
              {
                icon: <LuZap className="h-3.5 w-3.5" />,
                label: "Instant matching",
              },
              {
                icon: <LuUsers className="h-3.5 w-3.5" />,
                label: "Group + DMs",
              },
              {
                icon: <LuShieldCheck className="h-3.5 w-3.5" />,
                label: "True P2P media",
              },
            ].map((chip) => (
              <span
                key={chip.label}
                className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/55 backdrop-blur"
              >
                <span className="text-lime-300">{chip.icon}</span>
                {chip.label}
              </span>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-8 flex items-center gap-3"
          >
            <div className="flex -space-x-2.5">
              {stack.map((item) => (
                <span
                  key={item.avatar}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm ring-2 ring-[#05070c]"
                  style={{ background: gradientFor(item.color) }}
                >
                  {item.avatar}
                </span>
              ))}
            </div>
            <p className="text-[11px] leading-tight text-white/35">
              <span className="font-semibold text-white/70">
                {online > 0 ? `${online} people` : "People"}
              </span>{" "}
              have Ripple open right now
              <br />
              {presence.inCalls > 0
                ? `${presence.inCalls} in calls · ${presence.rooms} ${
                    presence.rooms === 1 ? "room" : "rooms"
                  } open`
                : "ready when you are"}
            </p>
          </motion.div>
        </div>

        {/* action card */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.65,
            delay: 0.15,
            type: "spring",
            stiffness: 120,
            damping: 20,
          }}
          className="relative min-w-0"
        >
          <div className="absolute -inset-px rounded-[32px] bg-gradient-to-br from-white/15 via-white/5 to-transparent" />
          <div className="relative rounded-[31px] border border-white/10 bg-[#080b12]/80 p-5 shadow-[0_35px_90px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-6">
            {/* profile */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  title="Upload a profile picture"
                  className="group relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105 active:scale-95"
                >
                  <Avatar
                    avatar={profile.avatar}
                    color={profile.color}
                    photo={profile.photo}
                    size="lg"
                    className="!h-14 !w-14 !text-3xl"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#0b1018] text-white/70 shadow">
                    <LuCamera className="h-2.5 w-2.5" />
                  </span>
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="display-name"
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30"
                >
                  Display name
                </label>
                <input
                  id="display-name"
                  value={profile.name}
                  maxLength={28}
                  onChange={(event) =>
                    onProfileChange({ ...profile, name: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") start();
                  }}
                  placeholder="Pick a name"
                  autoComplete="off"
                  className="mt-1 w-full bg-transparent font-display text-xl font-semibold text-white placeholder:text-white/25 focus:outline-none"
                />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/10 hover:text-white"
                >
                  <LuImage className="h-3 w-3" />
                  Photo
                </button>
                <button
                  type="button"
                  onClick={shuffleAvatar}
                  className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/10 hover:text-white"
                >
                  <LuDices className="h-3 w-3" />
                  Shuffle
                </button>
              </div>
            </div>

            {/* avatar picker */}
            <div className="mt-3">
              <div className="flex gap-1.5 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() =>
                      onProfileChange({
                        ...profile,
                        avatar,
                        photo: undefined,
                        photoFull: undefined,
                      })
                    }
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base transition ${
                      !profile.photo && profile.avatar === avatar
                        ? "bg-white/15 ring-1 ring-lime-300/60"
                        : "bg-white/[0.04] hover:bg-white/10"
                    }`}
                    aria-label={`Choose ${avatar}`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2 px-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">
                  color
                </span>
                <div className="flex gap-2 py-1">
                  {COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        onProfileChange({ ...profile, color: key })
                      }
                      aria-label={`Choose ${key} color`}
                      className={`h-4 w-4 shrink-0 rounded-full transition ${
                        profile.color === key
                          ? "ring-2 ring-white/80 ring-offset-2 ring-offset-[#080b12]"
                          : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ background: gradientFor(key) }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* camera + mic test */}
            <div className="mt-3">
              <MediaTest
                stream={preview.stream}
                devices={preview.devices}
                level={preview.level}
                prefs={prefs}
                onPrefsChange={onPrefsChange}
                onDeviceChange={(kind, deviceId) => {
                  void preview.setDevice(kind, deviceId);
                }}
                onRefreshDevices={() => {
                  void preview.refreshDevices();
                }}
                onRetryCamera={() => preview.retry()}
                photoFull={profile.photoFull}
                error={preview.error}
              />
            </div>

            <div className="my-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* modes */}
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
              How do you want to meet?
            </p>
            <div className="flex flex-col gap-1.5">
              {MODE_META.map((item) => {
                const selected = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMode(item.id);
                      onClearError();
                    }}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? ACCENTS[item.accent]
                        : "border-white/8 bg-white/[0.02] text-white/60 hover:border-white/15 hover:bg-white/[0.045]"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        selected ? "bg-white/10" : "bg-white/[0.05]"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {item.title}
                      </span>
                      <span
                        className={`block truncate text-[11px] ${
                          selected ? "text-white/50" : "text-white/30"
                        }`}
                      >
                        {item.description}
                      </span>
                    </span>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                        selected
                          ? "border-transparent bg-current"
                          : "border-white/20"
                      }`}
                    >
                      {selected && (
                        <LuCheck
                          className="h-2.5 w-2.5 text-[#080b12]"
                          strokeWidth={4}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* live parties */}
            {mode === "party" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 overflow-hidden"
              >
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-2">
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                      Live parties
                    </p>
                    <span className="text-[9px] text-white/25">
                      {discoverError
                        ? "offline"
                        : `${openRooms.length} open`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {openRooms.length === 0 ? (
                      <p className="px-1 py-2 text-[10px] leading-relaxed text-white/25">
                        {discoverError
                          ? "Couldn't reach the lobby. Start your own party below."
                          : "No open parties right now. Start one and people can drop in."}
                      </p>
                    ) : (
                      openRooms.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onClearError();
                            onJoin({ type: "join", roomId: item.id });
                          }}
                          className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.05]"
                        >
                          <Avatar
                            avatar={item.hostAvatar ?? "🌊"}
                            color={item.hostColor ?? "aurora"}
                            photo={item.hostPhoto ?? undefined}
                            size="xs"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-semibold text-white/80">
                              {item.hostName
                                ? `${item.hostName}'s`
                                : "Someone's"}{" "}
                              party
                            </span>
                            <span className="block text-[9px] text-white/30">
                              {item.members}/{item.maxSize} people · {item.id}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 rounded-lg bg-cyan-300/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-100">
                            Join
                            <LuArrowRight className="h-2.5 w-2.5" />
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* private code */}
            {mode === "private" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 pl-3">
                  <LuLock className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                  <input
                    value={roomCode}
                    onChange={(event) => {
                      setRoomCode(event.target.value.toUpperCase());
                      onClearError();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canJoinCode) start();
                    }}
                    placeholder="ENTER ROOM CODE"
                    maxLength={12}
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold uppercase tracking-[0.2em] text-white placeholder:text-white/20 focus:outline-none"
                  />
                  {roomCode.trim() && (
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/8 text-white/50 transition hover:bg-white/15 hover:text-white"
                      aria-label="Copy room code"
                    >
                      {copied ? (
                        <LuCheck className="h-3.5 w-3.5 text-lime-300" />
                      ) : (
                        <LuCopy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={createPrivateRoom}
                  className="mt-1.5 w-full py-1 text-center text-[11px] text-white/35 transition hover:text-white/70"
                >
                  or create a brand new room →
                </button>
              </motion.div>
            )}

            {/* join policy for new rooms */}
            {mode !== "duo" && !(mode === "private" && canJoinCode) && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  Joining
                </span>
                <div className="ml-auto flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
                  <button
                    type="button"
                    onClick={() => setJoinPolicy("open")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      joinPolicy === "open"
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <LuLockOpen className="h-2.5 w-2.5" />
                    Anyone
                  </button>
                  <button
                    type="button"
                    onClick={() => setJoinPolicy("request")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      joinPolicy === "request"
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <LuLock className="h-2.5 w-2.5" />
                    Approval
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200">
                <span className="mt-px shrink-0">⚠️</span>
                <span className="flex-1 leading-relaxed">{error}</span>
                <button
                  type="button"
                  onClick={onClearError}
                  className="shrink-0 text-rose-200/60 transition hover:text-rose-100"
                  aria-label="Dismiss error"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={start}
              disabled={!canStart}
              className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-300 px-5 py-3.5 font-display text-sm font-bold text-[#08130a] shadow-[0_16px_40px_-14px_rgba(190,242,100,0.6)] transition enabled:hover:bg-lime-200 enabled:hover:shadow-[0_20px_50px_-12px_rgba(190,242,100,0.7)] enabled:active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mode === "private" && canJoinCode ? (
                <>
                  Join room
                  <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              ) : mode === "private" ? (
                <>
                  Create a room
                  <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              ) : mode === "party" ? (
                <>
                  Start a party
                  <LuPartyPopper className="h-4 w-4 transition-transform group-hover:rotate-12" />
                </>
              ) : (
                <>
                  Start matching
                  <LuSparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
                </>
              )}
            </button>

            <p className="mt-2.5 text-center text-[10px] text-white/25">
              {mode === "private"
                ? "Share the code or link with up to 7 friends"
                : mode === "party"
                  ? joinPolicy === "request"
                    ? "Free · no signup · you approve who drops in"
                    : "Free · no signup · up to 6 people"
                  : "Free · no signup · skip anytime"}
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-white/6 pt-5 text-[10px] text-white/25 sm:flex-row">
          <p>
            Ripple — spontaneous rooms for real conversations.
            {totalKnown > 0 ? ` ${totalKnown} ripples so far.` : ""}
          </p>
          <p className="flex items-center gap-1.5">
            <LuShieldCheck className="h-3 w-3 text-lime-300/70" />
            Video stays peer-to-peer. Nothing recorded. Ever.
          </p>
        </div>
      </footer>

      <AvatarEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={({ photo, photoFull }) =>
          onProfileChange({ ...profile, photo, photoFull })
        }
        onRemove={
          profile.photo
            ? () =>
                onProfileChange({
                  ...profile,
                  photo: undefined,
                  photoFull: undefined,
                })
            : undefined
        }
      />
    </div>
  );
}
