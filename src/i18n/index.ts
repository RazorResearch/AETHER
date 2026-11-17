import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { fr } from './fr';

/**
 * Minimal i18n: the English source string is the key. A missing translation
 * falls back to English, so the UI never shows a raw key.
 * Placeholders use `{name}` and are filled from `vars`.
 *
 * Text produced by the engine (error messages, activity messages, notes) is
 * displayed as sent by the engine (English).
 */
export type Language = 'en' | 'fr';
export type Vars = Record<string, string | number>;
export type TFunction = (key: string, vars?: Vars) => string;

const dictionaries: Record<Language, Record<string, string>> = { en: {}, fr };

export const LANGUAGES: { id: Language; label: string; locale: string }[] = [
  { id: 'en', label: 'English', locale: 'en-US' },
  { id: 'fr', label: 'Français', locale: 'fr-FR' },
];

export function translate(lang: Language, key: string, vars?: Vars): string {
  let s = dictionaries[lang]?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const currentLanguage = (): Language => useAppStore.getState().settings.language;

/** Locale used by number/date formatting. */
export const currentLocale = (): string =>
  LANGUAGES.find((l) => l.id === currentLanguage())?.locale ?? 'en-US';

/** Translation outside React render (e.g. inside async handlers). */
export const tNow: TFunction = (key, vars) => translate(currentLanguage(), key, vars);

/** Translation hook; components re-render when the language changes. */
export function useT(): TFunction {
  const lang = useAppStore((s) => s.settings.language);
  return useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang]);
}

/** Browser preference used for first launch. */
export const detectLanguage = (): Language =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
