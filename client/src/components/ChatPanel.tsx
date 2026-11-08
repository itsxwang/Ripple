import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LuArrowUp, LuMessageCircle, LuSend } from "react-icons/lu";
import type { ChatMessage, Member, TypingMap } from "../types";
import { formatTime } from "../lib/constants";
import { Avatar } from "./Avatar";

interface ChatPanelProps {
  members: Member[];
  selfId: string;
  messages: ChatMessage[];
  typing: TypingMap;
  conversation: string;
  onConversationChange: (id: string) => void;
  onSend: (text: string, to?: string) => void;
  onTyping: (to?: string) => void;
  unread: Record<string, number>;
}

export function ChatPanel({
  members,
  selfId,
  messages,
  typing,
  conversation,
  onConversationChange,
  onSend,
  onTyping,
  unread,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastTypingRef = useRef(0);

  const activeMember = members.find((member) => member.id === conversation);
  const direct = Boolean(activeMember);

  const visible = messages.filter((message) => {
    if (conversation === "group") return !message.to;
    return (
      (message.from === conversation && message.to === selfId) ||
      (message.from === selfId && message.to === conversation)
    );
  });

  const typingNames = Object.values(typing)
    .filter((entry) =>
      conversation === "group"
        ? !entry.to
        : entry.to === selfId && entry.from === conversation,
    )
    .map((entry) => entry.name);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visible.length, conversation]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text, direct ? conversation : undefined);
    setDraft("");
  };

  const handleChange = (value: string) => {
    setDraft(value);
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
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onConversationChange(member.id)}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition ${
                  conversation === member.id
                    ? "border-violet-300/40 bg-violet-300/15 text-violet-100"
                    : "border-white/8 bg-white/[0.03] text-white/55 hover:bg-white/8 hover:text-white/80"
                }`}
              >
                <Avatar
                  avatar={member.avatar}
                  color={member.color}
                  size="xs"
                />
                <span className="max-w-24 truncate">{member.name}</span>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.12)_transparent]">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">
              {direct ? "🔒" : "👋"}
            </span>
            <p className="font-display text-sm font-semibold text-white/80">
              {direct
                ? `Private chat with ${activeMember?.name}`
                : "Say something nice"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/40">
              {direct
                ? "Messages here are only visible to the two of you."
                : "Your messages land in the room instantly. Be kind, be curious."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {visible.map((message) => {
                if (message.system) {
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="self-center rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[10px] font-medium text-white/40"
                    >
                      {message.text}
                    </motion.div>
                  );
                }

                const mine = message.from === selfId;
                return (
                  <motion.div
                    key={message.id}
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
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                          mine
                            ? "rounded-br-md bg-lime-300 text-[#0b130a]"
                            : "rounded-bl-md border border-white/8 bg-white/[0.055] text-white/85"
                        }`}
                      >
                        {message.text}
                      </div>
                      <span className="mt-1 px-1 text-[9px] text-white/25">
                        {formatTime(message.ts)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

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
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-1.5 pl-3.5 pr-1.5 transition focus-within:border-lime-300/35 focus-within:bg-white/[0.06]">
          <input
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={
              direct ? `Message ${activeMember?.name}…` : "Message everyone…"
            }
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
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
          {direct
            ? "Only the two of you can see this conversation"
            : "Enter to send · be kind to strangers"}
        </p>
      </div>
    </div>
  );
}
