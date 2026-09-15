import { request } from '@/api/client';
import type { ContextUpdateResponse } from '@/api/endpoints/context';

/**
 * Commercial subscriptions — the store-api surface the checkout needs.
 *
 * The plugin keeps one *managed* context + cart per plan+interval bundle of a
 * mixed cart. Their context token is `md5(mainToken + intervalId + planId)`;
 * the client never learns or sends it. A subscription-scoped route is addressed
 * with the shopper's normal context (session or header) plus two headers naming
 * the bundle, and the server derives the managed context from that.
 */
export const SUBSCRIPTION_PLAN_HEADER = 'sw-subscription-plan';
export const SUBSCRIPTION_INTERVAL_HEADER = 'sw-subscription-interval';

export function subscriptionHeaders(planId: string, intervalId: string): Record<string, string> {
    return {
        [SUBSCRIPTION_PLAN_HEADER]: planId,
        [SUBSCRIPTION_INTERVAL_HEADER]: intervalId,
    };
}

export interface SubscriptionContextUpdate {
    /** Shipping method for the recurring deliveries of this bundle. */
    shippingMethodId: string;
}

/**
 * `PATCH /store-api/subscription/context` — patches the managed context of one
 * bundle. Only the shipping method is meaningful here: the payment method is
 * shared with the main cart (all recurring bundles must use the one recurring
 * payment method of the order), and addresses come from the customer.
 *
 * Two server-side properties shape this call (docs/subscriptions.md):
 *  - the route is the core `ContextSwitchRoute`, so it answers with the
 *    *subscription* token in `sw-context-token`. `adoptToken: false` keeps the
 *    client on the shopper's cart.
 *  - the persisted choice is inherited by the managed cart on the next
 *    calculation, so the caller re-reads the cart afterwards.
 */
export function updateSubscriptionContext(
    planId: string,
    intervalId: string,
    update: SubscriptionContextUpdate,
): Promise<ContextUpdateResponse> {
    return request<ContextUpdateResponse>('/store-api/subscription/context', {
        method: 'PATCH',
        body: update,
        headers: subscriptionHeaders(planId, intervalId),
        adoptToken: false,
    });
}
