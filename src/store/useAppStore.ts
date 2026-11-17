import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OptimizationDraft, WorkspaceSettings } from '@/types';
import { defaultOptimizationDraft, defaultSettings } from './defaults';

interface AppState {
  settings: WorkspaceSettings;
  optimizationDraft: OptimizationDraft;
  lastVisitedPath: string;
  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  updateOptimizationDraft: (patch: Partial<OptimizationDraft>) => void;
  setLastVisitedPath: (path: string) => void;
  resetPreferences: () => void;
}

/**
 * UI preferences only (theme, units, last page, optimization form).
 *
 * Models, experiments, benchmarks and activity are owned by the AETHER
 * engine and live in `useEngineStore` — never in localStorage.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      optimizationDraft: defaultOptimizationDraft,
      lastVisitedPath: '/overview',

      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      updateOptimizationDraft: (patch) =>
        set((state) => ({ optimizationDraft: { ...state.optimizationDraft, ...patch } })),
      setLastVisitedPath: (path) => set({ lastVisitedPath: path }),
      resetPreferences: () =>
        set({ settings: defaultSettings, optimizationDraft: defaultOptimizationDraft, lastVisitedPath: '/overview' }),
    }),
    {
      name: 'aether.workspace.v1',
      version: 2,
      // v1 stored demonstration models/experiments/activity: drop them.
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<AppState>;
        return {
          settings: { ...defaultSettings, ...(old.settings ?? {}) },
          optimizationDraft: defaultOptimizationDraft,
          lastVisitedPath: old.lastVisitedPath ?? '/overview',
        } as AppState;
      },
      partialize: (state) => ({
        settings: state.settings,
        optimizationDraft: state.optimizationDraft,
        lastVisitedPath: state.lastVisitedPath,
      }),
    },
  ),
);
