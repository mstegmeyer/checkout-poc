import { useBootstrap } from '@/bootstrap';
import { getLocale } from '@/i18n';

/**
 * Currency formatting via `Intl.NumberFormat`. Prices themselves always come
 * from the server — this only formats them.
 */
export function useMoney() {
    const { currencyIso } = useBootstrap();
    const locale = getLocale();

    const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyIso,
    });

    const format = (value: number | null | undefined): string => formatter.format(value ?? 0);

    /** Discounts arrive as negative numbers; render them with an explicit sign. */
    const formatSigned = (value: number | null | undefined): string => {
        const amount = value ?? 0;
        return amount > 0 ? `+${formatter.format(amount)}` : formatter.format(amount);
    };

    const formatDate = (iso: string | undefined): string => {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(date);
    };

    /** Full date for sentences ("next delivery on 16 September 2026"). */
    const formatLongDate = (iso: string | undefined): string => {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    };

    /** Same calendar day as now, in the shopper's local time zone. */
    const isToday = (iso: string | undefined): boolean => {
        if (!iso) return false;
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return false;
        const now = new Date();
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    };

    return { format, formatSigned, formatDate, formatLongDate, isToday, currencyIso, locale };
}
