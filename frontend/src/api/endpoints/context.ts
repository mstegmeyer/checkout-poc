import { request } from '@/api/client';
import { checkoutPaths, scoped } from '@/api/checkoutRoutes';
import type { SalesChannelContext } from '@/api/types';

/** `GET /store-api/context` — mints a context token when none was supplied. */
export function fetchContext(): Promise<SalesChannelContext> {
    return request<SalesChannelContext>('/store-api/context');
}

/**
 * `PATCH /store-api/context`.
 *
 * Allowed for guests: `shippingMethodId`, `paymentMethodId`, `countryId`,
 * `countryStateId`, `languageId`, `currencyId`. Address *ids* are not (the
 * addresses do not exist yet). Always refetch cart + gateway afterwards.
 *
 * In the dedicated subscription checkout this patches the *subscription*
 * context (`/store-api/subscription/context`) — the one the subscription cart
 * is calculated with. `GET /store-api/context` has no such twin, so selections
 * are read back from the cart there (`stores/checkout.ts`).
 */
export interface ContextUpdate {
    shippingMethodId?: string;
    paymentMethodId?: string;
    countryId?: string;
    countryStateId?: string | null;
    languageId?: string;
    currencyId?: string;
}

export interface ContextUpdateResponse {
    redirectUrl: string | null;
}

export function updateContext(update: ContextUpdate): Promise<ContextUpdateResponse> {
    return request<ContextUpdateResponse>(checkoutPaths.context(), scoped({ method: 'PATCH', body: update }));
}
