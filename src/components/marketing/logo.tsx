export function PostloomLogo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PostloomAI logo"
    >
      <defs>
        <linearGradient id="pl-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3DB36B" />
          <stop offset="50%" stopColor="#18713C" />
          <stop offset="100%" stopColor="#48357B" />
        </linearGradient>
        <linearGradient id="pl-thread" x1="0" y1="48" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7ED" />
          <stop offset="100%" stopColor="#FFEDD5" />
        </linearGradient>
      </defs>
      {/* rounded badge */}
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#pl-grad)" />
      <rect x="2" y="2" width="44" height="44" rx="13" fill="black" opacity="0.12" />
      <rect x="3.5" y="3.5" width="41" height="41" rx="11.5" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" />
      {/* woven threads — the "loom" */}
      <path d="M12 16 H36" stroke="url(#pl-thread)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M12 24 H30" stroke="url(#pl-thread)" strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
      <path d="M12 32 H36" stroke="url(#pl-thread)" strokeWidth="3.4" strokeLinecap="round" />
      {/* vertical warp thread weaving through */}
      <path
        d="M18 11 C18 18, 26 20, 26 24 C26 28, 20 30, 20 37"
        stroke="#241A45"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* spark node */}
      <circle cx="33.5" cy="24" r="3.2" fill="#FFF7ED" />
      <circle cx="33.5" cy="24" r="5.6" stroke="#FFF7ED" strokeOpacity="0.45" strokeWidth="1.4" />
    </svg>
  );
}
