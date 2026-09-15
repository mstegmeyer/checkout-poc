/**
 * store-api error envelope:
 *
 *   { "errors": [ { "code", "status", "title", "detail", "source": { "pointer" }, "meta" } ] }
 *
 * This is *not* the same thing as `cart.errors`, which is an object of
 * cart-level notices inside a 200 response (see `types.ts` → `CartError`).
 */
export interface ApiErrorItem {
    code: string;
    status?: string;
    title?: string;
    detail?: string;
    source?: { pointer?: string };
    meta?: Record<string, unknown> & { parameters?: Record<string, unknown> };
}

export class ShopwareApiError extends Error {
    readonly status: number;
    readonly errors: ApiErrorItem[];
    readonly endpoint: string;

    constructor(status: number, errors: ApiErrorItem[], endpoint: string) {
        const first = errors[0];
        super(first?.detail || first?.title || first?.code || `store-api request failed (${status})`);
        this.name = 'ShopwareApiError';
        this.status = status;
        this.errors = errors;
        this.endpoint = endpoint;
    }

    /** Field violations keyed by JSON pointer, e.g. `/billingAddress/street`. */
    byPointer(): Map<string, ApiErrorItem[]> {
        const map = new Map<string, ApiErrorItem[]>();
        for (const error of this.errors) {
            const pointer = error.source?.pointer;
            if (!pointer) continue;
            const bucket = map.get(pointer);
            if (bucket) {
                bucket.push(error);
            } else {
                map.set(pointer, [error]);
            }
        }
        return map;
    }

    /** Errors without a `source.pointer` — these belong in a global alert. */
    globalErrors(): ApiErrorItem[] {
        return this.errors.filter((error) => !error.source?.pointer);
    }

    hasCode(code: string): boolean {
        return this.errors.some((error) => error.code === code || error.detail === code);
    }

    get isValidationError(): boolean {
        return this.status === 400 && this.byPointer().size > 0;
    }

    get isCartHashMismatch(): boolean {
        return this.hasCode('CHECKOUT__CART_HASH_MISMATCH');
    }

    get isNotFound(): boolean {
        return this.status === 404;
    }
}

/** Network / CORS failure — no HTTP response at all. */
export class NetworkError extends Error {
    readonly endpoint: string;

    constructor(endpoint: string, cause: unknown) {
        super(`network request to ${endpoint} failed: ${(cause as Error)?.message ?? String(cause)}`);
        this.name = 'NetworkError';
        this.endpoint = endpoint;
    }
}

/** Normalises whatever the server sent into `ApiErrorItem[]`. */
export function normalizeErrorPayload(payload: unknown, status: number): ApiErrorItem[] {
    if (payload && typeof payload === 'object' && Array.isArray((payload as { errors?: unknown }).errors)) {
        const raw = (payload as { errors: unknown[] }).errors;
        return raw.map((item) => {
            const entry = (item ?? {}) as Record<string, unknown>;
            return {
                code: String(entry.code ?? 'UNKNOWN_ERROR'),
                status: entry.status !== undefined ? String(entry.status) : String(status),
                title: entry.title as string | undefined,
                detail: entry.detail as string | undefined,
                source: entry.source as { pointer?: string } | undefined,
                meta: entry.meta as ApiErrorItem['meta'],
            };
        });
    }

    return [
        {
            code: 'UNKNOWN_ERROR',
            status: String(status),
            detail: typeof payload === 'string' && payload !== '' ? payload : undefined,
        },
    ];
}
