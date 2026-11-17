import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  FolderOpen,
  Info,
  MonitorSmartphone,
  RotateCcw,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Segmented, SelectInput, TextInput, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useAppStore } from '@/store/useAppStore';
import { APP_CHANNEL, APP_VERSION } from '@/store/defaults';
import { toast } from '@/store/useToastStore';
import type { SizeUnit, ThemeMode } from '@/types';
import { cn } from '@/utils/cn';

const themes: Array<{ id: ThemeMode; label: string; description: string; icon: typeof Sun }> = [
  { id: 'dark', label: 'Nightfall', description: 'Dark — default research environment.', icon: Moon },
  { id: 'light', label: 'Daylight', description: 'Light — high ambient-light labs.', icon: Sun },
];

/** Local preferences. Every control here takes effect immediately. */
export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resetWorkspace = useAppStore((state) => state.resetWorkspace);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleBrowse = () => {
    toast.info(
      'Filesystem access unavailable',
      'Directory pickers require the desktop shell (Tauri). The path is stored as a placeholder.',
    );
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Workspace preferences. Applied immediately and stored in this browser."
        meta={<Badge tone="muted" dot>local profile</Badge>}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* --------------------------- appearance --------------------------- */}
        <Card>
          <CardHeader
            title="Interface theme"
            hint="The entire workspace is driven by semantic color tokens."
            action={<MonitorSmartphone className="h-3.5 w-3.5 text-ink-mute/60" />}
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {themes.map((theme) => {
                const active = settings.theme === theme.id;
                const Icon = theme.icon;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateSettings({ theme: theme.id })}
                    className={cn(
                      'focus-ring rounded-md border p-2 text-left transition-colors',
                      active
                        ? 'border-accent/50 bg-accent/[0.04]'
                        : 'border-line/70 hover:border-ink-mute/40',
                    )}
                  >
                    <div
                      className="flex h-16 gap-1.5 overflow-hidden rounded border border-line/60 p-1.5"
                      style={{ background: theme.id === 'dark' ? '#0a0b0e' : '#f5f5f1' }}
                    >
                      <div
                        className="w-5 shrink-0 rounded-sm"
                        style={{ background: theme.id === 'dark' ? '#13151a' : '#e8e8e1' }}
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <div
                          className="h-2 w-full rounded-sm"
                          style={{ background: theme.id === 'dark' ? '#1c2027' : '#dcdcd3' }}
                        />
                        <div className="flex flex-1 gap-1">
                          <div
                            className="flex-1 rounded-sm"
                            style={{ background: theme.id === 'dark' ? '#111318' : '#fffffd' }}
                          />
                          <div
                            className="flex-1 rounded-sm"
                            style={{ background: theme.id === 'dark' ? '#111318' : '#fffffd' }}
                          />
                        </div>
                        <div
                          className="h-1 w-2/3 rounded-sm"
                          style={{ background: theme.id === 'dark' ? '#4ac2d0' : '#0c6e7a' }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
                        <Icon className="h-3 w-3 text-ink-mute" />
                        {theme.label}
                      </span>
                      {active && <Check className="h-3 w-3 text-accent" strokeWidth={3} />}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-mute">
                      {theme.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-mute">
              Chart colors follow the theme automatically. No reload is required.
            </p>
          </CardBody>
        </Card>

        {/* ----------------------------- general ---------------------------- */}
        <Card>
          <CardHeader title="Language, units and startup" />
          <CardBody className="space-y-3.5">
            <SelectInput
              label="Interface language"
              hint="single locale"
              value="en"
              disabled
              onChange={() => undefined}
            >
              <option value="en">English (US)</option>
            </SelectInput>
            <p className="-mt-1 text-[12.5px] leading-relaxed text-ink-mute">
              This build ships in English only. Localization is planned; the selector stays disabled
              rather than pretending to switch languages.
            </p>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[13.5px] font-medium text-ink-dim">Storage units</span>
                <span className="font-mono text-[12.5px] text-ink-mute">
                  {settings.unit === 'GiB' ? 'binary · 1024' : 'decimal · 1000'}
                </span>
              </div>
              <Segmented<SizeUnit>
                ariaLabel="Storage units"
                value={settings.unit}
                onChange={(unit) => updateSettings({ unit })}
                options={[
                  { value: 'GiB', label: 'GiB · binary' },
                  { value: 'GB', label: 'GB · decimal' },
                ]}
              />
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mute">
                Affects every size readout in the workspace. Model files are usually described in
                binary units.
              </p>
            </div>

            <div className="space-y-3 border-t border-line/50 pt-3">
              <Toggle
                checked={settings.restoreLastPage}
                onChange={(restoreLastPage) => updateSettings({ restoreLastPage })}
                label="Restore last visited page"
                description="Open the workspace on the page you left, instead of Overview."
              />
              <Toggle
                checked={settings.engineCheckOnLaunch}
                onChange={(engineCheckOnLaunch) => updateSettings({ engineCheckOnLaunch })}
                label="Check engine on launch"
                description="Report the missing optimization engine once at startup."
              />
            </div>
          </CardBody>
        </Card>

        {/* ---------------------------- workspace --------------------------- */}
        <Card>
          <CardHeader
            title="Directories"
            hint="Placeholders for the future native runtime."
            action={<Badge tone="muted" mono>not accessed</Badge>}
          />
          <CardBody className="space-y-3">
            <TextInput
              label="Models directory"
              hint="placeholder"
              value={settings.modelsDirectory}
              onChange={(event) => updateSettings({ modelsDirectory: event.target.value })}
              icon={<FolderOpen />}
            />
            <TextInput
              label="Experiments directory"
              hint="placeholder"
              value={settings.experimentsDirectory}
              onChange={(event) => updateSettings({ experimentsDirectory: event.target.value })}
              icon={<FolderOpen />}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" icon={<FolderOpen />} onClick={handleBrowse}>
                Browse…
              </Button>
              <span className="text-[12.5px] text-ink-mute">
                Paths are persisted locally and never resolved by the browser.
              </span>
            </div>
            <div className="flex items-start gap-2 rounded border border-line/60 bg-raised/30 px-2.5 py-2">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-mute" />
              <p className="text-[13px] leading-relaxed text-ink-mute">
                AETHER reads no files in this build. The Python engine and Tauri shell will receive
                these paths as launch arguments.
              </p>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------ about ----------------------------- */}
        <Card>
          <CardHeader
            title="AETHER"
            hint="Adaptive AI Optimization Platform"
            action={<ShieldCheck className="h-3.5 w-3.5 text-accent/70" />}
          />
          <CardBody className="space-y-3">
            <dl className="space-y-1.5">
              {[
                ['Application', 'AETHER'],
                ['Version', `v${APP_VERSION}-${APP_CHANNEL}`],
                ['Organization', 'RazorResearch'],
                ['License', 'Apache 2.0 — planned'],
                ['Build', 'Preview · engine offline'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
                    {label}
                  </dt>
                  <dd className="text-[13.5px] text-ink-dim">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-2 border-t border-line/50 pt-3">
              <Link
                to="/about"
                className="focus-ring inline-flex h-8 items-center rounded-md border border-line bg-surface2 px-3 text-[13.5px] text-ink transition-colors hover:border-accent/40 hover:text-accent"
              >
                About RazorResearch
              </Link>
              <Button
                variant="danger"
                size="sm"
                icon={<RotateCcw />}
                onClick={() => setConfirmReset(true)}
                className="ml-auto"
              >
                Restore demo data
              </Button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-mute">
              Restoring demo data clears local edits to models, experiments, activity and settings.
            </p>
          </CardBody>
        </Card>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Restore demonstration workspace?"
        kicker="confirmation"
        description="Local changes to models, experiments, activity and preferences will be discarded."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<RotateCcw />}
              onClick={() => {
                resetWorkspace();
                setConfirmReset(false);
                toast.success('Demo workspace restored', 'Seed models, experiments and events are back.');
              }}
            >
              Restore
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-dim">
          Only data stored in this browser is affected. No file on disk is created or modified.
        </p>
      </Modal>
    </div>
  );
}
