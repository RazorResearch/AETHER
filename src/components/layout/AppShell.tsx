import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toasts } from '@/components/ui/Toasts';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/useToastStore';
import { useEngineStore, useEngineSync } from '@/store/useEngineStore';

/**
 * Application frame: persistent rail + context bar + scrollable content.
 * Also owns the two local launch behaviours configured in Settings.
 */
export function AppShell() {
  const settings = useAppStore((state) => state.settings);
  const lastVisitedPath = useAppStore((state) => state.lastVisitedPath);
  const setLastVisitedPath = useAppStore((state) => state.setLastVisitedPath);
  const location = useLocation();
  const navigate = useNavigate();
  const didLaunch = useRef(false);
  useEngineSync();

  /* Apply the theme token set to the document. */
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  /* Launch behaviours run once per session. */
  useEffect(() => {
    if (didLaunch.current) return;
    didLaunch.current = true;

    if (settings.restoreLastPage && lastVisitedPath && lastVisitedPath !== location.pathname) {
      navigate(lastVisitedPath, { replace: true });
    }
    if (settings.engineCheckOnLaunch) {
      window.setTimeout(() => {
        const { connection, health } = useEngineStore.getState();
        if (connection === 'online' && health) {
          const llama = health.engines.find((e) => e.name === 'llama.cpp');
          toast.success(
            `Engine connected · v${health.version}`,
            llama?.available
              ? `llama.cpp ${llama.version ?? ''} available for benchmarks.`
              : 'llama.cpp not found: analysis and estimates only, no benchmarks.',
          );
        } else {
          toast.warning('Engine offline', 'Start the AETHER engine (backend/) to see real data.');
        }
      }, 1500);
    }
    // Intentionally mount-only: launch preferences are read from the persisted store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Remember the last visited workspace page and reset the scroll offset. */
  useEffect(() => {
    setLastVisitedPath(location.pathname);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, setLastVisitedPath]);

  return (
    <div className="flex min-h-screen w-full bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="relative flex-1">
          <div className="relative mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-6">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
