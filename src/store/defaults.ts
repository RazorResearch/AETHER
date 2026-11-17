import type {
  ActivityCategory,
  ActivityEvent,
  ActivityStatus,
  Experiment,
  ExperimentStatus,
  LocalModel,
  OptimizationDraft,
  WorkspaceSettings,
} from '@/types';

export const APP_VERSION = '0.1.0';
export const APP_CHANNEL = 'alpha';
export const BUILD_LABEL = 'preview build · engine offline';

export const defaultSettings: WorkspaceSettings = {
  theme: 'dark',
  unit: 'GiB',
  language: 'en',
  restoreLastPage: true,
  engineCheckOnLaunch: true,
  modelsDirectory: '~/AETHER/models',
  experimentsDirectory: '~/AETHER/experiments',
};

export const defaultOptimizationDraft: OptimizationDraft = {
  modelId: 'mdl_llama31_8b',
  strategyIds: ['adaptive-quantization', 'kv-cache-optimization', 'layer-wise-precision'],
  target: 'balanced',
  advancedMode: false,
  constraints: {
    maxVramGb: 8,
    maxRamGb: 16,
    contextLength: 8192,
    targetTokensPerSecond: 45,
  },
  advanced: {
    quantizationBits: 4,
    kvCachePrecision: 'q8',
    offloadLayers: 0,
    pruningRatio: 0.1,
    speculativeDraftTokens: 4,
  },
};

export const experimentStatuses: ExperimentStatus[] = [
  'Draft',
  'Pending',
  'Running',
  'Completed',
  'Failed',
];

export const activityCategories: ActivityCategory[] = [
  'Model',
  'Optimization',
  'Experiment',
  'Benchmark',
  'System',
];

export const activityStatuses: ActivityStatus[] = ['Success', 'Info', 'Warning', 'Failed'];

/** Seed experiments — demo only, persisted in localStorage after first load. */
export const demoExperiments: Experiment[] = [
  {
    id: 'exp_014',
    name: 'KV cache precision sweep',
    modelId: 'mdl_llama31_8b',
    description:
      'Compare f16, q8 and q4 KV cache storage at 8k and 32k context lengths while holding quantization constant.',
    strategyIds: ['kv-cache-optimization', 'adaptive-quantization'],
    target: 'balanced',
    status: 'Running',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 96 * 60_000).toISOString(),
  },
  {
    id: 'exp_013',
    name: 'Offload threshold under 8 GiB',
    modelId: 'mdl_qwen25_14b',
    description:
      'Find the layer count that must be offloaded to keep VRAM below 8 GiB without collapsing throughput.',
    strategyIds: ['cpu-gpu-offloading', 'memory-optimization'],
    target: 'min-memory',
    status: 'Completed',
    createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: 'exp_012',
    name: 'Layer sensitivity profile',
    modelId: 'mdl_mistral_7b',
    description:
      'Measure perplexity impact of lowering precision on each transformer block independently.',
    strategyIds: ['layer-wise-precision', 'adaptive-quantization'],
    target: 'max-intelligence',
    status: 'Completed',
    createdAt: new Date(Date.now() - 11 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  },
  {
    id: 'exp_011',
    name: 'Speculative draft alignment',
    modelId: 'mdl_phi35_mini',
    description:
      'Pair Phi-3.5 Mini as draft model for Llama 3.2 3B. Halted when the draft checkpoint was missing.',
    strategyIds: ['speculative-decoding'],
    target: 'balanced',
    status: 'Failed',
    createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 13 * 86_400_000).toISOString(),
  },
  {
    id: 'exp_010',
    name: 'Structured pruning readiness',
    modelId: 'mdl_deepseek_r1_7b',
    description:
      'Draft plan for head-pruning experiments once the conversion pipeline is available.',
    strategyIds: ['structured-pruning'],
    target: 'min-memory',
    status: 'Draft',
    createdAt: new Date(Date.now() - 18 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 86_400_000).toISOString(),
  },
];

export type ImportModelInput = Pick<
  LocalModel,
  'name' | 'publisher' | 'parameters' | 'format' | 'quantization' | 'status'
> & { parametersB?: number; sizeBytes?: number; contextWindow?: number; notes?: string };

export type NewExperimentInput = {
  name: string;
  modelId: string;
  description: string;
  strategyIds: Experiment['strategyIds'];
  target: Experiment['target'];
  status: ExperimentStatus;
};

export type NewActivityInput = Omit<ActivityEvent, 'id' | 'timestamp'> & { timestamp?: string };
