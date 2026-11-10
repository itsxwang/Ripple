import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuArrowUp,
  LuBellOff,
  LuLock,
  LuMessageCircle,
  LuReply,
  LuSend,
  LuUserMinus,
  LuX,
} from "react-icons/lu";
import type {
  ChatMessage,
  ChatReply,
  FocusMessage,
  Member,
  TypingMap,
} from "../types";
import { formatTime } from "../lib/constants";
import { Avatar } from "./Avatar";

interface ChatPanelProps {
  members: Member[];
  leftIds: Set<string>;
  focusMessage: FocusMessage | null;
  selfId: string;
  messages: ChatMessage[];
  typing: TypingMap;
  conversation: string;
  onConversationChange: (id: string) => void;
  onSend: (text: string, to?: string, replyTo?: ChatReply) => void;
  onTyping: (to?: string) => void;
  unread: Record<string, number>;
  blockedUserIds: Set<string>;
  onUnblockDm: (userId: string) => void;
}

export function ChatPanel({
  members,
  leftIds,
  focusMessage,
  selfId,
  messages,
  typing,
  conversation,
  onConversationChange,
  onSend,
  onTyping,
  unread,
  blockedUserIds,
  onUnblockDm,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const lastTypingRef = useRef(0);

  const activeMember = members.find((member) => member.id === conversation);
  const direct = Boolean(activeMember);
  const left = Boolean(activeMember && leftIds.has(activeMember.id));
  const blocked = Boolean(
    activeMember && blockedUserIds.has(activeMember.userId),
  );
  const readOnly = blocked || left;

  const visible = messages.filter((message) => {
    if (conversation === "group") return !message.to;
    const matches =
      (message.from === conversation && message.to === selfId) ||
      (message.from === selfId && message.to === conversation);
    if (!matches) return false;
    /* Blocked members' incoming DMs never show, even if they were already
       in memory before the block was created. */
    return !(
      blocked &&
      message.from === conversation &&
      message.to === selfId
    );
  });

  const typingNames = Object.values(typing)
    .filter((entry) => {
      if (conversation === "group") return !entry.to;
      if (blocked && entry.userId && blockedUserIds.has(entry.userId)) {
        return false;
      }
      return entry.to === selfId && entry.from === conversation;
    })
    .map((entry) => entry.name);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visible.length, conversation]);

  /* Toast clicks hand us a message id; scroll it into view and flash it. */
  useEffect(() => {
    if (!focusMessage) return;
    const frame = window.requestAnimationFrame(() => {
      const node = listRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${focusMessage.id}"]`,
      );
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(focusMessage.id);
    });
    const timer = window.setTimeout(() => setHighlightId(null), 2800);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusMessage, conversation]);

  /* Replies belong to a conversation, so switching away clears the draft quote. */
  useEffect(() => {
    setReplyTarget(null);
  }, [conversation]);

  useEffect(
    () => () => {
      if (highlightTimer.current) {
        window.clearTimeout(highlightTimer.current);
      }
    },
    [],
  );

  const flashMessage = (id: string) => {
    setHighlightId(id);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      highlightTimer.current = null;
      setHighlightId(null);
    }, 2400);
  };

  const jumpToMessage = (id: string) => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${id}"]`,
    );
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    flashMessage(id);
  };

  const beginReply = (message: ChatMessage) => {
    if (readOnly) return;
    setReplyTarget(message);
    inputRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || readOnly) return;
    const replyTo: ChatReply | undefined = replyTarget
      ? {
          id: replyTarget.id,
          name: replyTarget.fromName,
          text: replyTarget.text.slice(0, 160),
        }
      : undefined;
    onSend(text, direct ? conversation : undefined, replyTo);
    setDraft("");
    setReplyTarget(null);
  };

  const handleChange = (value: string) => {
    setDraft(value);
    if (readOnly) return;
    const now = Date.now();
    if (value && now - lastTypingRef.current > 1100) {
      lastTypingRef.current = now;
      onTyping(direct ? conversation : undefined);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* conversation picker */}
      <div className="shrink-0 border-b border-white/8 px-3 py-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onConversationChange("group")}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              conversation === "group"
                ? "border-lime-300/40 bg-lime-300/15 text-lime-200"
                : "border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/8 hover:text-white/80"
            }`}
          >
            <LuMessageCircle className="h-3.5 w-3.5" />
            Everyone
            {unread.group > 0 && conversation !== "group" && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-300 px-1 text-[9px] font-bold text-[#0b130a]">
                {unread.group}
              </span>
            )}
          </button>

          {members.map((member) => {
            const count = unread[member.id] ?? 0;
            const memberBlocked = blockedUserIds.has(member.userId);
            const memberLeft = leftIds.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onConversationChange(member.id)}
                title={
                  memberLeft
                    ? `${member.name} left the room — history is kept`
                    : memberBlocked
                      ? `Direct messages from ${member.name} are blocked`
                      : undefined
                }
                className={`relative flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition ${
                  conversation === member.id
                    ? memberLeft
                      ? "border-dashed border-white/20 bg-white/[0.06] text-white/65"
                      : memberBlocked
                        ? "border-rose-400/40 bg-rose-400/15 text-rose-100"
                        : "border-violet-300/40 bg-violet-300/15 text-violet-100"
                    : memberLeft
                      ? "border-dashed border-white/10 bg-white/[0.015] text-white/40 hover:bg-white/[0.06] hover:text-white/65"
                      : memberBlocked
                        ? "border-rose-400/25 bg-rose-500/[0.07] text-rose-200/80 hover:bg-rose-500/15 hover:text-rose-100"
                        : "border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/8 hover:text-white/80"
                }`}
              >
                <Avatar
                  avatar={member.avatar}
                  color={member.color}
                  photo={member.photo}
                  size="xs"
                  className={memberLeft ? "opacity-55 grayscale" : undefined}
                />
                <span className="max-w-24 truncate">{member.name}</span>
                {memberLeft && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/8 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-white/45">
                    <LuUserMinus className="h-2.5 w-2.5" />
                    left
                  </span>
                )}
                {memberBlocked && (
                  <LuBellOff
                    className="h-3 w-3 shrink-0 text-rose-300"
                    aria-label={`DMs from ${member.name} are blocked`}
                  />
                )}
                {count > 0 && conversation !== member.id && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-300 px-1 text-[9px] font-bold text-[#140b1d]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* messages */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent]"
      >
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">
              {direct ? (blocked ? "🚫" : "🔒") : "👋"}
            </span>
            <p className="font-display text-sm font-semibold text-white/80">
              {direct
                ? blocked
                  ? `DMs from ${activeMember?.name} are blocked`
                  : `Private chat with ${activeMember?.name}`
                : "Say something nice"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/40">
              {direct
                ? blocked
                  ? "Their direct messages won't reach you until you unblock them."
                  : "Messages here are only visible to the two of you."
                : "Your messages land in the room instantly. Be kind, be curious."}
            </p>
            {direct && blocked && activeMember && (
              <button
                type="button"
                onClick={() => onUnblockDm(activeMember.userId)}
                className="mt-3 flex items-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/20"
              >
                <LuLock className="h-3.5 w-3.5" />
                Unblock DMs from {activeMember.name}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {visible.map((message) => {
                if (message.system) {
                  return (
                    <motion.div
                      key={message.id}
                      data-message-id={message.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`self-center rounded-full border px-3 py-1 text-[10px] font-medium transition-colors ${
                        highlightId === message.id
                          ? "border-lime-300/50 bg-lime-300/10 text-lime-100"
                          : "border-white/8 bg-white/[0.03] text-white/40"
                      }`}
                    >
                      {message.text}
                    </motion.div>
                  );
                }

                const mine = message.from === selfId;
                return (
                  <motion.div
                    key={message.id}
                    data-message-id={message.id}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className={`flex items-end gap-2 ${
                      mine ? "flex-row-reverse" : ""
                    }`}
                  >
                    {!mine && (
                      <Avatar
                        avatar={message.fromAvatar}
                        color={message.fromColor}
                        photo={message.fromPhoto}
                        size="xs"
                        className="mb-4"
                      />
                    )}
                    <div
                      className={`flex max-w-[80%] flex-col ${
                        mine ? "items-end" : "items-start"
                      }`}
                    >
                      {!mine && (
                        <span className="mb-1 pl-1 text-[10px] font-medium text-white/40">
                          {message.fromName}
                          {message.to && (
                            <span className="ml-1.5 rounded bg-violet-400/15 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-violet-300">
                              dm
                            </span>
                          )}
                        </span>
                      )}
                      <div
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed transition-shadow duration-300 ${
                          mine
                            ? "rounded-br-md bg-lime-300 text-[#0b130a]"
                            : "rounded-bl-md border border-white/8 bg-white/[0.055] text-white/85"
                        } ${
                          highlightId === message.id
                            ? "ring-2 ring-lime-300/70 shadow-[0_0_22px_rgba(190,242,100,0.3)]"
                            : ""
                        }`}
                      >
                        {message.replyTo && (
                          <button
                            type="button"
                            onClick={() => jumpToMessage(message.replyTo!.id)}
                            aria-label={`Jump to message from ${message.replyTo.name}`}
                            title="Jump to the original message"
                            className={`mb-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-lg border-l-2 py-0.5 pl-2 pr-1 text-left text-[11px] transition ${
                              mine
                                ? "border-[#0b130a]/35 bg-[#0b130a]/10 text-[#0b130a]/70 hover:bg-[#0b130a]/15"
                                : "border-lime-300/45 bg-white/[0.055] text-white/60 hover:bg-white/10"
                            }`}
                          >
                            <span className="shrink-0 whitespace-nowrap font-semibold">
                              {message.replyTo.name}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {message.replyTo.text}
                            </span>
                          </button>
                        )}
                        {message.text}
                      </div>
                      <div
                        className={`mt-1 flex items-center gap-1 px-1 ${
                          mine ? "flex-row-reverse" : ""
                        }`}
                      >
                        <span className="text-[9px] text-white/25">
                          {formatTime(message.ts)}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => beginReply(message)}
                            aria-label={`Reply to ${message.fromName}`}
                            title="Reply"
                            className="rounded p-0.5 text-white/25 transition hover:bg-white/10 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300/40"
                          >
                            <LuReply className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {direct && left && activeMember && (
              <div className="self-center flex items-center gap-1.5 rounded-full border border-dashed border-white/12 bg-white/[0.025] px-3 py-1 text-[10px] font-medium text-white/40">
                <LuUserMinus className="h-3 w-3" />
                {activeMember.name} left the room · history kept
              </div>
            )}

            {typingNames.length > 0 && (
              <div className="flex items-center gap-2 pl-1 text-[11px] text-white/35">
                <span className="flex gap-1">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1 w-1 animate-bounce rounded-full bg-white/40"
                      style={{ animationDelay: `${dot * 0.12}s` }}
                    />
                  ))}
                </span>
                {typingNames.slice(0, 2).join(", ")}
                {typingNames.length > 2 ? " and others are typing" : " is typing"}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-white/8 p-3">
        {left && activeMember && !blocked && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-2.5 py-2">
            <LuUserMinus className="h-3.5 w-3.5 shrink-0 text-white/40" />
            <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-white/50">
              {activeMember.name} left the room. You can still read this
              conversation.
            </p>
          </div>
        )}
        {blocked && activeMember && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-2.5 py-2">
            <LuBellOff className="h-3.5 w-3.5 shrink-0 text-rose-300" />
            <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-rose-100/80">
              You blocked DMs from {activeMember.name}.
            </p>
            <button
              type="button"
              onClick={() => onUnblockDm(activeMember.userId)}
              className="shrink-0 rounded-lg border border-rose-300/25 bg-rose-400/15 px-2 py-1 text-[10px] font-semibold text-rose-100 transition hover:bg-rose-400/25"
            >
              Unblock
            </button>
          </div>
        )}
        {replyTarget && !readOnly && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-lime-300/20 bg-lime-300/[0.07] px-2.5 py-2">
            <LuReply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-300" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold text-lime-200">
                Replying to {replyTarget.fromName}
              </p>
              <p className="truncate text-[10px] text-white/45">
                {replyTarget.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              aria-label="Cancel reply"
              title="Cancel reply"
              className="shrink-0 rounded-lg p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
            >
              <LuX className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-1.5 pl-3.5 pr-1.5 transition focus-within:border-lime-300/35 focus-within:bg-white/[0.06]">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && replyTarget) {
                event.preventDefault();
                event.stopPropagation();
                setReplyTarget(null);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={readOnly}
            placeholder={
              left
                ? `${activeMember?.name} left the room`
                : blocked
                  ? `Unblock ${activeMember?.name} to send DMs`
                  : direct
                    ? `Message ${activeMember?.name}…`
                    : "Message everyone…"
            }
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || readOnly}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-300 text-[#0b130a] transition enabled:hover:bg-lime-200 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Send message"
          >
            {direct ? (
              <LuSend className="h-4 w-4" />
            ) : (
              <LuArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-white/20">
          {left
            ? "This conversation is read-only now that they left"
            : direct
              ? blocked
                ? "Unblock this member to exchange direct messages again"
                : "Only the two of you can see this conversation"
              : "Enter to send · be kind to strangers"}
        </p>
      </div>
    </div>
  );
}
