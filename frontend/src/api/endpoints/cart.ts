import { request } from '@/api/client';
import { checkoutPaths, isSubscriptionMode, scoped } from '@/api/checkoutRoutes';
import type { Cart } from '@/api/types';

/**
 * `POST /store-api/checkout/cart` — reads (and recalculates) the current cart.
 * In the dedicated subscription checkout this is the `/store-api/subscription`
 * twin, i.e. the subscription cart (`api/checkoutRoutes.ts`).
 */
export function fetchCart(): Promise<Cart> {
    return request<Cart>(checkoutPaths.cart(), scoped({ method: 'POST' }));
}

export interface AddLineItemPayload {
    /**
     * Optional client id. The storefront sends `id = referencedId` for products;
     * the subscription line-item factory then derives a stable id from
     * product + plan + interval so the same product can sit in the cart once
     * per bundle. Without it the server mints a random id.
     */
    id?: string;
    type: 'product' | 'promotion' | string;
    referencedId: string;
    quantity?: number;
    /**
     * Commercial subscriptions (mixed carts): add the product as a recurring
     * item of this plan + interval. Both or neither. The checkout itself never
     * adds products — this exists for the e2e harness.
     */
    subscriptionPlan?: string;
    subscriptionInterval?: string;
}

/**
 * `POST /store-api/checkout/cart/line-item`.
 *
 * Returns 200 even when nothing was added (unknown promotion code, parent
 * product of a variant set) — inspect `cart.errors` afterwards.
 */
export function addLineItems(items: AddLineItemPayload[]): Promise<Cart> {
    return request<Cart>(checkoutPaths.lineItem(), scoped({ method: 'POST', body: { items } }));
}

/** Convenience wrapper for promotion codes. */
export function addPromotionCode(code: string): Promise<Cart> {
    return addLineItems([{ type: 'promotion', referencedId: code }]);
}

/**
 * `POST /store-api/checkout/cart/line-item/delete` — also used to drop
 * promotions. The subscription twin only registers the `DELETE` verb on the
 * line-item path (no `/delete` alias), hence the two shapes.
 */
export function removeLineItems(ids: string[]): Promise<Cart> {
    if (isSubscriptionMode()) {
        return request<Cart>(checkoutPaths.lineItem(), scoped({ method: 'DELETE', body: { ids } }));
    }
    return request<Cart>('/store-api/checkout/cart/line-item/delete', { method: 'POST', body: { ids } });
}
