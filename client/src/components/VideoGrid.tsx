import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LuCheck, LuCopy, LuSparkles, LuTimer } from "react-icons/lu";
import type { LocalMute, Member, RoomInfo } from "../types";
import { inviteLink } from "../lib/constants";
import { copyText } from "../lib/clipboard";
import { VideoTile } from "./VideoTile";

interface VideoGridProps {
  members: Member[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  speaking: string[];
  room: RoomInfo | null;
  localMutes: Record<string, LocalMute>;
  peerStates: Record<string, RTCPeerConnectionState>;
  pinnedId: string | null;
  onTogglePin: (id: string) => void;
}

function columnsFor(total: number): string {
  if (total <= 1) return "grid-cols-1";
  if (total === 2) return "grid-cols-1 sm:grid-cols-2";
  if (total <= 4) return "grid-cols-2";
  if (total <= 6) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
}

interface GhostTileProps {
  room: RoomInfo;
}

function GhostTile({ room }: GhostTileProps) {
  const [copied, setCopied] = useState(false);
  const isPrivate = room.kind === "private";

  const handleCopy = async () => {
    const ok = await copyText(inviteLink(room.id));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="relative flex h-full min-h-[180px] w-full flex-col items-center justify-center overflow-hidden rounded-[26px] border border-dashed border-white/12 bg-white/[0.015] p-5 text-center">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.13] blur-[70px]"
        style={{
          background: isPrivate
            ? "linear-gradient(135deg,#bef264,#22d3ee)"
            : "linear-gradient(135deg,#22d3ee,#a78bfa)",
        }}
      />

      <div className="relative mb-4 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-[ping_2.8s_ease-out_infinite] rounded-full border border-white/15" />
        <span className="absolute inset-3 animate-[ping_2.8s_ease-out_infinite] rounded-full border border-white/10 [animation-delay:0.5s]" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-2xl backdrop-blur">
          {isPrivate ? "✉️" : "✦"}
        </span>
      </div>

      {isPrivate ? (
        <>
          <p className="font-display text-base font-semibold text-white">
            Your room is ready
          </p>
          <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-white/45">
            Send the link and your people will pop up here.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
            <span className="font-mono text-sm font-semibold tracking-[0.2em] text-lime-300">
              {room.id}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/8 text-white/70 transition hover:bg-white/15 hover:text-white"
              aria-label="Copy invite link"
            >
              {copied ? (
                <LuCheck className="h-4 w-4 text-lime-300" />
              ) : (
                <LuCopy className="h-4 w-4" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-4 py-2 text-xs font-semibold text-[#08130a] transition hover:bg-lime-200 active:scale-95"
          >
            <LuCopy className="h-3.5 w-3.5" />
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        </>
      ) : (
        <>
          <p className="font-display text-base font-semibold text-white">
            {room.kind === "party"
              ? "Waiting for the party to start"
              : "Looking for someone…"}
          </p>
          <p className="mt-1 max-w-[17rem] text-xs leading-relaxed text-white/45">
            {room.kind === "party"
              ? "People can drop into this room at any moment."
              : "Hang tight — you'll be matched with a stranger any second."}
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 py-1.5 text-[11px] text-white/50">
            <LuTimer className="h-3.5 w-3.5 text-lime-300" />
            Keep this tab open
            <span className="flex gap-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1 w-1 animate-bounce rounded-full bg-lime-300/80"
                  style={{ animationDelay: `${dot * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        </>
      )}

      <span className="absolute right-4 top-4 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
        <LuSparkles className="h-3 w-3" />
        open
      </span>
    </div>
  );
}

export function VideoGrid({
  members,
  localStream,
  screenStream,
  remoteStreams,
  speaking,
  room,
  localMutes,
  peerStates,
  pinnedId,
  onTogglePin,
}: VideoGridProps) {
  const ghost = Boolean(room) && members.length === 1;
  const total = members.length + (ghost ? 1 : 0);
  const pinned = pinnedId
    ? members.find((member) => member.id === pinnedId)
    : undefined;

  const renderTile = (member: Member, compact = false) => {
    const isSelf = Boolean(member.isSelf);
    const stream = isSelf
      ? (screenStream ?? localStream)
      : remoteStreams[member.id] ?? null;
    const isSpeaking = isSelf
      ? speaking.includes("self")
      : speaking.includes(member.id);

    return (
      <VideoTile
        member={member}
        stream={stream}
        speaking={isSpeaking}
        isSelf={isSelf}
        isScreenShare={member.media.screenOn}
        localMute={localMutes[member.userId]}
        pinned={pinnedId === member.id}
        onTogglePin={() => onTogglePin(member.id)}
        compact={compact}
        connection={isSelf ? undefined : peerStates[member.id]}
      />
    );
  };

  if (pinned) {
    const rest = members.filter((member) => member.id !== pinned.id);
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 sm:gap-3">
        <motion.div layout className="min-h-0 flex-1">
          {renderTile(pinned)}
        </motion.div>
        {rest.length > 0 && (
          <div className="flex h-20 shrink-0 gap-2 overflow-x-auto pb-0.5 sm:h-24 sm:gap-3">
            <AnimatePresence initial={false}>
              {rest.map((member) => (
                <motion.div
                  key={member.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="h-full w-32 shrink-0 sm:w-44"
                >
                  {renderTile(member, true)}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      layout
      className={`grid h-full min-h-0 auto-rows-fr gap-2 sm:gap-3 ${columnsFor(
        total,
      )}`}
      transition={{ layout: { type: "spring", stiffness: 260, damping: 30 } }}
    >
      <AnimatePresence initial={false}>
        {members.map((member) => (
          <motion.div
            key={member.id}
            layout
            initial={{ opacity: 0, scale: 0.86, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 12 }}
            transition={{
              layout: { type: "spring", stiffness: 260, damping: 30 },
              default: { type: "spring", stiffness: 320, damping: 28 },
            }}
            className="min-h-0 min-w-0"
          >
            {renderTile(member)}
          </motion.div>
        ))}

        {ghost && room && (
          <motion.div
            key="__ghost"
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="min-h-0 min-w-0"
          >
            <GhostTile room={room} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
