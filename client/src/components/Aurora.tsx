export function Aurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[#05070c]" />
      <div className="absolute -left-40 -top-48 h-[38rem] w-[38rem] animate-aurora rounded-full bg-violet-600/25 blur-[130px]" />
      <div className="absolute -right-40 -top-24 h-[32rem] w-[32rem] animate-aurora rounded-full bg-cyan-400/20 blur-[120px] [animation-delay:-6s]" />
      <div className="absolute -bottom-56 left-1/4 h-[34rem] w-[34rem] animate-aurora rounded-full bg-lime-300/12 blur-[130px] [animation-delay:-11s]" />
      <div className="absolute -bottom-40 -right-24 h-[26rem] w-[26rem] animate-aurora rounded-full bg-fuchsia-500/15 blur-[110px] [animation-delay:-3s]" />
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="noise absolute inset-0 opacity-[0.035]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05070c]/40 via-transparent to-[#05070c]/80" />
    </div>
  );
}
