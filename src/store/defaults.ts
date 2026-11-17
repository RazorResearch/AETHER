import type { ActivityCategory, ActivityStatus, OptimizationDraft, WorkspaceSettings } from '@/types';

export const APP_VERSION = '0.1.0';
export const APP_CHANNEL = 'alpha';

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
  modelId: null,
  profile: 'balanced',
  customWeights: { quality: 0.25, speed: 0.25, memory: 0.25, energy: 0.25 },
  contextLength: 4096,
  maxVramGb: null,
  maxRamGb: null,
  kvPairs: ['f16/f16', 'q8_0/q8_0', 'q4_0/q4_0'],
  measure: false,
  perplexityDataset: '',
  repetitions: 3,
  lastJobId: null,
};

export const activityCategories: ActivityCategory[] = [
  'Model',
  'Optimization',
  'Experiment',
  'Benchmark',
  'System',
];

export const activityStatuses: ActivityStatus[] = ['Success', 'Info', 'Warning', 'Failed'];

