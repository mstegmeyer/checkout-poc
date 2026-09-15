import { request } from '@/api/client';
import type { CalculatedPrice, DeliveryDate, EntitySearchResult, ShippingCostEntry } from '@/api/types';

export interface ShippingCostInfo {
    price: CalculatedPrice;
    deliveryDate?: DeliveryDate;
}

/** Shipping cost + delivery date per shipping method id. */
export type ShippingCostMap = Record<string, ShippingCostInfo>;

/**
 * `POST /store-api/shipping-cost/cart` — per-method shipping costs and delivery
 * dates *without* switching the context. The route recalculates the cart per
 * method, so it is called once per step-1 entry (and after cart mutations), not
 * per render.
 *
 * The response is a collection, i.e. a plain JSON array of
 * `{shippingCost, deliveryDate, shippingMethod}`.
 */
export async function fetchShippingCosts(shippingMethodIds?: string[]): Promise<ShippingCostMap> {
    const body = shippingMethodIds?.length ? { availableShippingMethodIds: shippingMethodIds } : {};
    const response = await request<ShippingCostEntry[] | EntitySearchResult<ShippingCostEntry>>(
        '/store-api/shipping-cost/cart',
        { method: 'POST', body },
    );

    const entries = Array.isArray(response) ? response : (response?.elements ?? []);
    const map: ShippingCostMap = {};
    for (const entry of entries) {
        const id = entry?.shippingMethod?.id;
        if (!id || !entry.shippingCost) continue;
        map[id] = { price: entry.shippingCost, deliveryDate: entry.deliveryDate };
    }
    return map;
}
