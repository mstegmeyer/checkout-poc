import { request } from '@/api/client';
import { checkoutPaths, scoped } from '@/api/checkoutRoutes';
import type { HandlePaymentResult, Order, Subscription } from '@/api/types';

/**
 * `POST /store-api/checkout/order`.
 *
 * `hash` is the cart hash — the server rejects a changed cart with 400
 * `CHECKOUT__CART_HASH_MISMATCH`. There is no terms-of-service field: the
 * checkbox is a purely client-side gate.
 */
export function placeOrder(payload: { hash: string; customerComment?: string }): Promise<Order> {
    return request<Order>(checkoutPaths.order(), scoped({ method: 'POST', body: payload }));
}

/**
 * `POST /store-api/handle-payment` — must be called for every order, even for
 * synchronous payment methods (those simply answer `redirectUrl: null`).
 */
export function handlePayment(payload: { orderId: string; finishUrl: string; errorUrl: string }): Promise<HandlePaymentResult> {
    return request<HandlePaymentResult>('/store-api/handle-payment', { method: 'POST', body: payload });
}

/**
 * `POST /store-api/order` for one order with the subscriptions it created:
 * `initialSubscriptions` from the recurring bundles of a mixed cart, or the one
 * `subscription` of a dedicated subscription checkout. `POST /checkout/order`
 * includes neither, and a client cannot pass a criteria to that route, hence
 * the follow-up read.
 *
 * `includes` trims the response: a subscription entity otherwise ships its full
 * `convertedOrder` (the whole converted cart, addresses and all). Note that an
 * entity extension is addressed by its *own* name in the parent's include list
 * (`initialSubscriptions`, `subscription`), not via `extensions`.
 */
export async function fetchOrderSubscriptions(orderId: string): Promise<Subscription[]> {
    const subscriptionAssociations = { shippingMethod: {}, stateMachineState: {} };
    const response = await request<{ orders?: { elements?: Order[] }; elements?: Order[] }>('/store-api/order', {
        method: 'POST',
        body: {
            limit: 1,
            filter: [{ type: 'equals', field: 'id', value: orderId }],
            associations: {
                subscription: { associations: subscriptionAssociations },
                initialSubscriptions: { associations: subscriptionAssociations },
            },
            includes: {
                order: ['id', 'orderNumber', 'extensions', 'subscription', 'initialSubscriptions'],
                subscription: [
                    'id',
                    'subscriptionNumber',
                    'nextSchedule',
                    'subscriptionPlanName',
                    'subscriptionIntervalName',
                    'initialExecutionCount',
                    'remainingExecutionCount',
                    'shippingMethod',
                    'stateMachineState',
                ],
                shipping_method: ['id', 'name', 'translated'],
                state_machine_state: ['technicalName', 'name'],
            },
        },
    });

    const order = response?.orders?.elements?.[0] ?? response?.elements?.[0];
    const own = order?.extensions?.subscription;
    // The first order of a dedicated subscription is both "its" order and its
    // initial order, so the same subscription arrives through both associations.
    const seen = new Set<string>();
    return [...(own ? [own] : []), ...(order?.extensions?.initialSubscriptions ?? [])].filter((subscription) => {
        if (seen.has(subscription.id)) return false;
        seen.add(subscription.id);
        return true;
    });
}
