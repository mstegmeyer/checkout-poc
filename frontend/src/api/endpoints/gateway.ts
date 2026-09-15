import { request } from '@/api/client';
import type { CartError, GatewayResponse } from '@/api/types';

export interface CheckoutGateway {
    payments: GatewayResponse['payments'];
    shipments: GatewayResponse['shipments'];
    /** Always normalised to a keyed object, whatever PHP serialised. */
    errors: Record<string, CartError>;
}

/**
 * `GET /store-api/checkout/gateway` — the single source for available payment
 * and shipping methods. `onlyAvailable` is forced server-side, so there are no
 * parameters.
 *
 * `payment-method-blocked` / `shipping-method-blocked` entries with
 * `block: true` mean the currently selected method cannot be used; placing the
 * order would fail with `CHECKOUT__CART_INVALID`.
 */
export async function fetchGateway(): Promise<CheckoutGateway> {
    const response = await request<GatewayResponse>('/store-api/checkout/gateway');

    return {
        payments: Array.isArray(response.payments) ? response.payments : [],
        shipments: Array.isArray(response.shipments) ? response.shipments : [],
        errors: normalizeCollection(response.errors),
    };
}

/**
 * PHP `ErrorCollection`s serialise as `[]` while empty and as a keyed object
 * once filled — accept both shapes.
 */
export function normalizeCollection(errors: Record<string, CartError> | CartError[] | null | undefined): Record<string, CartError> {
    if (!errors) return {};

    if (Array.isArray(errors)) {
        const result: Record<string, CartError> = {};
        errors.forEach((error, index) => {
            result[error.key ?? `error-${index}`] = error;
        });
        return result;
    }

    return errors;
}
