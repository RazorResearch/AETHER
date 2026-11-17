import { PlugZap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useEngineStore } from '@/store/useEngineStore';
import { API_BASE } from '@/api/client';
import { useT } from '@/i18n';

/**
 * Shown in place of data when the engine is unreachable. AETHER never falls
 * back to demonstration values.
 */
export function EngineOffline({ compact = false }: { compact?: boolean }) {
  const connection = useEngineStore((s) => s.connection);
  const lastError = useEngineStore((s) => s.lastError);
  const refreshAll = useEngineStore((s) => s.refreshAll);
  const t = useT();

  if (connection === 'online') return null;

  if (connection === 'connecting') {
    return (
      <div className="mb-3 flex items-center gap-2 border-l-2 border-line pl-3 text-[13.5px] text-ink-mute">
        <RefreshCw className="h-3 w-3 animate-spin" />
        {t('Connecting to the AETHER engine…')}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-md border border-danger/30 bg-danger/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">{t("Engine offline — no data displayed")}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">
            {t('The UI shows only values read from the AETHER engine ({url}).', { url: API_BASE })} {lastError && t(lastError)}
          </p>
          {!compact && (
            <pre className="mt-2 overflow-x-auto rounded border border-line/70 bg-base/60 px-3 py-2 font-mono text-[12.5px] text-ink-dim">
              cd backend{'\n'}python -m venv .venv &amp;&amp; .venv/bin/pip install -r requirements.txt{'\n'}
              .venv/bin/python -m app.cli serve
            </pre>
          )}
        </div>
        <Button variant="secondary" icon={<RefreshCw />} onClick={() => void refreshAll()}>
          {t('Retry')}
        </Button>
      </div>
    </div>
  );
}
