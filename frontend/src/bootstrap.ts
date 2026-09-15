/**
 * Bootstrap configuration handed to the SPA by the Shopware app template:
 *
 *   <div id="checkout-app" data-bootstrap='{"accessKey":"SWSC…", …}'></div>
 *
 * Everything the SPA needs to talk to the store-api lives here. There is no
 * other source of configuration — no build-time env vars, no globals.
 */

export interface BootstrapConfig {
    /** `sw-access-key` of the sales channel (mandatory for every store-api call). */
    accessKey: string;
    /**
     * Optional context token. Absent (the storefront-embedded case) means
     * **session mode**: requests carry the storefront session cookie and no
     * token header at all, and the store-api resolves the context from that
     * session. This is the normal case — the app template deliberately does not
     * render a token into the page.
     *
     * When present (dev harness, non-session use) the SPA falls back to
     * **header mode** and manages the token itself, re-reading it from the
     * `sw-context-token` response header as routes rotate it.
     */
    contextToken: string;
    /** Origin (or origin + prefix) the store-api lives at. Empty string = same origin. */
    apiBase: string;
    /**
     * Absolute storefront URL, must match a sales_channel_domain URL exactly
     * (no trailing slash) — required by `POST /store-api/account/register` and
     * used to build the finish/error URLs for `handle-payment`.
     */
    storefrontUrl: string;
    /** Shop name for the header. */
    shopName: string;
    /**
     * ISO code of the active currency, e.g. `EUR` (used by Intl.NumberFormat).
     * The app template sends this as `currency`; `currencyIso` is accepted too.
     */
    currencyIso: string;
    /**
     * BCP-47 locale of the active language, e.g. `de-DE`. The app template sends
     * `locale` and an alias `language`; either is accepted.
     */
    locale: string;
    /** Storefront cart page — "back to cart" / empty-cart link. */
    cartPageUrl: string;
    /** Storefront home page — "continue shopping" link. */
    homeUrl: string;
    /**
     * Optional registration form hints mirrored from the shop configuration
     * (`core.loginRegistration.*`). Optional so the app template can grow into
     * them; sensible defaults are applied below.
     */
    registration: RegistrationConfig;
    /**
     * Commercial subscriptions, dedicated checkout: when set, the SPA runs
     * against the plugin's subscription cart of this plan + interval instead of
     * the shopper's cart (see `api/checkoutRoutes.ts`). The app template sets it
     * on the `/subscription/checkout/*` pages; absent everywhere else.
     */
    subscription: SubscriptionBundle | null;
}

export interface SubscriptionBundle {
    planId: string;
    intervalId: string;
    /**
     * Descriptive data the page knows from the subscription context. The
     * store-api exposes none of it for the dedicated cart (the cart JSON only
     * carries the ids in the line-item payload), so the app template hands it
     * over; a harness may leave it out and gets neutral labels.
     */
    planName?: string;
    intervalName?: string;
    discountPercentage?: number;
    minimumExecutionCount?: number;
    /** ISO 8601 — first delivery. */
    nextSchedule?: string;
    delayed?: boolean;
}

export interface RegistrationConfig {
    showPhoneNumber: boolean;
    phoneNumberRequired: boolean;
    requireDataProtection: boolean;
    /**
     * `core.loginRegistration.passwordMinLength` — only used when the checkout
     * has to create a customer *account* (subscriptions refuse guests).
     */
    passwordMinLength: number;
}

export class BootstrapError extends Error {
    constructor(message: string) {
        super(`[checkout-spa] ${message}`);
        this.name = 'BootstrapError';
    }
}

/**
 * Keys the app template must provide. `currency`/`currencyIso` and
 * `locale`/`language` are accepted as aliases of one another.
 */
const REQUIRED_KEYS: { target: string; sources: string[] }[] = [
    { target: 'accessKey', sources: ['accessKey'] },
    { target: 'storefrontUrl', sources: ['storefrontUrl'] },
    { target: 'shopName', sources: ['shopName'] },
    { target: 'currency', sources: ['currency', 'currencyIso'] },
    { target: 'locale', sources: ['locale', 'language'] },
];

function asBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === '1';
    if (typeof value === 'number') return value !== 0;
    return fallback;
}

