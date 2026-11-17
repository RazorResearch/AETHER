import { Link, useLocation } from 'react-router-dom';
import { ChevronsUpDown, Settings2, Signal } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { NavLinkItem } from '@/components/navigation/NavLinkItem';
import { navSections } from '@/components/navigation/navConfig';
import { useAppStore } from '@/store/useAppStore';
import { APP_CHANNEL, APP_VERSION } from '@/store/defaults';
import { cn } from '@/utils/cn';

/** Persistent workspace navigation rail. */
export function Sidebar() {
  const models = useAppStore((state) => state.models);
  const experiments = useAppStore((state) => state.experiments);
  const location = useLocation();

  const counters = {
    models: models.length,
    experiments: experiments.length,
  } as const;

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-[58px] shrink-0 flex-col border-r border-line/70 bg-raised/80 backdrop-blur-sm lg:w-[244px]">
      {/* brand */}
      <div className="flex h-[54px] items-center border-b border-line/60 px-3 lg:px-4">
        <Link to="/overview" className="focus-ring rounded-md" aria-label="AETHER overview">
          <span className="lg:hidden">
            <Logo markOnly />
          </span>
          <span className="hidden lg:block">
            <Logo />
          </span>
        </Link>
      </div>

      <div className="hidden items-center justify-between px-4 pb-3 pt-3 lg:flex">
        <span className="inline-flex items-center gap-1.5 rounded border border-line/80 bg-surface/60 px-1.5 py-[3px] font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
          v{APP_VERSION}-{APP_CHANNEL}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute/70">local</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2 pt-2 no-scrollbar lg:pt-0" aria-label="Main">
        {navSections.map((section, index) => (
          <div key={section.id} className={cn(index > 0 && 'mt-5')}>
            <div className="mb-1.5 hidden px-2.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-mute/70 lg:block">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLinkItem
                  key={item.path}
                  item={item}
                  count={item.counter ? counters[item.counter] : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* status + local operator */}
      <div className="border-t border-line/70 px-2 py-3">
        <div className="mb-2 hidden rounded-md border border-line/70 bg-surface/60 px-2.5 py-2.5 lg:block">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warn" />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-warn">
              engine unavailable
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-mute">
            Preview build — no inference or optimization engine attached.
          </p>
        </div>

        <Link
          to="/settings"
          className="focus-ring flex items-center gap-2.5 rounded px-1.5 py-1.5 text-ink-dim transition-colors hover:bg-surface2/50 hover:text-ink"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-surface2/70 font-mono text-[9px] font-medium text-accent">
            LO
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-[11.5px] font-medium leading-tight text-ink">
              Local operator
            </span>
            <span className="block truncate font-mono text-[9.5px] leading-tight text-ink-mute">
              no account · offline
            </span>
          </span>
          <Settings2 className="hidden h-3.5 w-3.5 text-ink-mute lg:block" />
        </Link>

        <div className="mt-1.5 flex items-center justify-between px-1.5 lg:hidden">
          <Signal className="h-3 w-3 text-warn" />
          <ChevronsUpDown className="h-3 w-3 text-ink-mute/60" />
        </div>

        <div className="mt-2 hidden items-center justify-between border-t border-line/50 px-1.5 pt-2 lg:flex">
          <span className="font-mono text-[9px] tracking-[0.1em] text-ink-mute/70">
            v{APP_VERSION}
          </span>
          <span
            className="truncate font-mono text-[9px] tracking-[0.1em] text-ink-mute/50"
            title={location.pathname}
          >
            {location.pathname.replace('/', '').toUpperCase() || 'OVERVIEW'}
          </span>
        </div>
      </div>
    </aside>
  );
}
