interface LogoProps {
  className?: string;
  /** Renders only the hexagon mark, without the wordmark. */
  markOnly?: boolean;
}

/**
 * AETHER mark — a flat technical hexagon carrying an "A" glyph.
 * Monochrome except for the apex dot, so it inherits the active theme.
 */
export function Logo({ className = '', markOnly = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-7 w-7 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 2.6 27.4 9.2v13.2L16 29.1 4.6 22.4V9.2z"
          stroke="rgb(var(--c-ink-dim))"
          strokeWidth="1.1"
          strokeLinejoin="miter"
        />
        <path d="M8.4 9.9h15.2M8.4 22.1h15.2" stroke="rgb(var(--c-line))" strokeWidth="0.9" />
        <path
          d="M11.9 21.1 16 10.6l4.1 10.5M13.5 17.9h5"
          stroke="rgb(var(--c-ink))"
          strokeWidth="1.4"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <rect x="15.2" y="5.4" width="1.6" height="1.6" fill="rgb(var(--c-accent))" />
      </svg>
      {!markOnly && (
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-none tracking-[0.2em] text-ink">
            AETHER
          </div>
          <div className="mt-1 font-mono text-[11.5px] leading-none tracking-[0.1em] text-ink-mute">
            RazorResearch
          </div>
        </div>
      )}
    </div>
  );
}
