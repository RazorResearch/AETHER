import { ChevronRight, FlaskConical } from 'lucide-react';
import type { Experiment, ExperimentStatus, LocalModel } from '@/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { optimizationStrategies, optimizationTargets } from '@/data/demo';
import { formatRelative } from '@/utils/format';

export const experimentStatusTone: Record<ExperimentStatus, BadgeTone> = {
  Draft: 'neutral',
  Pending: 'warn',
  Running: 'accent',
  Completed: 'ok',
  Failed: 'danger',
};

interface ExperimentTableProps {
  experiments: Experiment[];
  models: LocalModel[];
  onOpen: (experiment: Experiment) => void;
}

export function ExperimentTable({ experiments, models, onOpen }: ExperimentTableProps) {
  const modelName = (id: string) => models.find((model) => model.id === id)?.name ?? 'Missing model';
  const strategyLabel = (id: string) =>
    optimizationStrategies.find((strategy) => strategy.id === id)?.code ?? id;
  const targetLabel = (id: string) =>
    optimizationTargets.find((target) => target.id === id)?.label ?? id;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            {['Experiment', 'Model', 'Strategies', 'Target', 'Status', 'Updated', ''].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute first:pl-5 last:pr-4"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {experiments.map((experiment) => (
            <tr
              key={experiment.id}
              onClick={() => onOpen(experiment)}
              className="group cursor-pointer border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/40"
            >
              <td className="px-3 py-2.5 pl-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line/80 bg-surface2/50 text-ink-mute">
                    <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-ink">
                      {experiment.name}
                    </div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-mute/80">
                      {experiment.id}
                    </div>
                  </div>
                </div>
              </td>
              <td className="max-w-[190px] px-3 py-2.5">
                <span className="block truncate text-[11.5px] text-ink-dim">
                  {modelName(experiment.modelId)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {experiment.strategyIds.slice(0, 3).map((id) => (
                    <span
                      key={id}
                      className="rounded border border-line/80 px-1 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute"
                      title={optimizationStrategies.find((strategy) => strategy.id === id)?.label}
                    >
                      {strategyLabel(id)}
                    </span>
                  ))}
                  {experiment.strategyIds.length > 3 && (
                    <span className="px-1 py-[2px] font-mono text-[9px] text-ink-mute/70">
                      +{experiment.strategyIds.length - 3}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5">
                <span className="text-[11px] text-ink-mute">{targetLabel(experiment.target)}</span>
              </td>
              <td className="px-3 py-2.5">
                <Badge
                  tone={experimentStatusTone[experiment.status]}
                  dot
                  pulse={experiment.status === 'Running'}
                >
                  {experiment.status}
                </Badge>
              </td>
              <td className="px-3 py-2.5">
                <span className="font-mono text-[9.5px] text-ink-mute">
                  {formatRelative(experiment.updatedAt)}
                </span>
              </td>
              <td className="px-3 py-2.5 pr-4 text-right">
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-ink-mute/40 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-mute" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
