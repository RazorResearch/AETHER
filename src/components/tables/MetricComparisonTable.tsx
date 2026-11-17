import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { BenchmarkMetric } from '@/types';
import { InfoHint } from '@/components/ui/Tooltip';
import { comparisonIndex, signedPercent } from '@/utils/benchmark';
import { formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

/** Absolute values, direction-aware delta and a relative bar per metric. */
export function MetricComparisonTable({ metrics }: { metrics: BenchmarkMetric[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            <th className="py-2 pl-4 pr-3 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70">
              Metric
            </th>
            <th className="px-3 py-2 text-right font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70">
              Baseline
            </th>
            <th className="px-3 py-2 text-right font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70">
              Optimized
            </th>
            <th className="px-3 py-2 text-right font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70">
              Delta
            </th>
            <th className="w-[26%] py-2 pl-3 pr-4 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70">
              Relative
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const index = comparisonIndex(metric);
            const improvement = index.deltaPct;
            const isImprovement = improvement > 0.05;
            const isRegression = improvement < -0.05;
            const DeltaIcon = isImprovement ? ArrowUpRight : isRegression ? ArrowDownRight : Minus;

            return (
              <tr key={metric.id} className="border-b border-line/30 last:border-0">
                <td className="py-2 pl-4 pr-3">
                  <InfoHint
                    label={<span className="text-[13.5px] text-ink-dim">{metric.label}</span>}
                    content={metric.description}
                    className="font-normal"
                    showIcon
                  />
                  <div className="mt-0.5 font-mono text-[11.5px] text-ink-mute/60">
                    {metric.unit} · {metric.betterWhen} is better
                  </div>
                </td>
                <td className="readout px-3 py-2 text-right text-[13px] text-ink-mute">
                  {formatNumber(metric.original, metric.original < 20 ? 2 : 1)}
                </td>
                <td className="readout px-3 py-2 text-right text-[13px] text-ink">
                  {formatNumber(metric.optimized, metric.optimized < 20 ? 2 : 1)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-mono text-[13px] tabular-nums',
                      isImprovement && 'text-ok',
                      isRegression && 'text-danger',
                      !isImprovement && !isRegression && 'text-ink-mute',
                    )}
                  >
                    <DeltaIcon className="h-3 w-3" />
                    {signedPercent(improvement)}
                  </span>
                </td>
                <td className="py-2 pl-3 pr-4">
                  <div className="relative h-[3px] w-full overflow-hidden rounded-[1px] bg-surface2">
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0',
                        isImprovement
                          ? 'bg-accent'
                          : isRegression
                            ? 'bg-danger/70'
                            : 'bg-ink-mute/50',
                      )}
                      style={{ width: `${Math.min(100, (index.optimized / 140) * 100)}%` }}
                    />
                    <span className="absolute inset-y-0 left-[71.4%] w-px bg-ink/25" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
