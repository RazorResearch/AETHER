import type { TelemetrySnapshot } from '@/types';

/**
 * System telemetry bridge — CONTRACT ONLY.
 *
 * The frontend runs without native privileges, so it cannot read GPU counters.
 * A future desktop build will implement this module against:
 *
 *   - Tauri commands (Rust):   invoke('read_telemetry')
 *   - Python sidecar (HTTP):   GET http://127.0.0.1:PORT/api/hardware
 *   - C++/CUDA engine:         NVML / CUDA runtime counters
 *
 * Until then `isBridgeAvailable()` always resolves to false and the UI must
 * display simulated values, clearly labelled.
 */

export interface SystemBridge {
  readonly id: 'tauri' | 'python' | 'engine';
  readonly label: string;
  isAvailable: () => Promise<boolean>;
  readTelemetry: () => Promise<TelemetrySnapshot>;
}

export const TELEMETRY_BRIDGE = {
  /** Set to a real bridge implementation once the desktop shell ships. */
  current: null as SystemBridge | null,
  status: 'unavailable' as 'unavailable' | 'connecting' | 'connected',
  reason:
    'No native telemetry bridge is bundled with this preview build. Values shown are simulated.',
};

export function getActiveBridge(): SystemBridge | null {
  return TELEMETRY_BRIDGE.current;
}
