import { Link, useLocation } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { NavLinkItem } from '@/components/navigation/NavLinkItem';
import { navSections } from '@/components/navigation/navConfig';
import { useEngineStore } from '@/store/useEngineStore';
import { APP_CHANNEL, APP_VERSION } from '@/store/defaults';
import { cn } from '@/utils/cn';

/** Persistent workspace navigation rail. */
export function Sidebar() {
  const models = useEngineStore((state) => state.models);
  const experiments = useEngineStore((state) => state.experiments);
  const connection = useEngineStore((state) => state.connection);
  const health = useEngineStore((state) => state.health);
  const llama = health?.engines.find((e) => e.name === 'llama.cpp');
  const online = connection === 'online';
  const location = useLocation();

  const counters = {
    models: models.length,
    experiments: experiments.length,
  } as const;

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-[56px] shrink-0 flex-col border-r border-line/70 bg-raised lg:w-[228px]">
      {/* brand */}
      <div className="flex h-[52px] items-center border-b border-line/60 px-3 lg:px-3.5">
        <Link to="/overview" className="focus-ring rounded-sm" aria-label="AETHER overview">
          <span className="lg:hidden">
            <Logo markOnly />
          </span>
          <span className="hidden lg:block">
            <Logo />
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2 pt-3 no-scrollbar" aria-label="Main">
        {navSections.map((section, index) => (
          <div key={section.id} className={cn(index > 0 && 'mt-5')}>
            <div className="mb-1.5 hidden px-2 font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink-mute/60 lg:block">
              {section.label}
            </div>
            <div className="space-y-px">
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
      <div className="border-t border-line/60 px-2 pb-2 pt-2.5">
        <div className="mb-2.5 hidden px-2 lg:block">
          <div className="flex items-center gap-1.5">
            <span className={cn('h-[4px] w-[4px] rounded-[1px]', online ? 'bg-ok' : connection === 'connecting' ? 'bg-ink-mute' : 'bg-danger')} />
            <span
              className={cn(
                'font-mono text-[11.5px] uppercase tracking-[0.12em]',
                online ? 'text-ok/90' : connection === 'connecting' ? 'text-ink-mute' : 'text-danger/90',
              )}
            >
              {online ? `engine online · v${health?.version}` : connection === 'connecting' ? 'connecting…' : 'engine offline'}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-mute/80">
            {online
              ? llama?.available
                ? `llama.cpp ${llama.version ?? ''} attached.`
                : 'llama.cpp not found: analysis and estimates only.'
              : 'Start backend/ to load real data.'}
          </p>
        </div>

        <Link
          to="/settings"
          className="focus-ring flex items-center gap-2 rounded-sm px-2 py-1.5 text-ink-dim transition-colors hover:bg-surface2/50 hover:text-ink"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-line/80 font-mono text-[11.5px] text-ink-dim">
            LO
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-[13px] leading-tight text-ink-dim">
              Local operator
            </span>
            <span className="block truncate font-mono text-[11.5px] leading-tight text-ink-mute/70">
              local · no account
            </span>
          </span>
          <Settings2 className="hidden h-3 w-3 text-ink-mute/70 lg:block" />
        </Link>

        <div className="mt-1.5 flex items-center justify-between border-t border-line/50 px-2 pt-2 lg:mt-2">
          <span className="font-mono text-[11.5px] text-ink-mute/60 lg:hidden">v0.1</span><span className="hidden font-mono text-[11.5px] text-ink-mute/60 lg:inline">v{APP_VERSION}-{APP_CHANNEL}</span>
          <span
            className="hidden truncate font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-mute/50 lg:block"
            title={location.pathname}
          >
            {location.pathname.replace('/', '') || 'overview'}
          </span>
        </div>
      </div>
    </aside>
  );
}
