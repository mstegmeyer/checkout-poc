import type { RequestOptions } from '@/api/client';
import { subscriptionHeaders } from '@/api/endpoints/subscription';
import { useBootstrap } from '@/bootstrap';

/**
 * Which cart the checkout runs against.
 *
 * - `cart`: the shopper's cart (`/store-api/checkout/*`). Recurring bundles in
 *   it are the plugin's *mixed cart* mode and need nothing special here.
 * - `subscription`: the commercial plugin's dedicated subscription checkout
 *   ("bubble"). The shopper's cart stays untouched; the checkout runs against a
 *   second cart the plugin keeps per plan + interval. Its store-api routes are
 *   twins under `/store-api/subscription/*`, addressed with the shopper's own
 *   context plus the two bundle headers — the client never sees the bundle's
 *   derived token (docs/subscriptions.md).
 */
export type CheckoutMode = 'cart' | 'subscription';

export function checkoutMode(): CheckoutMode {
    return useBootstrap().subscription ? 'subscription' : 'cart';
}

export function isSubscriptionMode(): boolean {
    return checkoutMode() === 'subscription';
}

/** Store-api paths of the cart the checkout operates on. */
export const checkoutPaths = {
    cart: (): string => (isSubscriptionMode() ? '/store-api/subscription/checkout/cart' : '/store-api/checkout/cart'),
    lineItem: (): string =>
        isSubscriptionMode() ? '/store-api/subscription/checkout/cart/line-item' : '/store-api/checkout/cart/line-item',
    context: (): string => (isSubscriptionMode() ? '/store-api/subscription/context' : '/store-api/context'),
    order: (): string => (isSubscriptionMode() ? '/store-api/subscription/checkout/order' : '/store-api/checkout/order'),
};

/**
 * Request options for a route that has a subscription twin: in subscription
 * mode the bundle headers are added and the response token is ignored (the
 * twin routes answer with the bundle's token, see `api/client.ts`). In cart
 * mode the options pass through unchanged.
 */
export function scoped(options: RequestOptions = {}): RequestOptions {
    const bundle = useBootstrap().subscription;
    if (!bundle) return options;
    return {
        ...options,
        headers: { ...options.headers, ...subscriptionHeaders(bundle.planId, bundle.intervalId) },
        adoptToken: false,
    };
}
