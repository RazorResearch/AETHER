import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { findNavItem } from '@/components/navigation/navConfig';
import { ProvenanceBadge } from '@/components/ui/Badge';
import { useAppStore } from '@/store/useAppStore';
import { useClock } from '@/hooks/useTelemetry';
import { formatTime } from '@/utils/format';

/** Context strip above the page content: location, build status, clock. */
export function TopBar() {
  const location = useLocation();
  const theme = useAppStore((state) => state.settings.theme);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const now = useClock();
  const current = findNavItem(location.pathname);

  return (
    <header className="sticky top-0 z-20 flex h-[54px] shrink-0 items-center justify-between gap-4 border-b border-line/60 bg-base/85 px-4 backdrop-blur-md lg:px-7">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
        <Link to="/overview" className="text-ink-mute/80 transition-colors hover:text-ink-dim">
          AETHER
        </Link>
        <span className="text-ink-mute/40">/</span>
        <span className="text-ink-mute/70">workspace</span>
        <span className="text-ink-mute/40">/</span>
        <span className="truncate text-ink-dim">{current?.label ?? 'overview'}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden md:inline-flex">
          <ProvenanceBadge kind="demo" />
        </span>

        <span className="hidden items-center gap-1.5 rounded border border-warn/25 bg-warn/[0.05] px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-warn/90 sm:inline-flex">
          <span className="h-1 w-1 rounded-full bg-warn" />
          engine offline
        </span>

        <span className="hidden font-mono text-[10.5px] tabular-nums text-ink-mute sm:inline">
          {formatTime(now.toISOString())}
          <span className="ml-1 text-[9px] uppercase tracking-[0.14em] text-ink-mute/60">local</span>
        </span>

        <button
          type="button"
          onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
          aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
          className="focus-ring flex h-7 w-7 items-center justify-center rounded border border-line/80 text-ink-mute transition-colors hover:border-ink-mute/40 hover:text-ink"
        >
          {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </div>
    </header>
  );
}
