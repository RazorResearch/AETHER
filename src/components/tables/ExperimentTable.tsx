import { ChevronRight } from 'lucide-react';
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
  const strategyCode = (id: string) =>
    optimizationStrategies.find((strategy) => strategy.id === id)?.code ?? id;
  const targetLabel = (id: string) =>
    optimizationTargets.find((target) => target.id === id)?.label ?? id;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            {['Experiment', 'Model', 'Strategies', 'Objective', 'Status', 'Updated', ''].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-3 py-2 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70 first:pl-4 last:pr-4"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {experiments.map((experiment) => (
            <tr
              key={experiment.id}
              onClick={() => onOpen(experiment)}
              className="group cursor-pointer border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/30"
            >
              <td className="py-2 pl-4 pr-3">
                <div className="truncate text-[13.5px] text-ink">{experiment.name}</div>
                <div className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-mute/70">
                  {experiment.id}
                </div>
              </td>
              <td className="max-w-[190px] px-3 py-2">
                <span className="block truncate text-[13px] text-ink-dim">
                  {modelName(experiment.modelId)}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12px] text-ink-mute">
                  {experiment.strategyIds.map(strategyCode).join(' · ') || '—'}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="text-[13px] text-ink-mute">{targetLabel(experiment.target)}</span>
              </td>
              <td className="px-3 py-2">
                <Badge tone={experimentStatusTone[experiment.status]} dot>
                  {experiment.status}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12px] text-ink-mute/80">
                  {formatRelative(experiment.updatedAt)}
                </span>
              </td>
              <td className="py-2 pl-3 pr-4 text-right">
                <ChevronRight className="ml-auto h-3 w-3 text-ink-mute/30 transition-colors group-hover:text-ink-mute" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
