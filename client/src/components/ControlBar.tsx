import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuCheck,
  LuEye,
  LuEyeOff,
  LuHand,
  LuImage,
  LuLock,
  LuMessageCircle,
  LuMic,
  LuMicOff,
  LuMonitorUp,
  LuEllipsis,
  LuPhoneOff,
  LuSettings,
  LuSmilePlus,
  LuUpload,
  LuUsers,
  LuVideo,
  LuVideoOff,
  LuVolume2,
  LuVolumeX,
  LuX,
} from "react-icons/lu";
import {
  GIF_MAX_BYTES,
  REACTION_GROUPS,
} from "../lib/constants";
import { readFileAsDataUrl } from "../lib/media";
import type { MediaState } from "../types";

interface ControlBarProps {
  media: MediaState;
  panel: "chat" | "people" | null;
  unreadTotal: number;
  pendingCount: number;
  handRaised: boolean;
  settingsOpen: boolean;
  reactionsVisible: boolean;
  reactionSounds: boolean;
  screenAllowed?: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onReaction: (payload: { emoji?: string; gif?: string }) => void;
  onToggleHand: () => void;
  onToggleReactionsVisible: () => void;
  onToggleReactionSounds: () => void;
  onOpenChat: () => void;
  onOpenPeople: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  warn?: boolean;
  muted?: boolean;
  danger?: boolean;
  badge?: number;
  className?: string;
  children: ReactNode;
}

