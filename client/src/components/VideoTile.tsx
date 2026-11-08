import { useEffect, useRef } from "react";
import {
  LuCrown,
  LuEyeOff,
  LuHand,
  LuMicOff,
  LuMonitorUp,
  LuPin,
  LuPinOff,
  LuShieldCheck,
  LuSignal,
  LuVideoOff,
  LuVolumeX,
  LuWifiOff,
} from "react-icons/lu";
import type { LocalMute, Member } from "../types";
import { gradientFor } from "../lib/constants";
import { Avatar } from "./Avatar";

interface VideoTileProps {
  member: Member;
  stream?: MediaStream | null;
  speaking?: boolean;
  isSelf?: boolean;
  isScreenShare?: boolean;
  localMute?: LocalMute;
  pinned?: boolean;
  onTogglePin?: () => void;
  compact?: boolean;
  connection?: RTCPeerConnectionState;
}

function Equalizer() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-[2px] rounded-full bg-lime-300 eq-bar"
          style={{ animationDelay: `${bar * 0.14}s` }}
        />
      ))}
    </span>
  );
}

function ConnectionBadge({
  state,
}: {
  state?: RTCPeerConnectionState;
}) {
  if (!state || state === "connected" || state === "closed") return null;
  const bad = state === "failed" || state === "disconnected";
  return (
    <span
      title={bad ? "Connection trouble" : "Connecting peer-to-peer"}
      className={`absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider backdrop-blur-md ${
        bad
          ? "border-amber-300/25 bg-amber-400/15 text-amber-200"
          : "border-white/10 bg-black/40 text-white/55"
      }`}
    >
      {bad ? (
        <LuWifiOff className="h-3 w-3" />
      ) : (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300" />
      )}
      {bad ? "reconnecting" : "connecting"}
    </span>
  );
}

export function VideoTile({
  member,
  stream,
  speaking = false,
  isSelf = false,
  isScreenShare = false,
  localMute,
  pinned = false,
  onTogglePin,
  compact = false,
  connection,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioMuted = Boolean(localMute?.audio);
  const videoHidden = Boolean(localMute?.video);
  const showVideo =
    Boolean(stream) &&
    (member.media.camOn || member.media.screenOn) &&
    !videoHidden;
  const hasPoster = Boolean(member.photoFull);
  const posterMode = !showVideo && hasPoster;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    // Set muted before attaching the stream — leaving this to a later
    // effect caused the local microphone to echo back to the sender.
    element.muted = Boolean(isSelf) || audioMuted;
    if (element.srcObject !== stream) {
      element.srcObject = stream ?? null;
    }
    if (stream) {
      void element.play().catch(() => undefined);
    }
  }, [stream, isSelf, audioMuted]);

  return (
    <div
      className={`group relative h-full w-full overflow-hidden rounded-[26px] border bg-[#0b0e15] transition-all duration-300 ${
        speaking
          ? "border-lime-300/60 shadow-[0_0_0_1px_rgba(190,242,100,0.35),0_0_38px_-8px_rgba(190,242,100,0.35)]"
          : "border-white/10 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]"
      }`}
    >
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf || audioMuted}
          className={`absolute inset-0 h-full w-full ${
            isScreenShare ? "object-contain" : "object-cover"
          } ${isSelf && !isScreenShare ? "-scale-x-100" : ""} ${
            showVideo ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
        />
      )}

      {!showVideo && posterMode && (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={member.photoFull}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#05070c]/40 via-[#05070c]/55 to-[#05070c]/85" />
          <div className="absolute inset-0 flex items-center justify-center p-3 pb-16">
            <div className="relative h-full w-full max-w-full">
              <img
                src={member.photoFull}
                alt={`${member.name}'s profile`}
                className="absolute inset-0 m-auto max-h-full max-w-full rounded-2xl object-contain shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
              />
            </div>
          </div>
        </div>
      )}

      {!showVideo && !posterMode && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[70px]"
            style={{ background: gradientFor(member.color) }}
          />
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-3">
            <Avatar
              avatar={member.avatar}
              color={member.color}
              photo={member.photo}
              size="xl"
              speaking={speaking}
            />
            {!compact && (
              <span className="flex items-center gap-1.5 font-display text-sm font-medium text-white/50">
                {member.restricted.cam ? (
                  <>
                    <LuVideoOff className="h-3.5 w-3.5 text-rose-300/70" />
                    Camera restricted
                  </>
                ) : member.media.micOn ? (
                  "Camera off"
                ) : (
                  "Mic & camera off"
                )}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      <ConnectionBadge state={connection} />

      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? "Unpin participant" : "Pin participant"}
          title={pinned ? "Unpin" : "Pin to focus"}
          className={`absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition ${
            pinned
              ? "border-lime-300/40 bg-lime-300/20 text-lime-200"
              : "border-white/10 bg-black/40 text-white/55 opacity-0 hover:bg-black/60 hover:text-white group-hover:opacity-100"
          }`}
        >
          {pinned ? (
            <LuPinOff className="h-3.5 w-3.5" />
          ) : (
            <LuPin className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
            {member.role === "host" && (
              <LuCrown className="h-3 w-3 shrink-0 text-amber-300" />
            )}
            {member.role === "admin" && (
              <LuShieldCheck className="h-3 w-3 shrink-0 text-violet-300" />
            )}
            <span className="max-w-[7.5rem] truncate sm:max-w-[13rem]">
              {member.name}
            </span>
            {isSelf && (
              <span className="rounded-full bg-white/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white/70">
                you
              </span>
            )}
            {speaking && !compact && <Equalizer />}
          </span>
          {!member.media.micOn && (
            <span
              title={
                member.restricted.mic
                  ? "Muted by a host"
                  : "Microphone is off"
              }
              className={`flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-md ${
                member.restricted.mic
                  ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                  : "border-rose-400/20 bg-rose-500/15 text-rose-300"
              }`}
            >
              <LuMicOff className="h-3.5 w-3.5" />
            </span>
          )}
          {audioMuted && (
            <span
              title="You muted this person for yourself"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/15 text-cyan-200 backdrop-blur-md"
            >
              <LuVolumeX className="h-3.5 w-3.5" />
            </span>
          )}
          {videoHidden && (
            <span
              title="Video hidden for you"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/15 text-cyan-200 backdrop-blur-md"
            >
              <LuEyeOff className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {member.handRaised && (
            <span
              title={`${member.name} raised a hand`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/20 text-amber-200 backdrop-blur-md"
            >
              <LuHand className="h-3.5 w-3.5" />
            </span>
          )}
          {isScreenShare && (
            <span className="flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 backdrop-blur-md">
              <LuMonitorUp className="h-3 w-3" /> Screen
            </span>
          )}
          {speaking && !compact && (
            <span className="hidden items-center gap-1 rounded-full border border-lime-300/20 bg-lime-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-lime-200 backdrop-blur-md sm:flex">
              <LuSignal className="h-3 w-3" /> Speaking
            </span>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/5" />
    </div>
  );
}
