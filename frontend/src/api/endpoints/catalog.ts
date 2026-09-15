import { request } from '@/api/client';
import type { Country, CountryState, EntitySearchResult } from '@/api/types';

/**
 * store-api criteria are capped at `MAX_LIMIT = 100` (a 6.7 hard limit — a
 * bigger limit answers 400 `FRAMEWORK__QUERY_LIMIT_EXCEEDED` on `/limit`), so
 * country lists have to be paged.
 */
const MAX_LIMIT = 100;
const MAX_PAGES = 5;

/**
 * `POST /store-api/country` — only countries available for shipping, ordered
 * the way the storefront orders them (position, then name).
 */
export async function fetchCountries(): Promise<Country[]> {
    const countries: Country[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await request<EntitySearchResult<Country>>('/store-api/country', {
            method: 'POST',
            body: {
                limit: MAX_LIMIT,
                page,
                sort: [
                    { field: 'position', order: 'ASC' },
                    { field: 'name', order: 'ASC' },
                ],
                filter: [{ type: 'equals', field: 'shippingAvailable', value: true }],
                includes: {
                    country: ['id', 'name', 'iso', 'iso3', 'position', 'postalCodeRequired', 'forceStateInRegistration'],
                },
            },
        });

        const elements = response?.elements ?? [];
        countries.push(...elements);

        if (elements.length < MAX_LIMIT) break;
    }

    return countries;
}

/**
 * `GET /store-api/country-state/{countryId}` — only needed when the country has
 * `forceStateInRegistration: true` (a client-side rule; the server never
 * requires a state for guests).
 */
export async function fetchCountryStates(countryId: string): Promise<CountryState[]> {
    const response = await request<EntitySearchResult<CountryState>>(`/store-api/country-state/${countryId}`, {
        method: 'POST',
        body: {
            limit: MAX_LIMIT,
            sort: [
                { field: 'position', order: 'ASC' },
                { field: 'name', order: 'ASC' },
            ],
            includes: { country_state: ['id', 'name', 'shortCode', 'position'] },
        },
    });

    return response?.elements ?? [];
}

export interface SellableProduct {
    id: string;
    name: string | null;
    productNumber: string;
}

/**
 * `POST /store-api/product` — not part of the checkout flow, but the e2e script
 * needs a sellable product (simple product, in stock, no variants).
 */
export async function findSellableProducts(limit = 3): Promise<SellableProduct[]> {
    const response = await request<EntitySearchResult<SellableProduct>>('/store-api/product', {
        method: 'POST',
        body: {
            limit,
            filter: [
                { type: 'equals', field: 'active', value: true },
                { type: 'equals', field: 'childCount', value: 0 },
                { type: 'equals', field: 'parentId', value: null },
                { type: 'range', field: 'availableStock', parameters: { gt: 5 } },
            ],
            includes: { product: ['id', 'name', 'productNumber'] },
        },
    });

    return response?.elements ?? [];
}
