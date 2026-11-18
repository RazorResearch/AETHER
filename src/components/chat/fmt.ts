import { formatBytes, formatNumber } from '@/utils/format';
import type { SizeUnit } from '@/types';

/** Every chat metric goes through these: missing values read "Unavailable", never 0. */
export const UNAVAILABLE = 'Unavailable';

export const ms = (v: number | null | undefined, d = 0) => (v == null ? UNAVAILABLE : `${formatNumber(v, d)} ms`);
export const tps = (v: number | null | undefined, d = 1) => (v == null ? UNAVAILABLE : `${formatNumber(v, d)} tok/s`);
export const pct = (v: number | null | undefined) => (v == null ? UNAVAILABLE : `${formatNumber(v, 0)} %`);
export const bytes = (v: number | null | undefined, unit: SizeUnit) => (v == null ? UNAVAILABLE : formatBytes(v, unit));
export const num = (v: number | null | undefined, d = 0) => (v == null ? UNAVAILABLE : formatNumber(v, d));
export const watts = (v: number | null | undefined) => (v == null ? UNAVAILABLE : `${formatNumber(v, 1)} W`);
export const celsius = (v: number | null | undefined) => (v == null ? UNAVAILABLE : `${formatNumber(v, 0)} °C`);
export const secs = (v: number | null | undefined) => (v == null ? UNAVAILABLE : `${formatNumber(v, 2)} s`);
