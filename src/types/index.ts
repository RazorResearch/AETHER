/**
 * Shared domain types for AETHER.
 *
 * Everything in this file describes the *interface contract* of the platform.
 * The optimization engine (C++/CUDA) and the system telemetry bridge (Python /
 * Tauri) are not implemented yet: the frontend only consumes these shapes so
 * that a real backend can be plugged in without touching the UI layer.
 */

export type ModelFormat = 'GGUF' | 'Safetensors';

/** Lifecycle of a model inside the local library. */
export type ModelStatus = 'Ready' | 'Indexed' | 'Idle' | 'Unavailable';

export interface LocalModel {
  id: string;
  name: string;
  publisher: string;
  /** Human readable parameter count, e.g. "8B". */
  parameters: string;
  /** Numeric parameter count in billions — used for sorting/aggregation. */
  parametersB: number;
  format: ModelFormat;
  quantization: string;
  /** Size on disk in bytes. */
  sizeBytes: number;
  status: ModelStatus;
  contextWindow: number;
  importedAt: string;
  license: string;
  notes?: string;
}

export type OptimizationStrategyId =
  | 'adaptive-quantization'
  | 'kv-cache-optimization'
  | 'layer-wise-precision'
  | 'structured-pruning'
  | 'speculative-decoding'
  | 'memory-optimization'
  | 'cpu-gpu-offloading';

export interface OptimizationStrategy {
  id: OptimizationStrategyId;
  label: string;
  /** Short engine-facing identifier, shown as a monospace tag. */
  code: string;
  description: string;
  /** Scientific detail surfaced through a tooltip. */
  detail: string;
  /** Maturity of the capability in the current build. */
  maturity: 'Preview' | 'Planned';
  /** Signals shown on the strategy row. */
  tags: string[];
}

export type OptimizationTargetId = 'max-intelligence' | 'balanced' | 'min-memory';

export interface OptimizationTarget {
  id: OptimizationTargetId;
  label: string;
  description: string;
  /** Relative weights, purely illustrative of the future objective function. */
  weights: { intelligence: number; speed: number; memory: number };
}

export interface OptimizationConstraints {
  maxVramGb: number;
  maxRamGb: number;
  contextLength: number;
  targetTokensPerSecond: number;
}

export interface OptimizationAdvancedOptions {
  quantizationBits: number;
  kvCachePrecision: 'f16' | 'q8' | 'q4';
  offloadLayers: number;
  pruningRatio: number;
  speculativeDraftTokens: number;
}

/** Full configuration of a pending optimization run (not executed yet). */
export interface OptimizationDraft {
  modelId: string | null;
  strategyIds: OptimizationStrategyId[];
  target: OptimizationTargetId;
  advancedMode: boolean;
  constraints: OptimizationConstraints;
  advanced: OptimizationAdvancedOptions;
}

export type ExperimentStatus = 'Draft' | 'Pending' | 'Running' | 'Completed' | 'Failed';

export interface Experiment {
  id: string;
  name: string;
  modelId: string;
  description: string;
  strategyIds: OptimizationStrategyId[];
  target: OptimizationTargetId;
  status: ExperimentStatus;
  createdAt: string;
  updatedAt: string;
}

export type ActivityCategory = 'Model' | 'Optimization' | 'Experiment' | 'Benchmark' | 'System';

export type ActivityStatus = 'Success' | 'Info' | 'Warning' | 'Failed';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  category: ActivityCategory;
  /** Event type, e.g. "model.import". */
  type: string;
  description: string;
  status: ActivityStatus;
}

export type MetricDirection = 'higher' | 'lower';

export interface BenchmarkMetric {
  id: string;
  label: string;
  unit: string;
  description: string;
  betterWhen: MetricDirection;
  original: number;
  optimized: number;
}

export interface BenchmarkRun {
  id: string;
  label: string;
  modelName: string;
  originalVariant: string;
  optimizedVariant: string;
  capturedAt: string;
}

/** One sample of simulated system telemetry. */
export interface TelemetrySnapshot {
  capturedAt: string;
  gpuName: string;
  vramUsedGb: number;
  vramTotalGb: number;
  gpuUtilization: number;
  gpuTemperatureC: number;
  cpuName: string;
  cpuCores: number;
  cpuUtilization: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  /** Per-core utilization, 0–100. */
  coreLoad: number[];
}

export type ThemeMode = 'dark' | 'light';
export type SizeUnit = 'GB' | 'GiB';

export interface WorkspaceSettings {
  theme: ThemeMode;
  unit: SizeUnit;
  language: 'en';
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
