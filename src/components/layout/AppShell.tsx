import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toasts } from '@/components/ui/Toasts';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/useToastStore';

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
        toast.warning(
          'Optimization engine unavailable',
          'AETHER is running without the C++/CUDA engine. All metrics are demonstration data.',
        );
      }, 700);
    }
    // Intentionally mount-only: launch preferences are read from the persisted store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Remember the last visited workspace page. */
  useEffect(() => {
    setLastVisitedPath(location.pathname);
  }, [location.pathname, setLastVisitedPath]);

  return (
    <div className="flex min-h-screen w-full bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="relative flex-1">
          <div className="app-grid pointer-events-none absolute inset-x-0 top-0 h-[320px] opacity-60" />
          <div className="relative mx-auto w-full max-w-[1460px] px-4 py-5 lg:px-7 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
