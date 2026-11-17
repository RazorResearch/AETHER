import { HashRouter, Navigate, Route, Routes, Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/Overview';
import { ModelsPage } from '@/pages/Models';
import { HardwarePage } from '@/pages/Hardware';
import { OptimizationPage } from '@/pages/Optimization';
import { ExperimentsPage } from '@/pages/Experiments';
import { BenchmarksPage } from '@/pages/Benchmarks';
import { ActivityPage } from '@/pages/Activity';
import { SettingsPage } from '@/pages/Settings';
import { AboutPage } from '@/pages/About';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Compass } from 'lucide-react';

function NotFoundPage() {
  return (
    <div className="animate-fade-in py-10">
      <EmptyState
        icon={<Compass />}
        title="Route not found"
        description="This workspace page does not exist. Use the sidebar to return to a known surface."
        action={
          <Link to="/overview">
            <Button variant="primary">Back to overview</Button>
          </Link>
        }
      />
    </div>
  );
}

/**
 * Hash routing keeps the build portable: it works in the dev server, in a
 * static build served from any path, and inside a Tauri webview.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="hardware" element={<HardwarePage />} />
          <Route path="optimization" element={<OptimizationPage />} />
          <Route path="experiments" element={<ExperimentsPage />} />
          <Route path="benchmarks" element={<BenchmarksPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
