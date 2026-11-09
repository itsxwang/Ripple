import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuEye,
  LuEyeOff,
  LuLock,
  LuMicOff,
  LuRadio,
  LuRefreshCw,
  LuSettings2,
  LuShieldOff,
  LuLockOpen,
  LuUsers,
  LuVolume2,
  LuVolumeX,
  LuX,
} from "react-icons/lu";
import type {
  AdminActionPayload,
  JoinPolicy,
  MediaState,
  Prefs,
  Presence,
  RoomInfo,
} from "../types";
import type { DeviceList } from "../lib/media";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { MediaTest } from "./MediaTest";

interface RoomSettingsProps {
  open: boolean;
  onClose: () => void;
  prefs: Prefs;
  onPrefsChange: (patch: Partial<Prefs>) => void;
  selfMedia: MediaState;
  localStream: MediaStream | null;
  photoFull?: string;
  devices: DeviceList;
  room: RoomInfo | null;
  canAdmin: boolean;
  presence: Presence;
  onSwitchDevice: (kind: "audio" | "video", deviceId: string) => Promise<void>;
  onRefreshDevices: () => Promise<void>;
  onRetryMedia: () => void;
  onSetPolicy: (policy: JoinPolicy) => void;
  onAdminAction: (payload: AdminActionPayload) => void;
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
  icon,
  activeIcon,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
        on
          ? "border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"
          : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
      }`}
      aria-pressed={on}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          on ? "bg-lime-300/15 text-lime-200" : "bg-white/[0.04] text-white/35"
        }`}
      >
        {on ? activeIcon : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-white/85">
          {label}
        </span>
        <span className="block text-[10px] text-white/35">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          on ? "bg-lime-300" : "bg-white/12"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#08130a] shadow transition-all ${
            on ? "left-[1.15rem]" : "left-0.5 bg-white/80"
          }`}
        />
      </span>
    </button>
  );
}

export function RoomSettings({
  open,
  onClose,
  prefs,
  onPrefsChange,
  selfMedia,
  localStream,
  photoFull,
  devices,
  room,
  canAdmin,
  presence,
  onSwitchDevice,
  onRefreshDevices,
  onRetryMedia,
  onSetPolicy,
  onAdminAction,
}: RoomSettingsProps) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [testMicOn, setTestMicOn] = useState(true);
  const [testCamOn, setTestCamOn] = useState(true);
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [testRetry, setTestRetry] = useState(0);
  const level = useAudioLevel(testStream, testMicOn);
  const policy = room?.joinPolicy ?? "open";

  /**
   * The in-room media test is strictly local: clone the live capture tracks
   * so the preview and meter never touch the tracks that are being sent to
   * other members. Toggling the test mic/camera only changes the clones.
   */
  useEffect(() => {
    if (!open) {
      setTestStream(null);
      return;
    }
    let cancelled = false;
    const stream = new MediaStream();
    const audio = localStream?.getAudioTracks()[0];
    const video = localStream?.getVideoTracks()[0];
    if (audio && audio.readyState === "live") {
      stream.addTrack(audio.clone());
    }
    if (video && video.readyState === "live") {
      stream.addTrack(video.clone());
    }
    setTestStream(stream);

    const acquireTestTrack = async (kind: "audio" | "video") => {
      const deviceId =
        kind === "audio" ? prefs.audioDeviceId : prefs.videoDeviceId;
      const attempts: MediaStreamConstraints[] =
        kind === "audio"
          ? [
              {
                audio: {
                  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
              },
              { audio: true },
            ]
          : [
              {
                video: {
                  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: "user",
                },
              },
              { video: true },
            ];
      for (const constraints of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          /* try the next constraint set */
        }
      }
      return null;
    };

    const addMissingTrack = async (
      kind: "audio" | "video",
      existing: MediaStreamTrack | undefined,
    ) => {
      if (existing && existing.readyState === "live") return;
      const result = await acquireTestTrack(kind);
      const track = result?.getTracks()[0];
      if (!track) return;
      if (cancelled) {
        track.stop();
        return;
      }
      stream.addTrack(track);
      setTestStream(new MediaStream(stream.getTracks()));
    };

    void addMissingTrack("audio", audio);
    void addMissingTrack("video", video);

    return () => {
      cancelled = true;
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      });
    };
  }, [open, localStream, testRetry, prefs.audioDeviceId, prefs.videoDeviceId]);

  useEffect(() => {
    if (!testStream) return;
    testStream.getAudioTracks().forEach((track) => {
      track.enabled = testMicOn;
    });
    testStream.getVideoTracks().forEach((track) => {
      track.enabled = testCamOn;
    });
  }, [testStream, testMicOn, testCamOn]);

  useEffect(() => {
    if (!open) {
      setConfirmRevoke(false);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  const mediaPrefs: Prefs = {
    ...prefs,
    micOn: testMicOn,
    camOn: testCamOn,
  };

  const handleTestPrefs = (patch: Partial<Prefs>) => {
    if (patch.micOn !== undefined) setTestMicOn(patch.micOn);
    if (patch.camOn !== undefined) setTestCamOn(patch.camOn);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] flex items-end justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-md sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0a0e16]/97 p-4 shadow-2xl shadow-black/70 sm:rounded-[28px] sm:p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-lime-200">
                  <LuSettings2 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-white">
                    Audio, video &amp; room
                  </h2>
                  <p className="text-[10px] text-white/35">
                    Test your setup without leaving the call
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-white/45 transition hover:bg-white/10 hover:text-white"
                aria-label="Close settings"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-white/40">
              <LuUsers className="h-3 w-3 text-lime-300/70" />
              {presence.online > 0
                ? `${presence.online} people have Ripple open`
                : "Connected"}
              {presence.inCalls > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/20" />
                  {presence.inCalls} in calls
                </>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-lime-300/15 bg-lime-300/[0.05] px-2.5 py-2">
                <LuLock className="mt-0.5 h-3 w-3 shrink-0 text-lime-200" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime-100/90">
                    Private check
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">
                    Only you can see and hear this preview. The test buttons
                    never change what other people see or hear.
                  </p>
                </div>
              </div>
              <MediaTest
                stream={testStream}
                devices={devices}
                level={level}
                prefs={mediaPrefs}
                onPrefsChange={handleTestPrefs}
                onDeviceChange={(kind, deviceId) => {
                  void onSwitchDevice(kind, deviceId);
                }}
                onRefreshDevices={() => {
                  void onRefreshDevices();
                }}
                onRetryCamera={() => {
                  setTestRetry((value) => value + 1);
                  onRetryMedia();
                }}
                photoFull={photoFull}
                error={null}
                compact
                testMode
                devicesOpen
              />
              <p className="mt-1.5 text-center text-[10px] leading-relaxed text-white/30">
                In the room: mic {selfMedia.micOn ? "on" : "off"} · camera{" "}
                {selfMedia.camOn ? "on" : "off"}. Use the main controls to
                change your broadcast.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setTestRetry((value) => value + 1);
                onRetryMedia();
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-white/50 transition hover:bg-white/8 hover:text-white/80"
            >
              <LuRefreshCw className="h-3.5 w-3.5" />
              Reconnect mic &amp; camera
            </button>

            <div className="mt-3 space-y-1.5">
              <ToggleRow
                label="Show reactions on screen"
                hint="Turn this off to keep floating emoji and GIFs out of your view."
                on={prefs.reactionsVisible}
                onToggle={() =>
                  onPrefsChange({
                    reactionsVisible: !prefs.reactionsVisible,
                  })
                }
                icon={<LuEyeOff className="h-4 w-4" />}
                activeIcon={<LuEye className="h-4 w-4" />}
              />
              <ToggleRow
                label="Reaction sounds"
                hint="A tiny pop whenever someone reacts."
                on={prefs.reactionSounds}
                onToggle={() =>
                  onPrefsChange({
                    reactionSounds: !prefs.reactionSounds,
                  })
                }
                icon={<LuVolumeX className="h-4 w-4" />}
                activeIcon={<LuVolume2 className="h-4 w-4" />}
              />
            </div>

            {canAdmin && room && (
              <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  <LuRadio className="h-3 w-3 text-amber-300" />
                  Host controls
                </p>

                <div className="rounded-xl border border-white/8 bg-black/20 p-2">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/65">
                    {policy === "request" ? (
                      <LuLock className="h-3.5 w-3.5 text-amber-300" />
                    ) : (
                      <LuLockOpen className="h-3.5 w-3.5 text-lime-300" />
                    )}
                    Join policy
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-0.5">
                    <button
                      type="button"
                      onClick={() => onSetPolicy("open")}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
                        policy === "open"
                          ? "bg-white/10 text-white"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      Anyone can join
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetPolicy("request")}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
                        policy === "request"
                          ? "bg-white/10 text-white"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      Approval needed
                    </button>
                  </div>
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAdminAction({ action: "muteAll" })}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-2 text-[11px] font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
                  >
                    <LuMicOff className="h-3.5 w-3.5" />
                    Mute everyone
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAdminAction({ action: "clearRestrictions" })
                    }
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-2 text-[11px] font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
                  >
                    Lift restrictions
                  </button>
                </div>

                {!confirmRevoke ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(true)}
                    className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-white/45 transition hover:border-rose-400/25 hover:text-rose-200"
                  >
                    <LuShieldOff className="h-3.5 w-3.5" />
                    Revoke all admin privileges
                  </button>
                ) : (
                  <div className="mt-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-2">
                    <p className="text-[10px] leading-relaxed text-rose-100/80">
                      Remove every admin, including yourself, and open the room
                      to everyone?
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(false)}
                        className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAdminAction({ action: "revokeAll" });
                          setConfirmRevoke(false);
                        }}
                        className="flex-1 rounded-lg bg-rose-500 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-rose-400"
                      >
                        Revoke all
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
