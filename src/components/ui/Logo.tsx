interface LogoProps {
  className?: string;
  /** Renders only the hexagon mark, without the wordmark. */
  markOnly?: boolean;
}

/**
 * AETHER mark — an aperture hexagon carrying an "A" glyph.
 * Pure SVG so it stays crisp at any density and inherits the accent token.
 */
export function Logo({ className = '', markOnly = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-8 w-8 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="aether-mark" x1="5" y1="4" x2="27" y2="29" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgb(var(--c-glacier))" />
            <stop offset="1" stopColor="rgb(var(--c-accent))" />
          </linearGradient>
        </defs>
        <path
          d="M16 2.6 27.4 9.2v13.2L16 29.1 4.6 22.4V9.2z"
          stroke="url(#aether-mark)"
          strokeWidth="1.1"
          strokeLinejoin="round"
          fill="rgb(var(--c-accent) / 0.06)"
        />
        <path
          d="M8.4 9.9h15.2M8.4 22.1h15.2"
          stroke="rgb(var(--c-accent) / 0.22)"
          strokeWidth="0.8"
        />
        <path
          d="M11.9 21.1 16 10.6l4.1 10.5M13.5 17.9h5"
          stroke="url(#aether-mark)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="6.4" r="1" fill="rgb(var(--c-accent))" />
      </svg>
      {!markOnly && (
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-none tracking-[0.32em] text-ink">
            AETHER
          </div>
          <div className="mt-1 font-mono text-[8.5px] uppercase leading-none tracking-[0.2em] text-ink-mute">
            RazorResearch
          </div>
        </div>
      )}
    </div>
  );
}
