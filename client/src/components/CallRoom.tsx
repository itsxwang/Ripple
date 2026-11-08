import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuAudioWaveform,
  LuCheck,
  LuCopy,
  LuLock,
  LuMessageCircle,
  LuShieldCheck,
  LuSkipForward,
  LuTimer,
  LuTriangleAlert,
  LuUsers,
  LuWifiOff,
} from "react-icons/lu";
import type { JoinIntent, Prefs, Profile } from "../types";
import { useCall } from "../hooks/useCall";
import {
  ROOM_LABELS,
  formatDuration,
  inviteLink,
} from "../lib/constants";
import { copyText } from "../lib/clipboard";
import { Aurora } from "./Aurora";
import { ControlBar } from "./ControlBar";
import { ReactionsLayer } from "./ReactionsLayer";
import { RoomSettings } from "./RoomSettings";
import { Sidebar } from "./Sidebar";
import type { PanelTab } from "./Sidebar";
import { Toasts } from "./Toasts";
import { VideoGrid } from "./VideoGrid";

interface CallRoomProps {
  profile: Profile;
  intent: JoinIntent;
  prefs: Prefs;
  onPrefsChange: (patch: Partial<Prefs>) => void;
  onExit: (message?: string) => void;
}

function FullScreenOverlay({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#05070c]/88 px-6 backdrop-blur-xl"
    >
      <div
        className={`w-full max-w-sm rounded-[28px] border p-6 text-center shadow-2xl backdrop-blur-2xl ${
          tone === "error"
            ? "border-rose-400/25 bg-[#140a10]/90"
            : "border-white/10 bg-[#0a0e16]/90"
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
}

function Spinner({ tone = "lime" }: { tone?: "lime" | "cyan" }) {
  return (
    <span className="relative flex h-16 w-16 items-center justify-center">
      <span
        className={`absolute inset-0 animate-[spin_2.4s_linear_infinite] rounded-full border-2 border-transparent ${
          tone === "lime"
            ? "border-t-lime-300 border-r-lime-300/40"
            : "border-t-cyan-300 border-r-cyan-300/40"
        }`}
      />
      <span className="absolute inset-2 animate-[spin_1.6s_linear_infinite_reverse] rounded-full border-2 border-transparent border-b-violet-300/70" />
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
        <LuAudioWaveform className="h-4 w-4 text-lime-300" />
      </span>
    </span>
  );
}

export function CallRoom({
  profile,
  intent,
  prefs,
  onPrefsChange,
  onExit,
}: CallRoomProps) {
  const engine = useCall(profile, intent, prefs, onPrefsChange, onExit);
  const {
    connection,
    room,
    self,
    selfId,
    userId,
    others,
    localStream,
    screenStream,
    remoteStreams,
    selfMedia,
    localMutes,
    peerStates,
    messages,
    typing,
    reactions,
    toasts,
    speaking,
    error,
    matching,
    pending,
    presence,
    devices,
    toggleMic,
    toggleCam,
    toggleScreen,
    toggleHand,
    next,
    leave,
    sendMessage,
    sendTyping,
    sendReaction,
    notify,
    adminAction,
    setJoinPolicy,
    approveRequest,
    denyRequest,
    unban,
    switchDevice,
    refreshDevices,
    toggleLocalMute,
    retryMedia,
  } = engine;

  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [conversation, setConversation] = useState("group");
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  const members = useMemo(() => [self, ...others], [self, others]);
  const isRandom = intent.type === "random";
  const canAdmin = self.role !== "member";
  const requests = room?.requests ?? [];
  const pendingCount = canAdmin ? requests.length : 0;

  const screenAllowed = useMemo(() => {
    if (!room) return true;
    if (self.restricted.screen || self.restricted.cam) return false;
    if (self.role !== "member") return true;
    if (room.kind !== "party") return true;
    return (room.screenShare ?? "open") === "open";
  }, [room, self.restricted.screen, self.restricted.cam, self.role]);

  useEffect(() => {
    if (!pinnedId) return;
    if (!members.some((member) => member.id === pinnedId)) setPinnedId(null);
  }, [members, pinnedId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (panel) setPanel(null);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "m") {
        event.preventDefault();
        toggleMic();
      } else if (key === "v") {
        event.preventDefault();
        toggleCam();
      } else if (key === "s") {
        event.preventDefault();
        toggleScreen();
      } else if (key === "h") {
        event.preventDefault();
        toggleHand();
      } else if (key === "c") {
        event.preventDefault();
        setPanel((current) => (current === "chat" ? null : "chat"));
      } else if (key === "p") {
        event.preventDefault();
        setPanel((current) => (current === "people" ? null : "people"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    panel,
    settingsOpen,
    toggleCam,
    toggleHand,
    toggleMic,
    toggleScreen,
  ]);

  useEffect(() => {
    if (!room) return;
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [room?.id]);

  useEffect(() => {
    if (conversation === "group") return;
    if (!others.some((member) => member.id === conversation)) {
      setConversation("group");
    }
  }, [others, conversation]);

  const unread = useMemo(() => {
    const map: Record<string, number> = {};
    for (const message of messages) {
      if (message.system || message.from === selfId) continue;
      const key = message.to
        ? message.to === selfId
          ? message.from
          : message.to
        : "group";
      if (message.ts > (seen[key] ?? 0)) {
        map[key] = (map[key] ?? 0) + 1;
      }
    }
    return map;
  }, [messages, seen, selfId]);

  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((total, value) => total + value, 0),
    [unread],
  );

  const lastTs = messages.length ? messages[messages.length - 1].ts : 0;

  useEffect(() => {
    if (panel !== "chat") return;
    setSeen((prev) => ({ ...prev, [conversation]: Date.now() }));
  }, [panel, conversation, lastTs]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.id === lastMessageRef.current) return;
    lastMessageRef.current = last.id;
    if (last.system || last.from === selfId || !last.to) return;
    if (panel === "chat" && conversation === last.from) return;
    notify(
      "info",
      `${last.fromName} sent you a DM`,
      last.text.length > 64 ? `${last.text.slice(0, 64)}…` : last.text,
      last.fromAvatar,
      last.fromColor,
      last.fromPhoto,
    );
  }, [messages, panel, conversation, selfId, notify]);

  const copyInvite = async () => {
    if (!room) return;
    const ok = await copyText(inviteLink(room.id));
    if (ok) {
      setCopied(true);
      notify("info", "Invite link copied", "Send it to whoever you want in.");
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      notify("error", "Couldn't copy", `Room code: ${room.id}`);
    }
  };

  const openChatWith = (id?: string) => {
    if (id) setConversation(id);
    setPanel("chat");
  };

  const overlay = error ? (
    <FullScreenOverlay tone="error">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-300">
        <LuTriangleAlert className="h-6 w-6" />
      </span>
      <h2 className="font-display text-lg font-semibold text-white">
        Couldn't join the room
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">{error}</p>
      <button
        type="button"
        onClick={() => leave(error)}
        className="mt-5 w-full rounded-2xl bg-lime-300 px-4 py-3 text-sm font-bold text-[#08130a] transition hover:bg-lime-200 active:scale-[0.98]"
      >
        Back to lobby
      </button>
    </FullScreenOverlay>
  ) : pending ? (
    <FullScreenOverlay>
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-200">
        <LuLock className="h-6 w-6" />
      </span>
      <h2 className="font-display text-lg font-semibold text-white">
        Waiting for the host
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">
        This room asks before letting people in. You'll pop in the moment
        someone approves you.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/30">
          Room
        </span>
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-lime-300">
          {pending.roomId}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-300/80"
            style={{ animationDelay: `${dot * 0.15}s` }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => leave()}
        className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        Cancel request
      </button>
    </FullScreenOverlay>
  ) : connection === "lost" ? (
    <FullScreenOverlay>
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/60">
        <LuWifiOff className="h-6 w-6" />
      </span>
      <h2 className="font-display text-lg font-semibold text-white">
        Connection lost
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">
        Trying to get you back into the room… this usually takes a second.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/35">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-lime-300" />
        reconnecting
      </div>
      <button
        type="button"
        onClick={() => leave()}
        className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        Leave instead
      </button>
    </FullScreenOverlay>
  ) : !room ? (
    <FullScreenOverlay>
      <div className="mb-5 flex justify-center">
        <Spinner />
      </div>
      <h2 className="font-display text-lg font-semibold text-white">
        {matching ? "Finding someone new…" : "Warming up the room…"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/45">
        {matching
          ? "Skipping the small talk and lining up a fresh room for you."
          : "Connecting to the signaling server and getting your camera ready."}
      </p>
      <div className="mt-5 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-lime-300/80"
            style={{ animationDelay: `${dot * 0.15}s` }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => leave()}
        className="mt-6 text-xs text-white/30 transition hover:text-white/70"
      >
        cancel
      </button>
    </FullScreenOverlay>
  ) : null;

  return (
    <div className="call-bg relative flex h-dvh flex-col overflow-hidden text-white">
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <Aurora />
      </div>

      {/* header */}
      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-300 via-cyan-300 to-violet-400 text-[#071008] shadow-lg shadow-lime-400/15">
            <LuAudioWaveform className="h-5 w-5" />
          </span>
          <span className="hidden h-7 w-px bg-white/10 sm:block" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-display text-sm font-semibold text-white/85">
                {room ? ROOM_LABELS[room.kind] : "Ripple"}
              </span>
              {room && (
                <button
                  type="button"
                  onClick={copyInvite}
                  title="Copy invite link"
                  className="flex shrink-0 items-center gap-1 rounded-md border border-white/8 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-lime-300 transition hover:bg-white/10"
                >
                  {room.id}
                  {copied ? (
                    <LuCheck className="h-2.5 w-2.5" />
                  ) : (
                    <LuCopy className="h-2.5 w-2.5 text-white/35" />
                  )}
                </button>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/35">
              <LuUsers className="h-3 w-3" />
              {members.length}
              {room ? `/${room.maxSize}` : ""} here
              {room?.kind !== "private" && (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/20" />
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-lime-300" />
                    live
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11px] tabular-nums text-white/45 sm:flex">
            <LuTimer className="h-3.5 w-3.5" />
            {formatDuration(elapsed)}
          </span>
          <span
            className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/45 lg:flex"
            title="People with Ripple open right now, including calls"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-300" />
            </span>
            {presence.online > 0 ? `${presence.online} online` : "live"}
          </span>
          <span className="hidden items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-white/35 xl:flex">
            <LuShieldCheck className="h-3 w-3 text-lime-300/80" />
            P2P
          </span>
          {isRandom && (
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white/80 backdrop-blur-md transition hover:bg-white/14 active:scale-95"
              title="Skip to a new room"
            >
              <LuSkipForward className="h-4 w-4" />
              <span className="hidden sm:inline">Next</span>
            </button>
          )}
        </div>
      </header>

      {/* content */}
      <div className="relative z-10 flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 p-2 pb-0 sm:p-3 sm:pb-0 lg:p-4 lg:pb-0">
          <VideoGrid
            members={members}
            localStream={localStream}
            screenStream={screenStream}
            remoteStreams={remoteStreams}
            speaking={speaking}
            room={room}
            localMutes={localMutes}
            peerStates={peerStates}
            pinnedId={pinnedId}
            onTogglePin={(id) =>
              setPinnedId((current) => (current === id ? null : id))
            }
          />
        </main>

        <AnimatePresence>
          {panel && (
            <Sidebar
              tab={panel}
              onTabChange={setPanel}
              onClose={() => setPanel(null)}
              unreadTotal={unreadTotal}
              members={members}
              selfId={selfId}
              selfUserId={userId}
              messages={messages}
              typing={typing}
              conversation={conversation}
              onConversationChange={setConversation}
              unread={unread}
              onSend={sendMessage}
              onTyping={sendTyping}
              room={room}
              speaking={speaking}
              onMessage={(id) => openChatWith(id)}
              canAdmin={canAdmin}
              online={presence.online}
              onAdminAction={adminAction}
              onSetPolicy={setJoinPolicy}
              onApprove={approveRequest}
              onDeny={denyRequest}
              onUnban={unban}
              localMutes={localMutes}
              onToggleLocalMute={toggleLocalMute}
              onFocus={(id) =>
                setPinnedId((current) => (current === id ? null : id))
              }
            />
          )}
        </AnimatePresence>
      </div>

      <ControlBar
        media={selfMedia}
        panel={panel}
        unreadTotal={unreadTotal}
        pendingCount={pendingCount}
        handRaised={self.handRaised}
        settingsOpen={settingsOpen}
        reactionsVisible={prefs.reactionsVisible}
        reactionSounds={prefs.reactionSounds}
        screenAllowed={screenAllowed}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreen={toggleScreen}
        onReaction={sendReaction}
        onToggleHand={toggleHand}
        onToggleReactionsVisible={() =>
          onPrefsChange({ reactionsVisible: !prefs.reactionsVisible })
        }
        onToggleReactionSounds={() =>
          onPrefsChange({ reactionSounds: !prefs.reactionSounds })
        }
        onOpenChat={() =>
          setPanel((current) => (current === "chat" ? null : "chat"))
        }
        onOpenPeople={() =>
          setPanel((current) => (current === "people" ? null : "people"))
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onLeave={() => leave()}
      />

      {!panel && (
        <button
          type="button"
          onClick={() => setPanel("chat")}
          className="fixed bottom-24 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-[#0c1018]/85 text-white/70 shadow-xl backdrop-blur-xl transition hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Open chat"
        >
          <LuMessageCircle className="h-5 w-5" />
          {unreadTotal > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-300 px-1 text-[9px] font-bold text-[#0b130a]">
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          )}
        </button>
      )}

      {prefs.reactionsVisible && <ReactionsLayer reactions={reactions} />}
      <Toasts toasts={toasts} />

      <RoomSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
        selfMedia={selfMedia}
        localStream={localStream}
        photoFull={profile.photoFull}
        devices={devices}
        room={room}
        canAdmin={canAdmin}
        presence={presence}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onSwitchDevice={switchDevice}
        onRefreshDevices={refreshDevices}
        onRetryMedia={retryMedia}
        onSetPolicy={setJoinPolicy}
        onAdminAction={adminAction}
      />

      <AnimatePresence>{overlay}</AnimatePresence>
    </div>
  );
}
