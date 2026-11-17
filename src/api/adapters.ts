import type { BadgeTone } from '@/components/ui/Badge';
import type { ActivityEvent } from '@/types';
import type { ActivityEntry, ExperimentStatus, JobStatus, ModelSummary } from './types';
import type { SizeUnit } from '@/types';
import { formatBytes, formatNumber } from '@/utils/format';

/** Engine activity entry → UI activity row (ActivityList / ActivityTable). */
export function toActivityEvent(entry: ActivityEntry): ActivityEvent {
  const status = { info: 'Info', success: 'Success', warning: 'Warning', error: 'Failed' } as const;
  const category = {
    system: 'System',
    model: 'Model',
    experiment: 'Experiment',
    benchmark: 'Benchmark',
    optimization: 'Optimization',
    hardware: 'System',
  } as const;
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    category: category[entry.category],
    type: entry.type,
    description: entry.message,
    status: status[entry.status],
  };
}

export const jobStatusTone: Record<ExperimentStatus | JobStatus, BadgeTone> = {
  draft: 'neutral',
  queued: 'warn',
  running: 'accent',
  completed: 'ok',
  failed: 'danger',
  cancelled: 'muted',
};

export const jobStatusLabel: Record<ExperimentStatus | JobStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** "1.78 B" style parameter count; '—' when unknown. */
export function formatParams(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return `${formatNumber(n / 1e9, n >= 1e10 ? 1 : 2)} B`;
  if (n >= 1e6) return `${formatNumber(n / 1e6, 0)} M`;
  return formatNumber(n, 0);
}

export function formatBytesOrDash(bytes: number | null | undefined, unit: SizeUnit): string {
  return bytes == null ? '—' : formatBytes(bytes, unit);
}

export function formatContext(tokens: number | null | undefined): string {
  if (tokens == null) return '—';
  return tokens >= 1024 ? `${formatNumber(tokens / 1024, 0)}K` : String(tokens);
}

export function modelLabel(models: ModelSummary[], id: string | null | undefined): string {
  if (!id) return '—';
  return models.find((m) => m.id === id)?.name ?? `${id} (removed)`;
}

export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
