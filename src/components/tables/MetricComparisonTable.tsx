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
            <th className="px-3 py-2 pl-5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute">
              Metric
            </th>
            <th className="px-3 py-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute">
              Baseline
            </th>
            <th className="px-3 py-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute">
              Optimized
            </th>
            <th className="px-3 py-2 text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute">
              Delta
            </th>
            <th className="w-[28%] px-3 py-2 pr-5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute">
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
                <td className="px-3 py-2.5 pl-5">
                  <InfoHint
                    label={<span className="text-[12px] text-ink-dim">{metric.label}</span>}
                    content={metric.description}
                    className="font-normal"
                    showIcon
                  />
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute/70">
                    {metric.unit} · {metric.betterWhen} is better
                  </div>
                </td>
                <td className="readout px-3 py-2.5 text-right text-[12px] text-ink-mute">
                  {formatNumber(metric.original, metric.original < 20 ? 2 : 1)}
                </td>
                <td className="readout px-3 py-2.5 text-right text-[12px] text-ink">
                  {formatNumber(metric.optimized, metric.optimized < 20 ? 2 : 1)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums',
                      isImprovement && 'text-ok',
                      isRegression && 'text-danger',
                      !isImprovement && !isRegression && 'text-ink-mute',
                    )}
                  >
                    <DeltaIcon className="h-3 w-3" />
                    {signedPercent(improvement)}
                  </span>
                </td>
                <td className="px-3 py-2.5 pr-5">
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r',
                        isImprovement
                          ? 'from-accent/60 to-accent'
                          : isRegression
                            ? 'from-danger/50 to-danger/80'
                            : 'from-ink-mute/40 to-ink-mute/60',
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
