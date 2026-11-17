/**
 * UI-side types for AETHER.
 *
 * Engine data shapes (models, experiments, benchmarks, hardware…) live in
 * `src/api/types.ts` and mirror docs/API_CONTRACT.md. This file only holds
 * presentation types and persisted interface preferences.
 */

/** Persisted optimization form (the run itself is owned by the engine). */
export interface OptimizationDraft {
  modelId: string | null;
  profile: string;
  customWeights: Record<'quality' | 'speed' | 'memory' | 'energy', number>;
  contextLength: number;
  /** null = no cap (engine uses what it detects as free) */
  maxVramGb: number | null;
  maxRamGb: number | null;
  kvPairs: string[];
  measure: boolean;
  perplexityDataset: string;
  repetitions: number;
  lastJobId: string | null;
}

export type ActivityCategory = 'Model' | 'Optimization' | 'Experiment' | 'Benchmark' | 'System';

export type ActivityStatus = 'Success' | 'Info' | 'Warning' | 'Failed';

/** Display row for ActivityList / ActivityTable (mapped from engine entries). */
export interface ActivityEvent {
  id: string;
  timestamp: string;
  category: ActivityCategory;
  /** Event type, e.g. "model.imported". */
  type: string;
  description: string;
  status: ActivityStatus;
}

export type MetricDirection = 'higher' | 'lower';

/** One metric compared between two measured runs (A = `original`, B = `optimized`). */
export interface BenchmarkMetric {
  id: string;
  label: string;
  unit: string;
  description: string;
  betterWhen: MetricDirection;
  original: number;
  optimized: number;
}

export type ThemeMode = 'dark' | 'light';
export type SizeUnit = 'GB' | 'GiB';

export interface WorkspaceSettings {
  theme: ThemeMode;
  unit: SizeUnit;
  language: 'en' | 'fr';
  restoreLastPage: boolean;
  engineCheckOnLaunch: boolean;
  modelsDirectory: string;
  experimentsDirectory: string;
}

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}
