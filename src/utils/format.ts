import type { SizeUnit } from '@/types';
import { currentLanguage, currentLocale, tNow } from '@/i18n';

const GIB = 1024 ** 3;
const GB = 1000 ** 3;

/**
 * Formats a byte count using the workspace unit preference.
 * Units are labelled explicitly (GB vs GiB) — never implied.
 */
export function formatBytes(bytes: number, unit: SizeUnit = 'GiB'): string {
  const divisor = unit === 'GB' ? GB : GIB;
  const value = bytes / divisor;
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${formatNumber(value, decimals)} ${unitLabel(unit)}`;
}

/** Localised unit label: GiB/GB in English, Gio/Go in French. */
export function unitLabel(unit: SizeUnit): string {
  if (currentLanguage() === 'fr') return unit === 'GB' ? 'Go' : 'Gio';
  return unit;
}

/** Formats a gigabyte value (already in GB) with the preferred unit label. */
export function formatGigabytes(valueGb: number, unit: SizeUnit = 'GiB'): string {
  return formatBytes(valueGb * GIB, unit);
}

export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString(currentLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number, decimals = 0): string {
  return `${formatNumber(value, decimals)}%`;
}

/** e.g. "Nov 14, 09:42" */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(currentLocale(), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** e.g. "09:42:07" */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(currentLocale(), { hour12: false });
}

/** e.g. "Nov 14, 2026" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(currentLocale(), { year: 'numeric', month: 'short', day: '2-digit' });
}

/** Relative time for activity feeds, e.g. "12 min ago". */
export function formatRelative(iso: string): string {
  const date = new Date(iso).getTime();
  if (Number.isNaN(date)) return '—';
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return tNow('just now');
  if (minutes < 60) return tNow('{n} min ago', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tNow('{n} h ago', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return tNow('{n} d ago', { n: days });
  return formatDate(iso);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return clamp((part / total) * 100, 0, 100);
}
