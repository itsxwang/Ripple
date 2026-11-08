import { AnimatePresence, motion } from "framer-motion";
import type { Reaction } from "../types";

interface ReactionsLayerProps {
  reactions: Reaction[];
}

const LANE_COUNT = 8;

function leftFor(reaction: Reaction): string {
  const lane =
    typeof reaction.lane === "number"
      ? reaction.lane % LANE_COUNT
      : 0;
  return `${5 + lane * 11.5}%`;
}

export function ReactionsLayer({ reactions }: ReactionsLayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <AnimatePresence>
        {reactions.map((reaction) => {
          const lane =
            typeof reaction.lane === "number"
              ? reaction.lane % LANE_COUNT
              : 0;
          const drift = lane % 2 === 0 ? 12 : -12;
          return (
            <motion.div
              key={reaction.id}
              initial={{ opacity: 0, y: 30, scale: 0.45 }}
              animate={{
                opacity: [0, 1, 1, 1, 0],
                y: [30, -40, -150, -290, -430],
                scale: [0.45, 1.12, 1, 0.98, 0.9],
                x: [0, drift, -drift, drift / 2, 0],
                rotate: [0, lane % 2 === 0 ? 5 : -5, 0],
              }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                duration: 3.7,
                ease: "easeOut",
                times: [0, 0.12, 0.4, 0.72, 1],
              }}
              className="absolute bottom-24 -translate-x-1/2 select-none"
              style={{ left: leftFor(reaction) }}
            >
              <div className="flex w-20 flex-col items-center gap-1.5">
                {reaction.gif ? (
                  <img
                    src={reaction.gif}
                    alt=""
                    draggable={false}
                    className="h-20 w-20 rounded-2xl border border-white/15 object-cover shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
                  />
                ) : (
                  <span className="text-[2.6rem] leading-none drop-shadow-[0_4px_14px_rgba(0,0,0,0.65)]">
                    {reaction.emoji ?? "✨"}
                  </span>
                )}
                <span className="max-w-full truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
                  {reaction.name}
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
