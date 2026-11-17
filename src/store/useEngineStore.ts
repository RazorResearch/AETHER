import { useEffect } from 'react';
import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import type {
  ActivityEntry,
  Benchmark,
  Experiment,
  ExperimentType,
  HardwareSnapshot,
  Health,
  Job,
  ModelSummary,
  Profile,
} from '@/api/types';

export type ConnectionState = 'connecting' | 'online' | 'offline';

/** One real hardware sample kept for in-session sparklines (never synthesised). */
export interface HardwareSample {
  t: string;
  vramPct: number | null;
  ramPct: number;
  gpuUtil: number | null;
  cpuUtil: number | null;
}

const HISTORY = 60;

interface EngineState {
  connection: ConnectionState;
  lastError: string | null;
  health: Health | null;
  hardware: HardwareSnapshot | null;
  hardwareHistory: HardwareSample[];
  models: ModelSummary[];
  experiments: Experiment[];
  experimentTypes: ExperimentType[];
  benchmarks: Benchmark[];
  activity: ActivityEntry[];
  jobs: Job[];
  profiles: Profile[];
  /** true once the collections were fetched at least once */
  loaded: boolean;

  refreshHealth: () => Promise<boolean>;
  refreshHardware: () => Promise<void>;
  refreshCollections: () => Promise<void>;
  refreshStatic: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

/** Everything read from the engine. Cleared when it goes offline: stale values are never shown as current. */
const EMPTY = {
  health: null,
  hardware: null,
  hardwareHistory: [] as HardwareSample[],
  models: [] as ModelSummary[],
  experiments: [] as Experiment[],
  benchmarks: [] as Benchmark[],
  activity: [] as ActivityEntry[],
  jobs: [] as Job[],
  loaded: false,
};

const goOffline = (lastError: string) => ({ ...EMPTY, connection: 'offline' as const, lastError });

const pct = (part: number | null | undefined, total: number | null | undefined) =>
  part == null || !total ? null : Math.min(100, Math.max(0, (part / total) * 100));

export const useEngineStore = create<EngineState>()((set, get) => ({
  connection: 'connecting',
  lastError: null,
  health: null,
  hardware: null,
  hardwareHistory: [],
  models: [],
  experiments: [],
  experimentTypes: [],
  benchmarks: [],
  activity: [],
  jobs: [],
  profiles: [],
  loaded: false,

  refreshHealth: async () => {
    try {
      const health = await api.health();
      const wasOffline = get().connection !== 'online';
      set({ health, connection: 'online', lastError: null });
      if (wasOffline) void get().refreshStatic();
      return true;
    } catch (error) {
      set(goOffline(error instanceof ApiError ? error.message : String(error)));
      return false;
    }
  },

  refreshHardware: async () => {
    if (get().connection !== 'online') return;
    try {
      const hw = await api.hardware();
      const gpu = hw.gpus[0];
      const sample: HardwareSample = {
        t: hw.captured_at,
        vramPct: pct(gpu?.vram_used_bytes, gpu?.vram_total_bytes),
        ramPct: hw.memory.percent,
        gpuUtil: gpu?.utilization_gpu_percent ?? null,
        cpuUtil: hw.cpu.utilization_percent,
      };
      set((s) => ({ hardware: hw, hardwareHistory: [...s.hardwareHistory, sample].slice(-HISTORY) }));
    } catch (error) {
      if (error instanceof ApiError && error.offline) set(goOffline(error.message));
    }
  },

  refreshCollections: async () => {
    if (get().connection !== 'online') return;
    try {
      const [models, experiments, benchmarks, activity, jobs] = await Promise.all([
        api.models(),
        api.experiments(),
        api.benchmarks(),
        api.activity(),
        api.jobs(),
      ]);
      set({
        models: models.items,
        experiments: experiments.items,
        benchmarks: benchmarks.items,
        activity: activity.items,
        jobs: jobs.items,
        loaded: true,
      });
    } catch (error) {
      if (error instanceof ApiError && error.offline) set(goOffline(error.message));
    }
  },

  refreshStatic: async () => {
    try {
      const [experimentTypes, profiles] = await Promise.all([api.experimentTypes(), api.profiles()]);
      set({ experimentTypes, profiles });
    } catch {
      /* retried on next reconnection */
    }
  },

  refreshAll: async () => {
    if (await get().refreshHealth()) {
      await Promise.all([get().refreshHardware(), get().refreshCollections()]);
    }
  },
}));

/** True when at least one engine job is queued or running. */
export const useHasActiveJobs = () =>
  useEngineStore((s) => s.jobs.some((j) => j.status === 'queued' || j.status === 'running'));

/**
 * Keeps the store in sync with the engine. Mounted once in AppShell.
 * Health every 5 s, hardware every 3 s, collections every 2 s while a job
 * runs and every 8 s otherwise.
 */
export function useEngineSync() {
  const active = useHasActiveJobs();
  const connection = useEngineStore((s) => s.connection);

  useEffect(() => {
    void useEngineStore.getState().refreshAll();
    const health = window.setInterval(() => void useEngineStore.getState().refreshHealth(), 5000);
    const hardware = window.setInterval(() => void useEngineStore.getState().refreshHardware(), 3000);
    return () => {
      window.clearInterval(health);
      window.clearInterval(hardware);
    };
  }, []);

  useEffect(() => {
    if (connection !== 'online') return;
    void useEngineStore.getState().refreshCollections();
    const id = window.setInterval(
      () => void useEngineStore.getState().refreshCollections(),
      active ? 2000 : 8000,
    );
    return () => window.clearInterval(id);
  }, [active, connection]);
}

/** Engine capability helper (e.g. `useCapability('llama.cpp', 'bench')`). */
export function useCapability(engine: string, capability: string): { ok: boolean; reason: string | null } {
  const e = useEngineStore((s) => s.health?.engines.find((x) => x.name === engine));
  if (!e) return { ok: false, reason: 'Engine status unknown.' };
  const ok = Boolean(e.available && e.capabilities[capability]);
  return { ok, reason: ok ? null : e.reason ?? `${engine}: '${capability}' is not available.` };
}
