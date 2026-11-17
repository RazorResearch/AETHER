import { ChevronRight } from 'lucide-react';
import type { Experiment, ExperimentType, ModelSummary } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { jobStatusLabel, jobStatusTone, modelLabel } from '@/api/adapters';
import { formatRelative } from '@/utils/format';
import { useT } from '@/i18n';

interface ExperimentTableProps {
  experiments: Experiment[];
  models: ModelSummary[];
  types: ExperimentType[];
  onOpen: (experiment: Experiment) => void;
}

export function ExperimentTable({ experiments, models, types, onOpen }: ExperimentTableProps) {
  const t = useT();
  const typeName = (id: string) => t(types.find((x) => x.id === id)?.name ?? id);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            {[t('Experiment'), t('Type'), t('Model'), t('Status'), t('Updated'), ''].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-3 py-2 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70 first:pl-4 last:pr-4"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {experiments.map((e) => {
            const active = e.status === 'running' || e.status === 'queued';
            return (
              <tr
                key={e.id}
                onClick={() => onOpen(e)}
                className="group cursor-pointer border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/30"
              >
                <td className="py-2 pl-4 pr-3">
                  <div className="truncate text-[13.5px] text-ink">{e.name}</div>
                  <div className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-mute/70">{e.id}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="text-[13px] text-ink-mute">{typeName(e.type)}</span>
                </td>
                <td className="max-w-[220px] px-3 py-2">
                  <span className="block truncate text-[13px] text-ink-dim">{modelLabel(models, e.model_id)}</span>
                </td>
                <td className="min-w-[150px] px-3 py-2">
                  <Badge tone={jobStatusTone[e.status]} dot>
                    {t(jobStatusLabel[e.status])}
                  </Badge>
                  {active && e.job && (
                    <div className="mt-1.5">
                      <ProgressBar value={e.job.progress * 100} height="sm" />
                      <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-mute/70">{e.job.stage}</div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[12px] text-ink-mute/80">{formatRelative(e.updated_at)}</span>
                </td>
                <td className="py-2 pl-3 pr-4 text-right">
                  <ChevronRight className="ml-auto h-3 w-3 text-ink-mute/30 transition-colors group-hover:text-ink-mute" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
