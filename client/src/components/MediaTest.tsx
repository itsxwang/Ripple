import { useEffect, useRef } from "react";
import {
  LuMic,
  LuMicOff,
  LuRefreshCw,
  LuSlidersHorizontal,
  LuVideo,
  LuVideoOff,
  LuVolume2,
} from "react-icons/lu";
import { playTestTone, type DeviceList } from "../lib/media";
import type { Prefs } from "../types";

interface MediaTestProps {
  stream: MediaStream | null;
  devices: DeviceList;
  level: number;
  prefs: Prefs;
  onPrefsChange: (patch: Partial<Prefs>) => void;
  onDeviceChange?: (kind: "audio" | "video", deviceId: string) => void;
  onRefreshDevices?: () => void;
  error?: string | null;
  compact?: boolean;
  devicesOpen?: boolean;
  onRetryCamera?: () => void;
  photoFull?: string;
}

export function MediaTest({
  stream,
  devices,
  level,
  prefs,
  onPrefsChange,
  onDeviceChange,
  onRefreshDevices,
  error,
  compact = false,
  devicesOpen = false,
  onRetryCamera,
  photoFull,
}: MediaTestProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.muted = true;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);

  const activeAudio = Boolean(stream?.getAudioTracks().some((track) => track.enabled));
  const hasVideo = Boolean(stream?.getVideoTracks().length);

  const devicePicker = (
    <div className="grid gap-2">
      <label className="block">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
          <LuMic className="h-3 w-3" /> Microphone
        </span>
        <select
          value={prefs.audioDeviceId ?? ""}
          onChange={(event) => onDeviceChange?.("audio", event.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b1018] px-2.5 py-2 text-xs text-white/80 outline-none transition focus:border-lime-300/40"
        >
          <option value="">System default</option>
          {devices.audio.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {device.label || `Microphone ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
          <LuVideo className="h-3 w-3" /> Camera
        </span>
        <select
          value={prefs.videoDeviceId ?? ""}
          onChange={(event) => onDeviceChange?.("video", event.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b1018] px-2.5 py-2 text-xs text-white/80 outline-none transition focus:border-lime-300/40"
        >
          <option value="">System default</option>
          {devices.video.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {device.label || `Camera ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      {onRefreshDevices && (
        <button
          type="button"
          onClick={onRefreshDevices}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-white/45 transition hover:bg-white/8 hover:text-white/80"
        >
          <LuRefreshCw className="h-3 w-3" /> Refresh device list
        </button>
      )}
    </div>
  );

  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-2.5">
      <div className="relative min-w-0 overflow-hidden rounded-xl border border-white/8 bg-[#06090f]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`min-w-0 w-full max-w-full object-cover ${
            compact ? "h-28" : "h-40"
          } ${prefs.camOn ? "opacity-100" : "opacity-20"} transition-opacity`}
          style={{ transform: "scaleX(-1)" }}
        />
        {!prefs.camOn && (
          <div className="absolute inset-0 overflow-hidden">
            {photoFull ? (
              <>
                <img
                  src={photoFull}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#05070c]/30 via-[#05070c]/45 to-[#05070c]/80" />
                <img
                  src={photoFull}
                  alt="Your camera-off poster"
                  className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/60 backdrop-blur">
                  <LuVideoOff className="h-3.5 w-3.5" /> camera off
                </span>
              </div>
            )}
          </div>
        )}
        {prefs.camOn && !hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#06090f]/80 px-3 text-center">
            <LuVideoOff className="h-5 w-5 text-amber-300/80" />
            <p className="text-[11px] font-medium text-white/60">
              {stream ? "Camera unavailable" : "Starting camera…"}
            </p>
            {stream && onRetryCamera && (
              <button
                type="button"
                onClick={onRetryCamera}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/80 transition hover:bg-white/20 active:scale-95"
              >
                Try again
              </button>
            )}
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/55 backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              prefs.camOn ? "animate-pulse bg-lime-300" : "bg-white/25"
            }`}
          />
          {compact ? "camera check" : "preview"}
        </div>
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPrefsChange({ micOn: !prefs.micOn })}
            className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition active:scale-95 ${
              prefs.micOn
                ? "border-white/12 bg-black/50 text-white/80 hover:bg-black/70"
                : "border-rose-400/30 bg-rose-500/80 text-white"
            }`}
            aria-label={prefs.micOn ? "Mute microphone" : "Unmute microphone"}
          >
            {prefs.micOn ? (
              <LuMic className="h-3.5 w-3.5" />
            ) : (
              <LuMicOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onPrefsChange({ camOn: !prefs.camOn })}
            className={`flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition active:scale-95 ${
              prefs.camOn
                ? "border-white/12 bg-black/50 text-white/80 hover:bg-black/70"
                : "border-rose-400/30 bg-rose-500/80 text-white"
            }`}
            aria-label={prefs.camOn ? "Turn camera off" : "Turn camera on"}
          >
            {prefs.camOn ? (
              <LuVideo className="h-3.5 w-3.5" />
            ) : (
              <LuVideoOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void playTestTone()}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-400/15 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100 backdrop-blur transition hover:bg-cyan-400/25 active:scale-95"
          >
            <LuVolume2 className="h-3 w-3" /> Test speaker
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex w-16 shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/30">
          {activeAudio ? "mic live" : "muted"}
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime-300 via-cyan-300 to-violet-300 transition-[width] duration-75"
            style={{ width: `${Math.round((activeAudio ? level : 0) * 100)}%` }}
          />
        </div>
        <span className="w-6 text-right text-[9px] tabular-nums text-white/25">
          {activeAudio ? `${Math.round(level * 100)}` : "—"}
        </span>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-100/80">
          {error}
        </p>
      )}

      {onDeviceChange && (
        <details
          open={devicesOpen}
          className="group mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 transition hover:text-white/60">
            <LuSlidersHorizontal className="h-3 w-3" />
            Devices &amp; audio test
            <span className="ml-auto text-white/20 transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="mt-2">{devicePicker}</div>
        </details>
      )}
    </div>
  );
}