function ControlButton({
  label,
  onClick,
  active = false,
  warn = false,
  muted = false,
  danger = false,
  badge,
  className = "",
  children,
}: ControlButtonProps) {
  const tone = danger
    ? "border-rose-400/30 bg-rose-500/90 text-white hover:bg-rose-400"
    : warn
      ? "border-amber-300/35 bg-amber-400/20 text-amber-200 hover:bg-amber-400/30"
      : muted
        ? "border-rose-300/25 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
        : active
          ? "border-lime-300/30 bg-lime-300/15 text-lime-200 hover:bg-lime-300/25"
          : "border-white/10 bg-white/[0.055] text-white/70 hover:bg-white/12 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active || warn}
      className={`relative flex shrink-0 items-center justify-center rounded-2xl border backdrop-blur-md transition-all duration-200 active:scale-90 ${
        danger
          ? "h-8 w-10 sm:h-11 sm:w-auto sm:px-4"
          : "h-8 w-8 sm:h-11 sm:w-11"
      } ${tone} ${className}`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-300 px-1 text-[9px] font-bold text-[#0b130a] shadow">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function ReactionPicker({
  onClose,
  onReaction,
  reactionsVisible,
  reactionSounds,
  onToggleReactionsVisible,
  onToggleReactionSounds,
}: {
  onClose: () => void;
  onReaction: (payload: { emoji?: string; gif?: string }) => void;
  reactionsVisible: boolean;
  reactionSounds: boolean;
  onToggleReactionsVisible: () => void;
  onToggleReactionSounds: () => void;
}) {
  const [tab, setTab] = useState<"emoji" | "gif">("emoji");
  const [gif, setGif] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(gif|webp|png)$/.test(file.type)) {
      setError("Pick a GIF, WebP or PNG.");
      return;
    }
    if (file.size > GIF_MAX_BYTES) {
      setError("That GIF is over 1.5 MB. Try a smaller one.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!/^data:image\/(gif|webp|png);base64,/.test(dataUrl)) {
        setError("That file couldn't be used as a GIF.");
        return;
      }
      setGif(dataUrl);
      setError(null);
    } catch {
      setError("That file couldn't be read.");
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.94 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="absolute bottom-full left-1/2 z-30 mb-3 w-[min(90vw,350px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0b0f16]/97 p-2.5 shadow-2xl shadow-black/70 backdrop-blur-2xl"
      >
        <div className="mb-2 flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => setTab("emoji")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
              tab === "emoji"
                ? "bg-white/10 text-white"
                : "text-white/45 hover:text-white/75"
            }`}
          >
            <LuSmilePlus className="h-3.5 w-3.5" /> Emoji
          </button>
          <button
            type="button"
            onClick={() => setTab("gif")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
              tab === "gif"
                ? "bg-white/10 text-white"
                : "text-white/45 hover:text-white/75"
            }`}
          >
            <LuImage className="h-3.5 w-3.5" /> GIF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-white"
            aria-label="Close reactions"
          >
            <LuX className="h-3.5 w-3.5" />
          </button>
        </div>

        {tab === "emoji" ? (
          <div className="max-h-[min(46vh,260px)] space-y-2 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
            {REACTION_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReaction({ emoji });
                        onClose();
                      }}
                      className="flex h-8 w-full items-center justify-center rounded-lg text-base transition hover:scale-110 hover:bg-white/10 active:scale-95"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/gif,image/webp,image/png"
              className="hidden"
              onChange={(event) => {
                void pickFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {gif ? (
              <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/25 p-2">
                <img
                  src={gif}
                  alt="GIF preview"
                  className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white">Ready to send</p>
                  <p className="mt-0.5 text-[10px] text-white/35">
                    Everyone in the room will see it pop.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onReaction({ gif });
                    onClose();
                  }}
                  className="flex items-center gap-1 rounded-lg bg-lime-300 px-2.5 py-1.5 text-[11px] font-bold text-[#08130a] transition hover:bg-lime-200 active:scale-95"
                >
                  <LuCheck className="h-3 w-3" /> Send
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void pickFile(event.dataTransfer.files?.[0]);
                }}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-6 text-center transition hover:border-lime-300/35 hover:bg-lime-300/[0.04]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-lime-200">
                  <LuUpload className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-white/80">
                  Drop a GIF here
                </span>
                <span className="text-[10px] text-white/35">
                  or click to choose one · GIF, WebP, PNG up to 1.5 MB
                </span>
              </button>
            )}
            {gif && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 w-full text-[10px] text-white/30 transition hover:text-white/60"
              >
                choose a different GIF
              </button>
            )}
            {error && (
              <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-200">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1 border-t border-white/6 pt-2">
          <button
            type="button"
            onClick={onToggleReactionsVisible}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
              reactionsVisible
                ? "bg-white/[0.05] text-white/65 hover:bg-white/10 hover:text-white"
                : "bg-rose-500/10 text-rose-300"
            }`}
          >
            {reactionsVisible ? (
              <LuEye className="h-3 w-3" />
            ) : (
              <LuEyeOff className="h-3 w-3" />
            )}
            {reactionsVisible ? "Show on screen" : "Hidden on screen"}
          </button>
          <button
            type="button"
            onClick={onToggleReactionSounds}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
              reactionSounds
                ? "bg-white/[0.05] text-white/65 hover:bg-white/10 hover:text-white"
                : "text-white/30 hover:text-white/60"
            }`}
            aria-label="Toggle reaction sounds"
          >
            {reactionSounds ? (
              <LuVolume2 className="h-3 w-3" />
            ) : (
              <LuVolumeX className="h-3 w-3" />
            )}
            sound
          </button>
        </div>
      </motion.div>
    </>
  );
}