function asInt(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstString(input: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = input[key];
        if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
    return null;
}

const UUID_PATTERN = /^[0-9a-f]{32}$/i;

/** Both ids or nothing — a half-declared bundle would address the wrong cart. */
function parseSubscription(value: unknown): SubscriptionBundle | null {
    if (typeof value !== 'object' || value === null) return null;
    const input = value as Record<string, unknown>;
    const planId = typeof input.planId === 'string' ? input.planId.trim().toLowerCase() : '';
    const intervalId = typeof input.intervalId === 'string' ? input.intervalId.trim().toLowerCase() : '';
    if (!UUID_PATTERN.test(planId) || !UUID_PATTERN.test(intervalId)) {
        if (planId !== '' || intervalId !== '') {
            throw new BootstrapError('data-bootstrap.subscription needs both planId and intervalId as 32-char hex ids');
        }
        return null;
    }

    const optionalString = (key: string): string | undefined => {
        const raw = input[key];
        return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
    };
    const optionalNumber = (key: string): number | undefined => {
        const raw = input[key];
        const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    return {
        planId,
        intervalId,
        planName: optionalString('planName'),
        intervalName: optionalString('intervalName'),
        discountPercentage: optionalNumber('discountPercentage'),
        minimumExecutionCount: optionalNumber('minimumExecutionCount'),
        nextSchedule: optionalString('nextSchedule'),
        delayed: typeof input.delayed === 'boolean' ? input.delayed : undefined,
    };
}

function trimUrl(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || value.trim() === '') return fallback;
    return value.trim().replace(/\/+$/, '');
}

/**
 * Parses and validates the raw `data-bootstrap` JSON. Fails loudly — a broken
 * bootstrap means every subsequent call would 403, so there is no point in
 * limping on.
 */
export function parseBootstrap(raw: string | null | undefined): BootstrapConfig {
    if (!raw || raw.trim() === '') {
        throw new BootstrapError('missing data-bootstrap attribute on #checkout-app');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (cause) {
        throw new BootstrapError(`data-bootstrap is not valid JSON: ${(cause as Error).message}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new BootstrapError('data-bootstrap must be a JSON object');
    }

    const input = parsed as Record<string, unknown>;
    const resolved: Record<string, string> = {};

    for (const { target, sources } of REQUIRED_KEYS) {
        const value = firstString(input, sources);
        if (value === null) {
            throw new BootstrapError(`data-bootstrap.${sources.join('/')} is required and must be a non-empty string`);
        }
        resolved[target] = value;
    }

    const registrationInput = (input.registration ?? {}) as Record<string, unknown>;
    const storefrontUrl = resolved.storefrontUrl!.replace(/\/+$/, '');

    const config: BootstrapConfig = {
        accessKey: resolved.accessKey!,
        contextToken: typeof input.contextToken === 'string' ? input.contextToken.trim() : '',
        apiBase: trimUrl(input.apiBase, ''),
        storefrontUrl,
        shopName: String(input.shopName),
        currencyIso: resolved.currency!.toUpperCase(),
        locale: resolved.locale!,
        cartPageUrl: trimUrl(input.cartPageUrl, `${storefrontUrl}/checkout/cart`),
        homeUrl: trimUrl(input.homeUrl, storefrontUrl),
        registration: {
            showPhoneNumber: asBool(registrationInput.showPhoneNumber, true),
            phoneNumberRequired: asBool(registrationInput.phoneNumberRequired, false),
            requireDataProtection: asBool(registrationInput.requireDataProtection, false),
            passwordMinLength: asInt(registrationInput.passwordMinLength, 8),
        },
        subscription: parseSubscription(input.subscription),
    };

    return config;
}

/** Reads the mount element and its bootstrap payload from the DOM. */
export function readBootstrapFromDom(mountSelector = '#checkout-app'): {
    element: HTMLElement;
    config: BootstrapConfig;
} {
    const element = document.querySelector<HTMLElement>(mountSelector);
    if (!element) {
        throw new BootstrapError(`mount element ${mountSelector} not found`);
    }

    return { element, config: parseBootstrap(element.getAttribute('data-bootstrap')) };
}

let current: BootstrapConfig | null = null;

/** Installs the config as the process-wide singleton (called once during boot). */
export function setBootstrap(config: BootstrapConfig): BootstrapConfig {
    current = config;
    return current;
}

/** Access the config. Throws when the SPA was not bootstrapped. */
export function useBootstrap(): BootstrapConfig {
    if (!current) {
        throw new BootstrapError('bootstrap config accessed before boot');
    }
    return current;
}
