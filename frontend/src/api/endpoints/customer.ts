import { request } from '@/api/client';
import type { ContextTokenResult, Customer, CustomerAddress, EntitySearchResult } from '@/api/types';

export interface GuestAddressPayload {
    /**
     * Only sent for the *shipping* address of a register call and for the
     * address routes — the register route overwrites `billingAddress.firstName`
     * / `lastName` with the top-level ones (RegisterRoute::validateRegistrationData).
     */
    firstName?: string;
    lastName?: string;
    street: string;
    zipcode?: string;
    city: string;
    countryId: string;
    countryStateId?: string | null;
    phoneNumber?: string;
    additionalAddressLine1?: string;
}

export interface RegisterPayload {
    email: string;
    firstName: string;
    lastName: string;
    /** Must match a sales_channel_domain URL exactly, without trailing slash. */
    storefrontUrl: string;
    billingAddress: GuestAddressPayload;
    /**
     * Optional separate delivery address. When omitted the server mirrors
     * `billingAddress` into `defaultShippingAddressId`.
     */
    shippingAddress?: GuestAddressPayload;
    acceptedDataProtection?: boolean;
    /**
     * `true` (default) registers a guest. `false` creates a real customer
     * account and requires `password` — the path subscriptions force, because
     * the commercial plugin refuses guests for recurring orders.
     */
    guest?: boolean;
    password?: string;
}

/** Historical name — the guest case of `RegisterPayload`. */
export type RegisterGuestPayload = Omit<RegisterPayload, 'guest' | 'password'>;

/**
 * `POST /store-api/account/register`.
 *
 * Guest (`guest: true`):
 * - no password, no salutationId (falls back to `not_specified`), no e-mail
 *   uniqueness constraint
 * - the context token **rotates**; the client picks the new one up from the
 *   response header and the cart follows automatically
 * - when `core.loginRegistration.doubleOptInGuestOrder` is enabled the response
 *   carries `doubleOptInRegistration: true` and *no* new token → terminal
 *   "confirm your e-mail" state
 *
 * Account (`guest: false`):
 * - `password` is validated against `core.loginRegistration.passwordMinLength`
 *   (`/password` pointer, `VIOLATION::TOO_SHORT_ERROR`)
 * - the e-mail must be unique per sales channel
 *   (`VIOLATION::CUSTOMER_EMAIL_NOT_UNIQUE` on `/email`)
 * - `core.loginRegistration.doubleOptInRegistration` behaves like the guest
 *   double opt-in above
 * - the customer is logged in afterwards; the token rotates the same way
 *
 * Common: validation errors are 400 with `source.pointer` (`/email`,
 * `/billingAddress/street`, `/shippingAddress/street`, …); the response carries
 * `defaultBillingAddressId` / `defaultShippingAddressId` (the `active*Address`
 * associations come back `null`), which is what later address updates are
 * keyed on.
 */
export function registerCustomer(payload: RegisterPayload): Promise<Customer> {
    const { guest = true, password, ...rest } = payload;
    return request<Customer>('/store-api/account/register', {
        method: 'POST',
        body: {
            acceptedDataProtection: true,
            ...rest,
            guest,
            ...(guest ? {} : { password }),
        },
    });
}

/** Guest registration — see `registerCustomer()`. */
export function registerGuest(payload: RegisterGuestPayload): Promise<Customer> {
    return registerCustomer({ ...payload, guest: true });
}

/**
 * `POST /store-api/account/login`.
 *
 * Rotates the context token (header *and* body `contextToken`) and merges the
 * anonymous cart into the customer's cart server-side. Failure codes:
 * `CHECKOUT__CUSTOMER_AUTH_BAD_CREDENTIALS` (401),
 * `CHECKOUT__CUSTOMER_OPTIN_NOT_COMPLETED`, `CHECKOUT__CUSTOMER_IS_INACTIVE`,
 * `CHECKOUT__CUSTOMER_AUTH_THROTTLED`.
 */
export function login(email: string, password: string): Promise<ContextTokenResult> {
    return request<ContextTokenResult>('/store-api/account/login', {
        method: 'POST',
        body: { username: email, password },
    });
}

export interface ProfileUpdatePayload {
    firstName: string;
    lastName: string;
}

/**
 * `POST /store-api/account/change-profile`.
 *
 * Guest-allowed: the route carries
 * `ATTRIBUTE_LOGIN_REQUIRED_ALLOW_GUEST => true`
 * (Core/Checkout/Customer/SalesChannel/ChangeCustomerProfileRoute.php).
 * `firstName` / `lastName` are `NotBlank`; `salutationId` is only validated when
 * present, so it is left alone.
 */
export function updateProfile(payload: ProfileUpdatePayload): Promise<{ success?: boolean }> {
    return request('/store-api/account/change-profile', { method: 'POST', body: payload });
}

/**
 * `POST /store-api/account/address` (create) and
 * `PATCH /store-api/account/address/{addressId}` (update).
 *
 * Both are guest-allowed (`UpsertAddressRoute`, same attribute). `firstName`,
 * `lastName`, `street`, `city` and `countryId` are `NotBlank`; `salutationId`
 * defaults to `not_specified` server-side.
 */
export function upsertAddress(payload: GuestAddressPayload, addressId?: string | null): Promise<CustomerAddress> {
    return addressId
        ? request<CustomerAddress>(`/store-api/account/address/${addressId}`, { method: 'PATCH', body: payload })
        : request<CustomerAddress>('/store-api/account/address', { method: 'POST', body: payload });
}

/** `PATCH /store-api/account/address/default-billing/{addressId}` — guest-allowed, 204. */
export function setDefaultBillingAddress(addressId: string): Promise<void> {
    return request<void>(`/store-api/account/address/default-billing/${addressId}`, { method: 'PATCH' });
}

/** `PATCH /store-api/account/address/default-shipping/{addressId}` — guest-allowed, 204. */
export function setDefaultShippingAddress(addressId: string): Promise<void> {
    return request<void>(`/store-api/account/address/default-shipping/${addressId}`, { method: 'PATCH' });
}

/**
 * `POST /store-api/account/list-address` — guest-allowed (`ListAddressRoute`).
 * Fallback for the rare case where a register response carried no address ids.
 */
export async function listAddresses(): Promise<CustomerAddress[]> {
    const response = await request<EntitySearchResult<CustomerAddress>>('/store-api/account/list-address', {
        method: 'POST',
        body: { limit: 10 },
    });
    return response?.elements ?? [];
}
