import type { BenchmarkMetric } from '@/types';

/**
 * Relative comparison index for a metric, where 100 means "identical to the
 * baseline". Direction-aware so that a *higher* bar always means *better*,
 * regardless of whether the metric itself should go up or down.
 */
export function comparisonIndex(metric: BenchmarkMetric): {
  original: number;
  optimized: number;
  deltaPct: number;
} {
  const { original, optimized, betterWhen } = metric;
  if (original === 0) return { original: 100, optimized: 100, deltaPct: 0 };

  const rawDelta = ((optimized - original) / Math.abs(original)) * 100;
  const improvement = betterWhen === 'higher' ? rawDelta : -rawDelta;
  const optimizedIndex =
    betterWhen === 'higher' ? (optimized / original) * 100 : (original / optimized) * 100;

  return {
    original: 100,
    optimized: Number(optimizedIndex.toFixed(1)),
    deltaPct: Number(improvement.toFixed(1)),
  };
}

/** Percentage change with a signed label, e.g. "+55.4%" / "−12.0%". */
export function signedPercent(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return '0.0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(decimals)}%`;
}