export function ControlBar({
  media,
  panel,
  unreadTotal,
  pendingCount,
  handRaised,
  settingsOpen,
  reactionsVisible,
  reactionSounds,
  screenAllowed = true,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onReaction,
  onToggleHand,
  onToggleReactionsVisible,
  onToggleReactionSounds,
  onOpenChat,
  onOpenPeople,
  onOpenSettings,
  onLeave,
}: ControlBarProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="relative z-20 shrink-0 px-2 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-1.5 sm:px-4 sm:pt-2">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-[22px] border border-white/10 bg-[#080b11]/85 p-1 shadow-[0_18px_60px_-18px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:gap-1.5 sm:rounded-[26px] sm:p-2">
        <ControlButton
          label={media.micOn ? "Mute microphone" : "Unmute microphone"}
          onClick={onToggleMic}
          muted={!media.micOn}
        >
          {media.micOn ? (
            <LuMic className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <LuMicOff className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </ControlButton>

        <ControlButton
          label={media.camOn ? "Turn camera off" : "Turn camera on"}
          onClick={onToggleCam}
          muted={!media.camOn}
        >
          {media.camOn ? (
            <LuVideo className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <LuVideoOff className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </ControlButton>

        <ControlButton
          label="Raise or lower your hand"
          onClick={onToggleHand}
          warn={handRaised}
        >
          <LuHand className="h-4 w-4 sm:h-5 sm:w-5" />
        </ControlButton>

        <div className="relative">
          <ControlButton
            label="Send a reaction"
            onClick={() => setReactionsOpen((open) => !open)}
            active={reactionsOpen}
          >
            <LuSmilePlus className="h-4 w-4 sm:h-5 sm:w-5" />
          </ControlButton>

          <AnimatePresence>
            {reactionsOpen && (
              <ReactionPicker
                onClose={() => setReactionsOpen(false)}
                onReaction={onReaction}
                reactionsVisible={reactionsVisible}
                reactionSounds={reactionSounds}
                onToggleReactionsVisible={onToggleReactionsVisible}
                onToggleReactionSounds={onToggleReactionSounds}
              />
            )}
          </AnimatePresence>
          {reactionsOpen && (
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setReactionsOpen(false)}
              aria-label="Dismiss reactions"
              tabIndex={-1}
            />
          )}
        </div>

        <span className="mx-0.5 hidden h-7 w-px bg-white/10 sm:block" />

        <ControlButton
          label="Open chat"
          onClick={onOpenChat}
          active={panel === "chat"}
          badge={unreadTotal}
        >
          <LuMessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
        </ControlButton>

        <ControlButton
          label="Open people"
          onClick={onOpenPeople}
          active={panel === "people"}
          badge={pendingCount}
        >
          <LuUsers className="h-4 w-4 sm:h-5 sm:w-5" />
        </ControlButton>

        <ControlButton
          label={
            screenAllowed ? "Share your screen" : "Screen sharing is off here"
          }
          onClick={onToggleScreen}
          active={media.screenOn}
          className={`hidden sm:flex ${screenAllowed ? "" : "opacity-45"}`}
        >
          {screenAllowed ? (
            <LuMonitorUp className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <LuLock className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </ControlButton>

        <ControlButton
          label="Audio & room settings"
          onClick={onOpenSettings}
          active={settingsOpen}
          className="hidden sm:flex"
        >
          <LuSettings className="h-4 w-4 sm:h-5 sm:w-5" />
        </ControlButton>

        <div className="relative sm:hidden">
          <ControlButton
            label="More controls"
            onClick={() => setMoreOpen((open) => !open)}
            active={moreOpen}
          >
            <LuEllipsis className="h-4 w-4" />
          </ControlButton>
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.94 }}
                className="absolute bottom-full right-0 z-30 mb-3 w-44 rounded-2xl border border-white/10 bg-[#0b0f16]/97 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-2xl"
              >
                  <button
                    type="button"
                    onClick={() => {
                      onToggleScreen();
                      setMoreOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition ${
                      media.screenOn
                        ? "bg-cyan-400/15 text-cyan-200"
                        : screenAllowed
                          ? "text-white/65 hover:bg-white/8 hover:text-white"
                          : "text-white/30"
                    }`}
                  >
                    {screenAllowed ? (
                      <LuMonitorUp className="h-4 w-4" />
                    ) : (
                      <LuLock className="h-4 w-4" />
                    )}
                    {media.screenOn
                      ? "Stop sharing"
                      : screenAllowed
                        ? "Share screen"
                        : "Screen off here"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettings();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-white/65 transition hover:bg-white/8 hover:text-white"
                  >
                    <LuSettings className="h-4 w-4" />
                    Audio & settings
                  </button>
                </motion.div>
            )}
          </AnimatePresence>
          {moreOpen && (
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setMoreOpen(false)}
              aria-label="Dismiss more controls"
              tabIndex={-1}
            />
          )}
        </div>

        <span className="mx-0.5 hidden h-7 w-px bg-white/10 sm:block" />

        <ControlButton label="Leave the room" onClick={onLeave} danger>
          <LuPhoneOff className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="ml-1.5 hidden text-xs font-semibold sm:inline">
            Leave
          </span>
        </ControlButton>
      </div>
    </div>
  );
}
