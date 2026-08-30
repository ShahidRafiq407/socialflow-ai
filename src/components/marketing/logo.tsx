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
      {/* solid brand-green badge */}
      <rect x="2" y="2" width="44" height="44" rx="13" fill="#18713C" />
      {/* top inner highlight for 3D glass feel */}
      <rect x="2" y="2" width="44" height="22" rx="11" fill="#FFFFFF" opacity="0.12" />
      <rect x="3.5" y="3.5" width="41" height="41" rx="11.5" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="1.5" />
      {/* paper-plane "P" mark */}
      <path
        d="M14 34 V14 h9.2 a7.2 7.2 0 0 1 0 14.4 h-5.6 V34 Z M17.6 25.2 h5.4 a3.6 3.6 0 0 0 0-7.2 h-5.4 Z"
        fill="#FFFFFF"
      />
      {/* launch spark — brand purple dot with orbit ring */}
      <circle cx="35.5" cy="13.5" r="4" fill="#48357B" stroke="#FFFFFF" strokeWidth="1.6" />
      <path
        d="M30 9.5 a8 8 0 0 1 10.5 2"
        stroke="#FFFFFF"
        strokeOpacity="0.7"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
