import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ActivityEvent,
  Experiment,
  LocalModel,
  OptimizationDraft,
  WorkspaceSettings,
} from '@/types';
import { createId } from '@/utils/cn';
import {
  defaultOptimizationDraft,
  defaultSettings,
  demoExperiments,
  type ImportModelInput,
  type NewActivityInput,
  type NewExperimentInput,
} from './defaults';
import { demoActivity, demoModels } from '@/data/demo';

const GIB = 1024 ** 3;

interface AppState {
  /* library */
  models: LocalModel[];
  experiments: Experiment[];
  activity: ActivityEvent[];
  /* workspace */
  settings: WorkspaceSettings;
  optimizationDraft: OptimizationDraft;
  lastVisitedPath: string;
  /* actions */
  addModel: (input: ImportModelInput) => LocalModel;
  removeModel: (id: string) => void;
  addExperiment: (input: NewExperimentInput) => Experiment;
  setExperimentStatus: (id: string, status: Experiment['status']) => void;
  removeExperiment: (id: string) => void;
  logActivity: (input: NewActivityInput) => void;
  clearActivity: () => void;
  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  updateOptimizationDraft: (patch: Partial<OptimizationDraft>) => void;
  setLastVisitedPath: (path: string) => void;
  resetWorkspace: () => void;
}

/**
 * Single persisted store for the demo workspace.
 *
 * Persistence is intentionally local-only (localStorage): no account, no
 * network call. When the Python/C++ engine is wired in, these collections
 * become the read-through cache of engine-owned state.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      models: demoModels,
      experiments: demoExperiments,
      activity: demoActivity,
      settings: defaultSettings,
      optimizationDraft: defaultOptimizationDraft,
      lastVisitedPath: '/overview',

      addModel: (input) => {
        const model: LocalModel = {
          id: createId('mdl'),
          name: input.name.trim(),
          publisher: input.publisher.trim() || 'Unknown publisher',
          parameters: input.parameters.trim() || '—',
          parametersB: input.parametersB ?? (Number.parseFloat(input.parameters) || 7),
          format: input.format,
          quantization: input.quantization.trim() || 'Unknown',
          sizeBytes: input.sizeBytes ?? Math.round((input.parametersB ?? 7) * 0.62 * GIB),
          status: input.status,
          contextWindow: input.contextWindow ?? 8192,
          importedAt: new Date().toISOString(),
          license: 'Not specified',
          notes: input.notes,
        };
        set((state) => ({ models: [model, ...state.models] }));
        get().logActivity({
          category: 'Model',
          type: 'model.import',
          description: `${model.name} registered in the local library (${model.quantization} · simulated metadata).`,
          status: 'Success',
        });
        return model;
      },

      removeModel: (id) => {
        const model = get().models.find((item) => item.id === id);
        set((state) => ({ models: state.models.filter((item) => item.id !== id) }));
        get().logActivity({
          category: 'Model',
          type: 'model.remove',
          description: model
            ? `${model.name} removed from the library. Files on disk were not touched.`
            : 'A model entry was removed from the library.',
          status: 'Warning',
        });
      },

      addExperiment: (input) => {
        const now = new Date().toISOString();
        const experiment: Experiment = {
          id: createId('exp'),
          name: input.name.trim(),
          modelId: input.modelId,
          description: input.description.trim(),
          strategyIds: input.strategyIds,
          target: input.target,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ experiments: [experiment, ...state.experiments] }));
        get().logActivity({
          category: 'Experiment',
          type: 'experiment.created',
          description: `Experiment "${experiment.name}" registered with status ${experiment.status}.`,
          status: 'Info',
        });
        return experiment;
      },

      setExperimentStatus: (id, status) => {
        const experiment = get().experiments.find((item) => item.id === id);
        set((state) => ({
          experiments: state.experiments.map((item) =>
            item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item,
          ),
        }));
        if (experiment) {
          get().logActivity({
            category: 'Experiment',
            type: 'experiment.status',
            description: `Experiment "${experiment.name}" moved to ${status}.`,
            status: status === 'Failed' ? 'Failed' : 'Info',
          });
        }
      },

      removeExperiment: (id) => {
        const experiment = get().experiments.find((item) => item.id === id);
        set((state) => ({ experiments: state.experiments.filter((item) => item.id !== id) }));
        if (experiment) {
          get().logActivity({
            category: 'Experiment',
            type: 'experiment.remove',
            description: `Experiment "${experiment.name}" deleted.`,
            status: 'Warning',
          });
        }
      },

      logActivity: (input) => {
        const event: ActivityEvent = {
          id: createId('act'),
          timestamp: input.timestamp ?? new Date().toISOString(),
          category: input.category,
          type: input.type,
          description: input.description,
          status: input.status,
        };
        set((state) => ({ activity: [event, ...state.activity].slice(0, 200) }));
      },

      clearActivity: () => {
        set({ activity: [] });
      },

      updateSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
      },

      updateOptimizationDraft: (patch) => {
        set((state) => ({ optimizationDraft: { ...state.optimizationDraft, ...patch } }));
      },

      setLastVisitedPath: (path) => set({ lastVisitedPath: path }),

      resetWorkspace: () => {
        set({
          models: demoModels,
          experiments: demoExperiments,
          activity: demoActivity,
          settings: defaultSettings,
          optimizationDraft: defaultOptimizationDraft,
          lastVisitedPath: '/overview',
        });
      },
    }),
    {
      name: 'aether.workspace.v1',
      version: 1,
      partialize: (state) => ({
        models: state.models,
        experiments: state.experiments,
        activity: state.activity,
        settings: state.settings,
        optimizationDraft: state.optimizationDraft,
        lastVisitedPath: state.lastVisitedPath,
      }),
    },
  ),
);

/** Resolve a model name from its id, with a safe fallback. */
export function useModelName(): (id: string | null | undefined) => string {
  const models = useAppStore((state) => state.models);
  return (id) => {
    if (!id) return 'No model selected';
    const model = models.find((item) => item.id === id);
    return model?.name ?? 'Unknown model';
  };
}
