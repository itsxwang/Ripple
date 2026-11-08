import { gradientFor } from "../lib/constants";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-sm",
  sm: "h-9 w-9 text-lg",
  md: "h-12 w-12 text-2xl",
  lg: "h-20 w-20 text-4xl",
  xl: "h-24 w-24 text-5xl",
};

interface AvatarProps {
  avatar: string;
  color: string;
  photo?: string;
  size?: AvatarSize;
  speaking?: boolean;
  className?: string;
}

export function Avatar({
  avatar,
  color,
  photo,
  size = "md",
  speaking = false,
  className = "",
}: AvatarProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display shadow-lg transition-shadow duration-300 ${
        SIZES[size]
      } ${
        speaking
          ? "ring-2 ring-lime-300/90 shadow-[0_0_0_5px_rgba(190,242,100,0.16)]"
          : "ring-1 ring-white/15"
      } ${className}`}
      style={{ background: gradientFor(color) }}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="leading-none drop-shadow-sm">{avatar}</span>
      )}
    </span>
  );
}
