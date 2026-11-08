import { useState } from "react";
import {
  LuBan,
  LuCheck,
  LuClock,
  LuCopy,
  LuCrown,
  LuEye,
  LuEyeOff,
  LuHand,
  LuLock,
  LuMessageSquare,
  LuMic,
  LuMicOff,
  LuEllipsis,
  LuMonitorUp,
  LuMonitorOff,
  LuPin,
  LuShieldCheck,
  LuShieldOff,
  LuLockOpen,
  LuUserMinus,
  LuUserPlus,
  LuVideo,
  LuVideoOff,
  LuVolume2,
  LuVolumeX,
  LuX,
} from "react-icons/lu";
import type {
  AdminActionPayload,
  JoinPolicy,
  LocalMute,
  Member,
  RoomInfo,
} from "../types";
import {
  BAN_DURATIONS,
  ROLE_LABELS,
  formatBanExpiry,
  inviteLink,
  roleFor,
} from "../lib/constants";
import { copyText } from "../lib/clipboard";
import { Avatar } from "./Avatar";

interface PeoplePanelProps {
  members: Member[];
  room: RoomInfo | null;
  speaking: string[];
  onMessage: (id: string) => void;
  canAdmin: boolean;
  selfUserId: string;
  online: number;
  onAdminAction: (payload: AdminActionPayload) => void;
  onSetPolicy: (policy: JoinPolicy) => void;
  onApprove: (userId: string) => void;
  onDeny: (userId: string) => void;
  onUnban: (userId: string) => void;
  localMutes: Record<string, LocalMute>;
  onToggleLocalMute: (userId: string, kind: "audio" | "video") => void;
  onFocus: (id: string) => void;
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger" | "good";
  icon: React.ReactNode;
}

