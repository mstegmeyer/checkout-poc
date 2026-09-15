import { useBootstrap } from '@/bootstrap';
import { NetworkError, normalizeErrorPayload, ShopwareApiError } from '@/api/errors';

/**
 * The only place in the SPA that knows about `sw-access-key`,
 * `sw-context-source` and `sw-context-token`.
 *
 * Two modes, decided once at boot by whether the bootstrap carried a token:
 *
 * **Session mode** (the storefront-embedded case, no bootstrap token). Requests
 * carry the storefront session cookie and *declare* the session as their context
 * source with `sw-context-source: session` (shopware/shopware#19634). The
 * store-api then resolves the context from that session and writes token
 * rotations back into it, so the session — not this client — is the single
 * source of truth.
 *
 * Three consequences of that contract, all load-bearing:
 *  - the declaration is explicit. Merely omitting the token is not enough; a
 *    request without the header gets a fresh, empty context.
 *  - `sw-context-source` and `sw-context-token` are mutually exclusive. Sending
 *    both fails the request with `FRAMEWORK__ROUTING_SESSION_CONTEXT_NOT_RESOLVABLE`.
 *  - it fails closed. An unusable session (no cookie, cross-site fetch, feature
 *    disabled) is a 400, not a silent fallback — which a session based client
 *    would otherwise only notice as an inexplicably empty cart.
 *
 * Such clients are never handed a token, so response tokens are ignored here.
 *
 * **Header mode** (dev harness / non-session use, bootstrap token present). The
 * classic behaviour: the token travels in the header and is re-read from *every*
 * response — success or failure — because guest registration rotates it.
 *
 * One exception to "every response", and it is load-bearing: the commercial
 * subscription routes (`/store-api/subscription/*`) answer with the token of the
 * *subscription* context they operated on — a context derived per plan+interval
 * bundle, not the shopper's cart — in the very same `sw-context-token` header.
 * A client that adopts it is silently moved into that bubble and reads a
 * different cart from then on (verified, see docs/subscriptions.md). Callers of
 * those routes pass `adoptToken: false`. Session mode is immune: the store-api
 * strips the header for session-sourced clients anyway.
 */

/** Declares where the store-api should take the context from. */
const CONTEXT_SOURCE_HEADER = 'sw-context-source';
const CONTEXT_SOURCE_SESSION = 'session';

export type TokenSink = (token: string) => void;

let tokenSink: TokenSink | null = null;
let currentToken = '';
/** True when the client manages a token itself; false when the session owns it. */
let headerMode = false;

/**
 * Wires the client to the session store (called once during boot).
 *
 * `useHeaderMode` is explicit rather than derived from `initialToken`, because
 * the Node e2e harness runs in header mode while starting out without a token —
 * it mints one on its first call.
 */
export function connectTokenSink(sink: TokenSink, initialToken: string, useHeaderMode: boolean): void {
    tokenSink = sink;
    currentToken = initialToken ?? '';
    headerMode = useHeaderMode;
}

export function getContextToken(): string {
    return currentToken;
}

/** False when the storefront session owns the context token. */
export function isHeaderMode(): boolean {
    return headerMode;
}

function adoptToken(token: string | null): void {
    if (!headerMode) return;
    if (!token || token === currentToken) return;
    currentToken = token;
    tokenSink?.(token);
}

export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    /** Extra headers; never used for the two managed auth headers. */
    headers?: Record<string, string>;
    signal?: AbortSignal;
    /**
     * Whether a `sw-context-token` response header may replace the client's
     * token (header mode only). Defaults to true; `false` is reserved for routes
     * that answer with a token of a *different* context, see the header comment.
     */
    adoptToken?: boolean;
}

function buildUrl(path: string): string {
    const { apiBase } = useBootstrap();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${apiBase}${normalized}`;
}

/**
 * Typed store-api request. Throws `ShopwareApiError` for any non-2xx response
 * and `NetworkError` when the request never reached the server.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { accessKey } = useBootstrap();
    const url = buildUrl(path);
    const method = options.method ?? 'GET';

    const headers: Record<string, string> = {
        Accept: 'application/json',
        'sw-access-key': accessKey,
        ...options.headers,
    };

    if (headerMode) {
        // Never send an empty token: the harness mints one on its first call.
        if (currentToken) headers['sw-context-token'] = currentToken;
    } else {
        headers[CONTEXT_SOURCE_HEADER] = CONTEXT_SOURCE_SESSION;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
    } else if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
        // Several store-api routes (cart read, country search, …) are POSTs that
        // expect a JSON body — send an empty object rather than nothing.
        headers['Content-Type'] = 'application/json';
        body = '{}';
    }

    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers,
            body,
            // Same-origin only: this is what carries the storefront session
            // cookie that session mode resolves the context from. Cross-origin
            // deployments stay cookie-less and must use header mode.
            credentials: 'same-origin',
            signal: options.signal,
        });
    } catch (cause) {
        throw new NetworkError(`${method} ${path}`, cause);
    }

    // Token first: even error responses can carry a rotated token. A no-op in
    // session mode, where the store-api deliberately hands out no token at all.
    if (options.adoptToken !== false) {
        adoptToken(response.headers.get('sw-context-token'));
    }

    const raw = await response.text();
    let payload: unknown = null;
    if (raw !== '') {
        try {
            payload = JSON.parse(raw);
        } catch {
            payload = raw;
        }
    }

    if (!response.ok) {
        throw new ShopwareApiError(response.status, normalizeErrorPayload(payload, response.status), `${method} ${path}`);
    }

    return payload as T;
}
