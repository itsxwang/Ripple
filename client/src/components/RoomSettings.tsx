import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuBell,
  LuBellOff,
  LuEye,
  LuEyeOff,
  LuLock,
  LuMessageSquare,
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
  DmBlockScope,
  JoinPolicy,
  MediaState,
  Member,
  Prefs,
  Presence,
  RoomInfo,
} from "../types";
import type { DeviceList } from "../lib/media";
import { playTestTone } from "../lib/media";
import { blockScopeLabel } from "../lib/dm";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { MediaTest } from "./MediaTest";
import { Avatar } from "./Avatar";

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
  members: Member[];
  canAdmin: boolean;
  presence: Presence;
  onSwitchDevice: (kind: "audio" | "video", deviceId: string) => Promise<void>;
  onRefreshDevices: () => Promise<void>;
  onRetryMedia: () => void;
  onSetPolicy: (policy: JoinPolicy) => void;
  onAdminAction: (payload: AdminActionPayload) => void;
  blockedUserIds: Set<string>;
  onBlockDm: (member: Member, scope: DmBlockScope) => void;
  onUnblockDm: (userId: string) => void;
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
  members,
  canAdmin,
  presence,
  onSwitchDevice,
  onRefreshDevices,
  onRetryMedia,
  onSetPolicy,
  onAdminAction,
  blockedUserIds,
  onBlockDm,
  onUnblockDm,
}: RoomSettingsProps) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [testMicOn, setTestMicOn] = useState(true);
  const [testCamOn, setTestCamOn] = useState(true);
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [testRetry, setTestRetry] = useState(0);
  const [blockFor, setBlockFor] = useState<string | null>(null);
  const testStateRef = useRef({ mic: testMicOn, cam: testCamOn });
  testStateRef.current = { mic: testMicOn, cam: testCamOn };
  const level = useAudioLevel(testStream, testMicOn);
  const policy = room?.joinPolicy ?? "open";
  const others = members.filter((member) => !member.isSelf);
  const blocks = Object.values(prefs.dmBlocks).sort((a, b) => b.ts - a.ts);

  /**
   * The in-room media test is strictly local: clone the live capture tracks
   * so the preview and meter never touch the tracks that are being sent to
   * other members. Toggling the test mic/camera only changes the clones.
   *
   * We deliberately never open a second microphone/camera here. Requesting
   * the same device twice can make the live call's track go silent (or make
   * some OS/browser combinations play a device chime into the call), so a
   * missing track is reported as unavailable instead.
   */
  useEffect(() => {
    if (!open) {
      setTestStream(null);
      return;
    }
    const stream = new MediaStream();
    const audio = localStream?.getAudioTracks()[0];
    const video = localStream?.getVideoTracks()[0];
    if (audio && audio.readyState === "live") {
      const clone = audio.clone();
      clone.enabled = testStateRef.current.mic;
      stream.addTrack(clone);
    }
    if (video && video.readyState === "live") {
      const clone = video.clone();
      clone.enabled = testStateRef.current.cam;
      stream.addTrack(clone);
    }
    setTestStream(stream);

    return () => {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      });
    };
  }, [open, localStream, testRetry]);

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

  const missingMic = localStream
    ? localStream.getAudioTracks().length === 0
    : false;
  const testNotice = missingMic
    ? "No microphone is connected to this call yet. Use Reconnect mic & camera below."
    : null;

  const handleTestPrefs = (patch: Partial<Prefs>) => {
    if (patch.micOn !== undefined) setTestMicOn(patch.micOn);
    if (patch.camOn !== undefined) setTestCamOn(patch.camOn);
  };

  /**
   * The speaker tone is played through this device's speakers, so the live
   * microphone could pick it up and send it to everyone else. Mute both the
   * outgoing track and the private test track for the duration of the tone,
   * then restore exactly what was enabled before.
   */
  const handleTestSpeaker = async () => {
    const live = localStream?.getAudioTracks()[0];
    const test = testStream?.getAudioTracks()[0];
    const liveWasEnabled = live?.enabled ?? false;
    const testWasEnabled = test?.enabled ?? false;
    if (live && live.readyState === "live") live.enabled = false;
    if (test && test.readyState === "live") test.enabled = false;
    try {
      /* Give the encoder a moment to send silence before the tone starts. */
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 60);
      });
      await playTestTone();
    } finally {
      if (live && live.readyState === "live") live.enabled = liveWasEnabled;
      if (test && test.readyState === "live") test.enabled = testWasEnabled;
    }
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
                error={testNotice}
                compact
                testMode
                devicesOpen
                onTestSpeaker={handleTestSpeaker}
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

            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2.5">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                <LuBell className="h-3 w-3 text-cyan-300" />
                Message notifications
              </p>
              <div className="space-y-1.5">
                <ToggleRow
                  label="Everyone messages"
                  hint="Toast when someone messages the whole room."
                  on={prefs.notifyEveryone}
                  onToggle={() =>
                    onPrefsChange({
                      notifyEveryone: !prefs.notifyEveryone,
                    })
                  }
                  icon={<LuBellOff className="h-4 w-4" />}
                  activeIcon={<LuBell className="h-4 w-4" />}
                />
                <ToggleRow
                  label="All direct messages"
                  hint="Master switch for private-message toasts."
                  on={prefs.notifyDms}
                  onToggle={() =>
                    onPrefsChange({ notifyDms: !prefs.notifyDms })
                  }
                  icon={<LuMessageSquare className="h-4 w-4" />}
                  activeIcon={<LuBell className="h-4 w-4" />}
                />
              </div>

              <div className="mt-2 rounded-xl border border-white/8 bg-black/20 p-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  Direct messages per person
                </p>
                {others.length === 0 ? (
                  <p className="px-1 py-1 text-[10px] text-white/25">
                    No one else is here yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {others.map((member) => {
                      const notifyOn =
                        prefs.dmNotifyOverrides[member.userId] !== false;
                      const activeBlock = blockedUserIds.has(member.userId);
                      const chooserOpen = blockFor === member.userId;
                      return (
                        <div
                          key={member.id}
                          className={`rounded-xl px-1.5 py-1.5 ${
                            activeBlock
                              ? "bg-rose-500/[0.07] ring-1 ring-inset ring-rose-400/20"
                              : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar
                              avatar={member.avatar}
                              color={member.color}
                              photo={member.photo}
                              size="xs"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium text-white/80">
                                {member.name}
                              </p>
                              <p className="text-[9px] leading-snug text-white/30">
                                {activeBlock
                                  ? "Direct messages blocked"
                                  : notifyOn
                                    ? "DM notifications on"
                                    : "DM notifications muted"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onPrefsChange({
                                  dmNotifyOverrides: {
                                    ...prefs.dmNotifyOverrides,
                                    [member.userId]: !notifyOn,
                                  },
                                })
                              }
                              aria-label={
                                notifyOn
                                  ? `Mute DM notifications from ${member.name} (settings)`
                                  : `Unmute DM notifications from ${member.name} (settings)`
                              }
                              title={
                                notifyOn
                                  ? `Mute DM notifications from ${member.name}`
                                  : `Unmute DM notifications from ${member.name}`
                              }
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                                notifyOn
                                  ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-200"
                                  : "border-white/8 bg-white/[0.03] text-white/35 hover:bg-white/10 hover:text-white/70"
                              }`}
                            >
                              {notifyOn ? (
                                <LuBell className="h-3.5 w-3.5" />
                              ) : (
                                <LuBellOff className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (activeBlock) {
                                  onUnblockDm(member.userId);
                                  setBlockFor(null);
                                } else {
                                  setBlockFor(
                                    chooserOpen ? null : member.userId,
                                  );
                                }
                              }}
                              aria-label={
                                activeBlock
                                  ? `Unblock DMs from ${member.name} (settings)`
                                  : `Block DMs from ${member.name} (settings)`
                              }
                              title={
                                activeBlock
                                  ? `Unblock DMs from ${member.name}`
                                  : `Block DMs from ${member.name}`
                              }
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                                activeBlock
                                  ? "border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                                  : "border-white/8 bg-white/[0.03] text-white/35 hover:border-rose-400/25 hover:bg-rose-500/10 hover:text-rose-200"
                              }`}
                            >
                              {activeBlock ? (
                                <LuBell className="h-3.5 w-3.5" />
                              ) : (
                                <LuBellOff className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>

                          {chooserOpen && !activeBlock && (
                            <div className="mt-1.5 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] p-1.5">
                              <p className="text-[9px] font-semibold text-rose-100/80">
                                Block DMs from {member.name} for…
                              </p>
                              <div className="mt-1 grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onBlockDm(member, "room");
                                    setBlockFor(null);
                                  }}
                                  className="rounded-md border border-rose-400/25 bg-rose-500/15 px-1.5 py-1.5 text-[9px] font-semibold text-rose-100 transition hover:bg-rose-500/25"
                                >
                                  This meeting
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onBlockDm(member, "all");
                                    setBlockFor(null);
                                  }}
                                  className="rounded-md border border-rose-400/25 bg-rose-500/15 px-1.5 py-1.5 text-[9px] font-semibold text-rose-100 transition hover:bg-rose-500/25"
                                >
                                  All meetings
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setBlockFor(null)}
                                className="mt-1 w-full py-0.5 text-[9px] text-white/35 transition hover:text-white/70"
                              >
                                cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-2 rounded-xl border border-white/8 bg-black/20 p-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  Blocked direct messages · {blocks.length}
                </p>
                {blocks.length === 0 ? (
                  <p className="px-1 py-1 text-[10px] text-white/25">
                    You haven't blocked anyone's DMs.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {blocks.map((block) => (
                      <div
                        key={block.userId}
                        className="flex items-center gap-2 rounded-lg bg-rose-500/[0.07] px-1.5 py-1.5"
                      >
                        <Avatar
                          avatar={block.avatar}
                          color={block.color}
                          photo={block.photo}
                          size="xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-rose-100/90">
                            {block.name}
                          </p>
                          <p className="truncate text-[9px] text-rose-200/45">
                            {blockScopeLabel(block, room?.id)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUnblockDm(block.userId)}
                          aria-label={`Unblock ${block.name} (blocked list)`}
                          className="shrink-0 rounded-lg border border-rose-300/25 bg-rose-400/15 px-2 py-1 text-[9px] font-semibold text-rose-100 transition hover:bg-rose-400/25"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
