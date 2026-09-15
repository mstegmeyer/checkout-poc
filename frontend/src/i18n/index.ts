import { de } from '@/i18n/de';
import { en, type MessageKey, type Messages } from '@/i18n/en';

/**
 * Tiny homegrown i18n — a dictionary plus `{placeholder}` interpolation. No
 * dependency, no runtime locale loading: the bundle ships en + de.
 */

const catalogues: Record<string, Messages> = { en, de };

let active: Messages = en;
let activeLocale = 'en-GB';

export type TranslateParams = Record<string, string | number | undefined | null>;

export function setLocale(locale: string): void {
    activeLocale = locale || 'en-GB';
    const language = activeLocale.toLowerCase().split(/[-_]/)[0] ?? 'en';
    active = catalogues[language] ?? en;
}

export function getLocale(): string {
    return activeLocale;
}

export function interpolate(message: string, params?: TranslateParams): string {
    if (!params) return message;
    return message.replace(/\{(\w+)\}/g, (match, key: string) => {
        const value = params[key];
        return value === undefined || value === null ? match : String(value);
    });
}

/** Translate a known key. Unknown keys fall back to the key itself (dev aid). */
export function t(key: MessageKey, params?: TranslateParams): string {
    const message = active[key] ?? en[key] ?? key;
    return interpolate(message, params);
}

/** Translate a dynamic key that may not exist in the catalogue. */
export function tryTranslate(key: string, params?: TranslateParams): string | null {
    const message = (active as Record<string, string>)[key] ?? (en as Record<string, string>)[key];
    return message ? interpolate(message, params) : null;
}

export function useI18n() {
    return { t, tryTranslate, locale: activeLocale };
}

export type { MessageKey, Messages };
