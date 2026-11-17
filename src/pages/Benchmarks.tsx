import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Scale } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectInput } from '@/components/ui/Field';
import { InfoHint } from '@/components/ui/Tooltip';
import { StatTile } from '@/components/cards/StatTile';
import { ComparisonChart } from '@/components/charts/ComparisonChart';
import { BenchmarkRadar } from '@/components/charts/BenchmarkRadar';
import { MetricComparisonTable } from '@/components/tables/MetricComparisonTable';
import { benchmarkMetricsForRun, benchmarkRuns } from '@/data/demo';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/useToastStore';
import { APP_VERSION } from '@/store/defaults';
import { comparisonIndex, signedPercent } from '@/utils/benchmark';
import { formatDateTime, formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

const HEADLINE_IDS = ['tps', 'ttft', 'vram', 'energy'];

/** Benchmark comparison: baseline vs optimized, entirely demonstration data. */
export function BenchmarksPage() {
  const [runId, setRunId] = useState(benchmarkRuns[0].id);
  const logActivity = useAppStore((state) => state.logActivity);

  const run = benchmarkRuns.find((item) => item.id === runId) ?? benchmarkRuns[0];
  const metrics = useMemo(() => benchmarkMetricsForRun(run.id), [run.id]);

  const summary = useMemo(() => {
    const improved = metrics.filter((metric) => comparisonIndex(metric).deltaPct > 0.05).length;
    const regressed = metrics.filter((metric) => comparisonIndex(metric).deltaPct < -0.05).length;
    const meanDelta =
      metrics.reduce((total, metric) => total + comparisonIndex(metric).deltaPct, 0) / metrics.length;
    return { improved, regressed, meanDelta };
  }, [metrics]);

  const exportReport = () => {
    const report = {
      application: 'AETHER',
      version: APP_VERSION,
      organization: 'RazorResearch',
      generatedAt: new Date().toISOString(),
      disclaimer:
        'Demonstration report. All values are fictional and were generated locally for interface preview; no model was executed and no hardware was measured.',
      run: {
        id: run.id,
        label: run.label,
        model: run.modelName,
        baseline: run.originalVariant,
        optimized: run.optimizedVariant,
        capturedAt: run.capturedAt,
      },
      metrics: metrics.map((metric) => ({
        metric: metric.label,
        unit: metric.unit,
        betterWhen: metric.betterWhen,
        baseline: metric.original,
        optimized: metric.optimized,
        relativeIndex: comparisonIndex(metric).optimized,
        deltaPct: comparisonIndex(metric).deltaPct,
        description: metric.description,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aether-benchmark-${run.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    logActivity({
      category: 'Benchmark',
      type: 'benchmark.export',
      description: `Report exported: aether-benchmark-${run.id}.json (demonstration values).`,
      status: 'Success',
    });
    toast.success('Report exported', 'The JSON file was generated locally with demo values only.');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Benchmarks"
        subtitle="Compare a baseline model against an optimized profile across quality, speed and memory."
        code="workspace / benchmarks"
        meta={<ProvenanceBadge />}
        actions={
          <>
            <SelectInput
              aria-label="Benchmark run"
              value={run.id}
              onChange={(event) => setRunId(event.target.value)}
              wrapperClassName="w-[268px]"
            >
              {benchmarkRuns.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
            <Button variant="primary" icon={<Download />} onClick={exportReport}>
              Export report
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-start gap-2.5 rounded-md border border-warn/25 bg-warn/[0.04] px-3.5 py-2.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
        <p className="text-[11.5px] leading-relaxed text-ink-dim">
          <span className="font-medium text-warn">Demonstration benchmarking.</span> AETHER does not
          implement the inference engine, so these measurements are fictional. Exported reports are
          watermarked with the same disclaimer.
        </p>
      </div>

      <Card className="mb-3">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Model under test', run.modelName],
            ['Baseline', run.originalVariant],
            ['Optimized profile', run.optimizedVariant],
            ['Captured', formatDateTime(run.capturedAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-mute">
                {label}
              </div>
              <div className="mt-1 text-[11.5px] leading-snug text-ink-dim">{value}</div>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            kicker="comparison"
            title="Relative metric index"
            hint="Baseline = 100. Direction-aware, so a longer bar always means an improvement."
            action={<Badge tone="accent" mono>demo</Badge>}
          />
          <CardBody>
            <ComparisonChart metrics={metrics} />
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line/40 pt-2.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute">
                <span className="h-2 w-3 rounded-sm bg-accent" /> optimized
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute">
                <span className="h-2 w-3 rounded-sm bg-ink-mute/40" /> baseline
              </span>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute/60">
                <Scale className="h-3 w-3" />
                dashed line = parity
              </span>
            </div>
          </CardBody>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            kicker="profile shape"
            title="Normalized profile"
            hint="Scores are simulated and normalized per axis."
          />
          <CardBody className="pb-2">
            <BenchmarkRadar />
            <div className="flex items-center justify-center gap-4 pb-1">
              <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-mute">
                <span className="h-[2px] w-4 rounded bg-glacier" /> baseline
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-mute">
                <span className="h-[2px] w-4 rounded bg-accent" /> optimized
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {HEADLINE_IDS.map((id) => {
          const metric = metrics.find((item) => item.id === id);
          if (!metric) return null;
          const index = comparisonIndex(metric);
          const positive = index.deltaPct > 0;
          return (
            <StatTile
              key={id}
              label={metric.label}
              value={
                <span className="flex items-baseline gap-1.5">
                  {formatNumber(metric.optimized, metric.optimized < 20 ? 2 : 1)}
                  <span className="text-[9.5px] font-normal text-ink-mute">{metric.unit}</span>
                </span>
              }
              detail={
                <span className="flex items-center gap-1">
                  <InfoHint
                    label={`baseline ${formatNumber(metric.original, metric.original < 20 ? 2 : 1)}`}
                    content={metric.description}
                    showIcon={false}
                  />
                </span>
              }
              badge={
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-mono text-[10px]',
                    positive ? 'text-ok' : 'text-danger',
                  )}
                >
                  {positive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {signedPercent(index.deltaPct)}
                </span>
              }
            />
          );
        })}
      </div>

      <Card className="mt-3">
        <CardHeader
          kicker="metric breakdown"
          title="Scientific metrics"
          hint={`${summary.improved} improved · ${summary.regressed} regressed · mean relative delta ${signedPercent(summary.meanDelta)}`}
          action={<Badge tone="muted" mono>fictional values</Badge>}
        />
        <MetricComparisonTable metrics={metrics} />
        <div className="border-t border-line/40 px-5 py-2.5">
          <p className="text-[10.5px] leading-relaxed text-ink-mute">
            Perplexity and accuracy are quality regressions observed in this fictional profile: an
            aggressive quantization trade-off. AETHER will report real trade-offs once the engine
            exists — never invent them.
          </p>
        </div>
      </Card>
    </div>
  );
}
