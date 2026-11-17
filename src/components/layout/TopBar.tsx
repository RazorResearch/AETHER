import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { findNavItem } from '@/components/navigation/navConfig';
import { ProvenanceBadge } from '@/components/ui/Badge';
import { useAppStore } from '@/store/useAppStore';
import { useEngineStore } from '@/store/useEngineStore';
import { useClock } from '@/hooks/useTelemetry';
import { formatTime } from '@/utils/format';

/** Context strip above the page content: location, build status, clock. */
export function TopBar() {
  const location = useLocation();
  const theme = useAppStore((state) => state.settings.theme);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const now = useClock();
  const current = findNavItem(location.pathname);
  const connection = useEngineStore((state) => state.connection);

  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-line/60 bg-base px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em]">
        <Link to="/overview" className="text-ink-mute/70 transition-colors hover:text-ink-dim">
          AETHER
        </Link>
        <span className="text-ink-mute/30">/</span>
        <span className="truncate text-ink-dim">{current?.label ?? 'overview'}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3.5">
        <span className="hidden md:inline-flex">
          <ProvenanceBadge kind={connection === 'online' ? 'live' : 'offline'} />
        </span>

        <span className="hidden font-mono text-[12.5px] tabular-nums text-ink-mute sm:inline">
          {formatTime(now.toISOString())}
        </span>

        <button
          type="button"
          onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
          aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
          className="focus-ring flex h-6 w-6 items-center justify-center rounded-sm border border-line/80 text-ink-mute transition-colors hover:border-ink-mute/40 hover:text-ink"
        >
          {theme === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
        </button>
      </div>
    </header>
  );
}
