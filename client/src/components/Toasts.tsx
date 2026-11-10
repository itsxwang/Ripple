import { AnimatePresence, motion } from "framer-motion";
import type { Toast } from "../types";
import { Avatar } from "./Avatar";

interface ToastsProps {
  toasts: Toast[];
  onOpen?: (toast: Toast) => void;
}

export function Toasts({ toasts, onOpen }: ToastsProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const clickable = Boolean(toast.action && onOpen);
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onClick={clickable ? () => onOpen?.(toast) : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen?.(toast);
                      }
                    }
                  : undefined
              }
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={
                clickable
                  ? `Open message: ${toast.title}`
                  : undefined
              }
              className={`flex max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1119]/90 px-3.5 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-xl transition ${
                clickable
                  ? "pointer-events-auto cursor-pointer hover:border-lime-300/30 hover:bg-[#121826]/95 focus:outline-none focus-visible:border-lime-300/50 focus-visible:ring-2 focus-visible:ring-lime-300/30 active:scale-[0.99]"
                  : ""
              }`}
            >
              {toast.avatar ? (
                <Avatar
                  avatar={toast.avatar}
                  color={toast.color ?? "aurora"}
                  photo={toast.photo}
                  size="sm"
                  speaking={toast.kind === "join"}
                />
              ) : (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${
                    toast.kind === "error"
                      ? "bg-rose-500/20 text-rose-300"
                      : toast.kind === "leave"
                        ? "bg-white/8 text-white/60"
                        : "bg-lime-400/15 text-lime-300"
                  }`}
                >
                  {toast.kind === "error" ? "!" : toast.kind === "leave" ? "👋" : "✦"}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {toast.title}
                </p>
                {toast.subtitle && (
                  <p className="truncate text-xs text-white/50">
                    {toast.subtitle}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