function ActionButton({ label, onClick, tone = "default", icon }: ActionButtonProps) {
  const styles =
    tone === "danger"
      ? "border-rose-400/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
      : tone === "good"
        ? "border-lime-300/25 bg-lime-300/10 text-lime-200 hover:bg-lime-300/20"
        : "border-white/8 bg-white/[0.04] text-white/65 hover:bg-white/10 hover:text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold transition active:scale-[0.97] ${styles}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
          {title}
        </p>
        {hint && <p className="mt-0.5 text-[10px] text-white/25">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function PeoplePanel({
  members,
  room,
  speaking,
  onMessage,
  canAdmin,
  selfUserId,
  online,
  onAdminAction,
  onSetPolicy,
  onApprove,
  onDeny,
  onUnban,
  localMutes,
  onToggleLocalMute,
  onFocus,
}: PeoplePanelProps) {
  const [copied, setCopied] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [banFor, setBanFor] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const requests = room?.requests ?? [];
  const bans = room?.bans ?? [];
  const policy = room?.joinPolicy ?? "open";

  const handleCopy = async () => {
    if (!room) return;
    const ok = await copyText(inviteLink(room.id));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent]">
        <SectionTitle
          title={`In this room · ${members.length}${room ? `/${room.maxSize}` : ""}`}
          right={
            <span className="flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/40">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300" />
              {online > 0 ? `${online} online` : "live"}
            </span>
          }
        />

        <div className="flex flex-col gap-1">
          {members.map((member) => {
            const isSelf = Boolean(member.isSelf) || member.userId === selfUserId;
            const active = speaking.includes(isSelf ? "self" : member.id);
            const role =
              member.role ??
              roleFor(room?.hostId ?? "", room?.admins ?? [], member.userId);
            const menuOpen = menuFor === member.id;
            const banOpen = banFor === member.userId;
            const local = localMutes[member.userId] ?? {
              audio: false,
              video: false,
            };

            return (
              <div
                key={member.id}
                className="rounded-2xl px-2 py-1.5 transition hover:bg-white/[0.025]"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    avatar={member.avatar}
                    color={member.color}
                    photo={member.photo}
                    size="md"
                    speaking={active}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-white/90">
                      {role === "host" && (
                        <LuCrown className="h-3 w-3 shrink-0 text-amber-300" />
                      )}
                      {role === "admin" && (
                        <LuShieldCheck className="h-3 w-3 shrink-0 text-violet-300" />
                      )}
                      <span className="truncate">{member.name}</span>
                      {isSelf && (
                        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white/50">
                          you
                        </span>
                      )}
                      {role !== "member" && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${
                            role === "host"
                              ? "bg-amber-400/15 text-amber-200"
                              : "bg-violet-400/15 text-violet-200"
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-[11px] text-white/35">
                      {member.handRaised && (
                        <LuHand className="h-3 w-3 shrink-0 text-amber-300" />
                      )}
                      {member.restricted.mic || member.restricted.cam ? (
                        <span className="text-amber-300/80">restricted</span>
                      ) : active ? (
                        "Speaking…"
                      ) : member.media.screenOn ? (
                        "Sharing screen"
                      ) : member.media.camOn ? (
                        "On camera"
                      ) : (
                        "Camera off"
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 text-white/30">
                    {isSelf ? (
                      <>
                        {member.media.micOn ? (
                          <LuMic className="h-3.5 w-3.5" />
                        ) : (
                          <LuMicOff className="h-3.5 w-3.5 text-rose-300/70" />
                        )}
                        {member.media.camOn ? (
                          <LuVideo className="h-3.5 w-3.5" />
                        ) : (
                          <LuVideoOff className="h-3.5 w-3.5 text-rose-300/50" />
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleLocalMute(member.userId, "audio")
                          }
                          title={
                            local.audio
                              ? `Hear ${member.name} again`
                              : `Mute ${member.name} for yourself`
                          }
                          aria-label={
                            local.audio
                              ? `Unmute ${member.name} for yourself`
                              : `Mute ${member.name} for yourself`
                          }
                          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                            local.audio
                              ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-200"
                              : "border-white/8 bg-white/[0.03] text-white/35 hover:bg-white/10 hover:text-white/75"
                          }`}
                        >
                          {local.audio ? (
                            <LuVolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <LuVolume2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleLocalMute(member.userId, "video")
                          }
                          title={
                            local.video
                              ? `Show ${member.name}'s video again`
                              : `Hide ${member.name}'s video for yourself`
                          }
                          aria-label={
                            local.video
                              ? `Show ${member.name}'s video`
                              : `Hide ${member.name}'s video`
                          }
                          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                            local.video
                              ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-200"
                              : "border-white/8 bg-white/[0.03] text-white/35 hover:bg-white/10 hover:text-white/75"
                          }`}
                        >
                          {local.video ? (
                            <LuEyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <LuEye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </>
                    )}
                  </div>

                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => onMessage(member.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-white/45 transition hover:border-violet-300/30 hover:bg-violet-300/15 hover:text-violet-200"
                      aria-label={`Message ${member.name}`}
                    >
                      <LuMessageSquare className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {canAdmin && !isSelf && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(menuOpen ? null : member.id);
                        setBanFor(null);
                        setBanReason("");
                      }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
                        menuOpen
                          ? "border-lime-300/30 bg-lime-300/15 text-lime-200"
                          : "border-white/8 bg-white/[0.04] text-white/40 hover:bg-white/10 hover:text-white"
                      }`}
                      aria-label={`Manage ${member.name}`}
                      aria-expanded={menuOpen}
                    >
                      {menuOpen ? (
                        <LuX className="h-3.5 w-3.5" />
                      ) : (
                        <LuEllipsis className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>

                {menuOpen && canAdmin && !isSelf && (
                  <div className="mt-2 rounded-2xl border border-white/8 bg-black/25 p-1.5">
                    {!banOpen ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <ActionButton
                          label={
                            member.restricted.mic ? "Allow mic" : "Force mute"
                          }
                          tone={member.restricted.mic ? "good" : "default"}
                          icon={
                            member.restricted.mic ? (
                              <LuMic className="h-3.5 w-3.5" />
                            ) : (
                              <LuMicOff className="h-3.5 w-3.5" />
                            )
                          }
                          onClick={() =>
                            onAdminAction({
                              action: member.restricted.mic ? "unmute" : "mute",
                              targetUserId: member.userId,
                            })
                          }
                        />
                        <ActionButton
                          label={
                            member.restricted.cam ? "Allow camera" : "Camera off"
                          }
                          tone={member.restricted.cam ? "good" : "default"}
                          icon={
                            member.restricted.cam ? (
                              <LuVideo className="h-3.5 w-3.5" />
                            ) : (
                              <LuVideoOff className="h-3.5 w-3.5" />
                            )
                          }
                          onClick={() =>
                            onAdminAction({
                              action: member.restricted.cam
                                ? "cameraOn"
                                : "cameraOff",
                              targetUserId: member.userId,
                            })
                          }
                        />
                        {room?.kind === "party" && (
                          <ActionButton
                            label={
                              member.restricted.screen
                                ? "Allow screen"
                                : "Screen off"
                            }
                            tone={member.restricted.screen ? "good" : "default"}
                            icon={
                              member.restricted.screen ? (
                                <LuMonitorUp className="h-3.5 w-3.5" />
                              ) : (
                                <LuMonitorOff className="h-3.5 w-3.5" />
                              )
                            }
                            onClick={() =>
                              onAdminAction({
                                action: member.restricted.screen
                                  ? "screenOn"
                                  : "screenOff",
                                targetUserId: member.userId,
                              })
                            }
                          />
                        )}
                        <ActionButton
                          label="Focus tile"
                          icon={<LuPin className="h-3.5 w-3.5" />}
                          onClick={() => {
                            onFocus(member.id);
                            setMenuFor(null);
                          }}
                        />
                        {role !== "host" && (
                          <ActionButton
                            label={role === "admin" ? "Demote" : "Make admin"}
                            tone={role === "admin" ? "default" : "good"}
                            icon={
                              role === "admin" ? (
                                <LuUserMinus className="h-3.5 w-3.5" />
                              ) : (
                                <LuUserPlus className="h-3.5 w-3.5" />
                              )
                            }
                            onClick={() =>
                              onAdminAction({
                                action: role === "admin" ? "demote" : "promote",
                                targetUserId: member.userId,
                              })
                            }
                          />
                        )}
                        <ActionButton
                          label="Remove from room"
                          tone="danger"
                          icon={<LuUserMinus className="h-3.5 w-3.5" />}
                          onClick={() => {
                            onAdminAction({
                              action: "kick",
                              targetUserId: member.userId,
                            });
                            setMenuFor(null);
                          }}
                        />
                        <ActionButton
                          label="Ban…"
                          tone="danger"
                          icon={<LuBan className="h-3.5 w-3.5" />}
                          onClick={() => {
                            setBanFor(member.userId);
                            setBanReason("");
                          }}
                        />
                      </div>
                    ) : (
                      <div className="p-1">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200/70">
                          Ban {member.name} for…
                        </p>
                        <input
                          value={banReason}
                          onChange={(event) => setBanReason(event.target.value)}
                          maxLength={160}
                          placeholder="Reason (optional)"
                          className="mb-1.5 w-full rounded-lg border border-white/8 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 focus:border-rose-300/30 focus:outline-none"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          {BAN_DURATIONS.map((duration) => (
                            <button
                              key={duration.label}
                              type="button"
                              onClick={() => {
                                onAdminAction({
                                  action: "ban",
                                  targetUserId: member.userId,
                                  durationMs: duration.ms,
                                  reason: banReason.trim() || undefined,
                                });
                                setBanFor(null);
                                setBanReason("");
                                setMenuFor(null);
                              }}
                              className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-2 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/20"
                            >
                              {duration.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBanFor(null);
                            setBanReason("");
                          }}
                          className="mt-1.5 w-full py-1 text-[10px] text-white/35 transition hover:text-white/70"
                        >
                          cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canAdmin && requests.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-2.5">
            <SectionTitle
              title={`Join requests · ${requests.length}`}
              hint="Let them in or keep them out"
            />
            <div className="flex flex-col gap-1.5">
              {requests.map((request) => (
                <div
                  key={request.userId}
                  className="flex items-center gap-2 rounded-xl bg-black/25 p-1.5"
                >
                  <Avatar
                    avatar={request.avatar}
                    color={request.color}
                    photo={request.photo}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/85">
                    {request.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onApprove(request.userId)}
                    className="flex h-7 items-center gap-1 rounded-lg bg-lime-300 px-2 text-[10px] font-bold text-[#08130a] transition hover:bg-lime-200 active:scale-95"
                  >
                    <LuCheck className="h-3 w-3" />
                    Let in
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeny(request.userId)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-white/45 transition hover:bg-rose-500/15 hover:text-rose-200"
                    aria-label={`Deny ${request.name}`}
                  >
                    <LuX className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {canAdmin && (
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-2.5">
            <SectionTitle
              title="Room controls"
              hint="Changes apply instantly for everyone"
            />
            <div className="rounded-xl border border-white/8 bg-black/20 p-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/65">
                {policy === "request" ? (
                  <LuLock className="h-3.5 w-3.5 text-amber-300" />
                ) : (
                  <LuLockOpen className="h-3.5 w-3.5 text-lime-300" />
                )}
                Who can join?
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
                  Anyone
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
                  Approval
                </button>
              </div>
            </div>

            {room?.kind === "party" && (
              <div className="mt-1.5 rounded-xl border border-white/8 bg-black/20 p-2">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/65">
                  <LuMonitorUp className="h-3.5 w-3.5 text-cyan-300" />
                  Screen sharing
                </p>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.04] p-0.5">
                  {(
                    [
                      ["open", "Everyone"],
                      ["admins", "Admins"],
                      ["off", "Off"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        onAdminAction({
                          action: "setScreenPolicy",
                          screenPolicy: value,
                        })
                      }
                      className={`rounded-md px-1.5 py-1.5 text-[10px] font-semibold transition ${
                        (room.screenShare ?? "open") === value
                          ? "bg-white/10 text-white"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <ActionButton
                label="Mute everyone"
                icon={<LuMicOff className="h-3.5 w-3.5" />}
                onClick={() => onAdminAction({ action: "muteAll" })}
              />
              <ActionButton
                label="Lift restrictions"
                icon={<LuMic className="h-3.5 w-3.5" />}
                onClick={() => onAdminAction({ action: "clearRestrictions" })}
              />
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
                  This removes every admin, including you, and opens the room to
                  anyone. The room becomes decentralized.
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(false)}
                    className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/10"
                  >
                    Keep admins
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

        {canAdmin && bans.length > 0 && (
          <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2.5">
            <SectionTitle title={`Banned · ${bans.length}`} />
            <div className="flex flex-col gap-1">
              {bans.map((ban) => (
                <div
                  key={ban.userId}
                  className="flex items-center gap-2 rounded-xl bg-black/20 p-1.5"
                >
                  <Avatar
                    avatar={ban.avatar ?? "🚫"}
                    color="ember"
                    photo={ban.photo ?? undefined}
                    size="xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-white/80">
                      {ban.name ?? `${ban.userId.slice(0, 8)}…`}
                    </p>
                    <p className="flex items-center gap-1 text-[9px] text-white/30">
                      <LuClock className="h-2.5 w-2.5" />
                      {formatBanExpiry(ban.expiresAt)}
                      {ban.reason ? ` · ${ban.reason}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnban(ban.userId)}
                    className="rounded-lg border border-lime-300/20 bg-lime-300/10 px-2 py-1 text-[10px] font-semibold text-lime-200 transition hover:bg-lime-300/20"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {room && (
        <div className="shrink-0 border-t border-white/8 p-3">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
              Invite people
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-xs tracking-[0.16em] text-lime-300">
                {room.id}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg bg-lime-300 px-2.5 py-1.5 text-[11px] font-semibold text-[#0b130a] transition hover:bg-lime-200 active:scale-95"
              >
                {copied ? (
                  <LuCheck className="h-3.5 w-3.5" />
                ) : (
                  <LuCopy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/25">
              Up to {room.maxSize} people ·{" "}
              {room.joinPolicy === "request"
                ? "new people need approval"
                : "anyone with the link can join"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
