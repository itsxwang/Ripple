import { motion } from "framer-motion";
import { LuMessageCircle, LuUsers, LuX } from "react-icons/lu";
import type {
  AdminActionPayload,
  ChatMessage,
  ChatReply,
  DmBlockScope,
  FocusMessage,
  JoinPolicy,
  LocalMute,
  Member,
  RoomInfo,
  TypingMap,
} from "../types";
import { ChatPanel } from "./ChatPanel";
import { PeoplePanel } from "./PeoplePanel";

type PanelTab = "chat" | "people";

interface SidebarProps {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  unreadTotal: number;
  members: Member[];
  /** Live members plus departed members with DM history. */
  chatMembers: Member[];
  leftIds: Set<string>;
  focusMessage: FocusMessage | null;
  selfId: string;
  selfUserId: string;
  messages: ChatMessage[];
  typing: TypingMap;
  conversation: string;
  onConversationChange: (id: string) => void;
  unread: Record<string, number>;
  onSend: (text: string, to?: string, replyTo?: ChatReply) => void;
  onTyping: (to?: string) => void;
  room: RoomInfo | null;
  speaking: string[];
  onMessage: (id: string) => void;
  canAdmin: boolean;
  online: number;
  onAdminAction: (payload: AdminActionPayload) => void;
  onSetPolicy: (policy: JoinPolicy) => void;
  onApprove: (userId: string) => void;
  onDeny: (userId: string) => void;
  onUnban: (userId: string) => void;
  localMutes: Record<string, LocalMute>;
  onToggleLocalMute: (userId: string, kind: "audio" | "video") => void;
  onFocus: (id: string) => void;
  blockedUserIds: Set<string>;
  ignoredUserIds: Set<string>;
  onBlockDm: (member: Member, scope: DmBlockScope) => void;
  onUnblockDm: (userId: string) => void;
  onIgnore: (member: Member) => void;
  onUnignore: (userId: string) => void;
}

export function Sidebar({
  tab,
  onTabChange,
  onClose,
  unreadTotal,
  members,
  chatMembers,
  leftIds,
  focusMessage,
  selfId,
  selfUserId,
  messages,
  typing,
  conversation,
  onConversationChange,
  unread,
  onSend,
  onTyping,
  room,
  speaking,
  onMessage,
  canAdmin,
  online,
  onAdminAction,
  onSetPolicy,
  onApprove,
  onDeny,
  onUnban,
  localMutes,
  onToggleLocalMute,
  onFocus,
  blockedUserIds,
  ignoredUserIds,
  onBlockDm,
  onUnblockDm,
  onIgnore,
  onUnignore,
}: SidebarProps) {
  const requestCount = canAdmin ? (room?.requests?.length ?? 0) : 0;

  return (
    <>
      <motion.button
        type="button"
        aria-label="Close panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
      />
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-white/10 bg-[#080b11]/95 shadow-2xl shadow-black/60 backdrop-blur-2xl lg:static lg:z-0 lg:w-[372px] lg:max-w-none lg:shrink-0 lg:bg-[#080b11]/70"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-3 py-2.5">
          <div className="flex flex-1 items-center gap-1 rounded-xl bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => onTabChange("chat")}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === "chat"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/45 hover:text-white/75"
              }`}
            >
              <LuMessageCircle className="h-3.5 w-3.5" />
              Chat
              {unreadTotal > 0 && tab !== "chat" && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-lime-300 px-1 text-[9px] font-bold text-[#0b130a]">
                  {unreadTotal > 9 ? "9+" : unreadTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onTabChange("people")}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === "people"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/45 hover:text-white/75"
              }`}
            >
              <LuUsers className="h-3.5 w-3.5" />
              People
              {requestCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-300 px-1 text-[9px] font-bold text-[#1a1203]">
                  {requestCount}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white/40 transition hover:bg-white/10 hover:text-white"
            aria-label="Close panel"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        {tab === "chat" ? (
          <ChatPanel
            members={chatMembers.filter((member) => !member.isSelf)}
            leftIds={leftIds}
            focusMessage={focusMessage}
            selfId={selfId}
            messages={messages}
            typing={typing}
            conversation={conversation}
            onConversationChange={onConversationChange}
            onSend={onSend}
            onTyping={onTyping}
            unread={unread}
            blockedUserIds={blockedUserIds}
            ignoredUserIds={ignoredUserIds}
            onUnblockDm={onUnblockDm}
            onUnignore={onUnignore}
          />
        ) : (
          <PeoplePanel
            members={members}
            room={room}
            speaking={speaking}
            onMessage={onMessage}
            canAdmin={canAdmin}
            selfUserId={selfUserId}
            online={online}
            onAdminAction={onAdminAction}
            onSetPolicy={onSetPolicy}
            onApprove={onApprove}
            onDeny={onDeny}
            onUnban={onUnban}
            localMutes={localMutes}
            onToggleLocalMute={onToggleLocalMute}
            onFocus={onFocus}
            blockedUserIds={blockedUserIds}
            ignoredUserIds={ignoredUserIds}
            onBlockDm={onBlockDm}
            onUnblockDm={onUnblockDm}
            onIgnore={onIgnore}
            onUnignore={onUnignore}
          />
        )}
      </motion.aside>
    </>
  );
}

export type { PanelTab };
