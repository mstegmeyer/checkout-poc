/**
 * Types for the slice of the store-api the checkout touches. These mirror the
 * *verified* responses of Shopware 6.6/6.7 — only fields the SPA actually reads
 * are typed; everything else stays out of the way.
 */

export interface CalculatedTax {
    tax: number;
    taxRate: number;
    price: number;
}

export interface CalculatedPrice {
    unitPrice: number;
    quantity: number;
    totalPrice: number;
    calculatedTaxes: CalculatedTax[];
    referencePrice?: { price: number; purchaseUnit: number; unitName: string } | null;
    listPrice?: { price: number; discount: number; percentage: number } | null;
}

export interface CartPrice {
    netPrice: number;
    totalPrice: number;
    positionPrice: number;
    rawTotal: number;
    taxStatus: 'gross' | 'net' | 'tax-free' | string;
    calculatedTaxes: CalculatedTax[];
}

export interface Media {
    id?: string;
    url?: string;
    alt?: string | null;
    thumbnails?: { url: string; width: number; height: number }[];
}

export interface LineItem {
    id: string;
    referencedId?: string | null;
    label: string | null;
    quantity: number;
    type: string;
    good?: boolean;
    removable?: boolean;
    stackable?: boolean;
    description?: string | null;
    price: CalculatedPrice;
    cover?: Media | null;
    payload?: Record<string, unknown> & {
        code?: string;
        productNumber?: string;
        options?: { group: string; option: string }[];
        /**
         * Commercial subscriptions: a product bought as a subscription carries
         * the plan and interval it was added with. Line items sharing both ids
         * form one recurring bundle (see `Cart.extensions.subscriptionManagedCarts`).
         */
        subscriptionPlan?: string;
        subscriptionInterval?: string;
    };
    children?: LineItem[];
}

export interface DeliveryDate {
    earliest: string;
    latest: string;
}

export interface CartDelivery {
    shippingCosts: CalculatedPrice;
    deliveryDate?: DeliveryDate;
    shippingMethod?: ShippingMethod;
}

/**
 * In-cart notice, delivered *inside a 200 response* as an object keyed by the
 * error key: `{"shipping-method-blocked-Standard": {message, block, level, …}}`.
 * Level 0 = notice, 10 = warning, 20 = error.
 */
export interface CartError {
    key?: string;
    code?: number | string;
    message?: string;
    messageKey?: string;
    level?: number;
    block?: boolean;
    blockResubmit?: boolean;
    parameters?: Record<string, unknown>;
}

// ------------------------------------------------------------ subscriptions --

/** `subscription_plan` as serialised by the store-api (ApiAware fields only). */
export interface SubscriptionPlan {
    id: string;
    name: string;
    /** Storefront label — shown instead of the name when `activeStorefrontLabel` is set. */
    label?: string | null;
    activeStorefrontLabel?: boolean;
    discountPercentage: number;
    minimumExecutionCount?: number | null;
    translated?: { name?: string; label?: string | null; description?: string | null };
}

/** `subscription_interval` as serialised by the store-api. */
export interface SubscriptionInterval {
    id: string;
    name: string;
    /** ISO 8601 duration, e.g. `P0Y0M7DT0H0M0S`. */
    dateInterval?: string;
    cronInterval?: string;
    /**
     * Runtime flag: an interval bound to a cron expression (e.g. "every first
     * of the month") does not deliver today. Such intervals are refused in
     * mixed carts (`subscription-interval-blocked`).
     */
    delayed?: boolean;
    translated?: { name?: string };
}

/**
 * The commercial plugin's `SubscriptionContextStruct`, found on a managed cart
 * (`extensions.subscription`) and on a managed context. The two tokens are the
 * context tokens the plugin derives per plan+interval bundle — the SPA never
 * sends them anywhere (see docs/subscriptions.md).
 */
export interface SubscriptionContext {
    mainToken?: string;
    subscriptionToken?: string;
    managed: boolean;
    /** First (today) respectively next delivery of the bundle. */
    nextSchedule: string;
    interval: SubscriptionInterval;
    plan: SubscriptionPlan;
}

export interface CartExtensions {
    /**
     * Commercial subscriptions with mixed carts enabled: every plan+interval
     * bundle in the cart is calculated as its own *managed* cart, keyed
     * `<planId>-<intervalId>`. Each entry is a full cart (items, deliveries,
     * errors, price) describing one recurring delivery.
     */
    subscriptionManagedCarts?: { elements?: Record<string, ManagedCart> };
    /**
     * Dedicated subscription checkout: the cart *is* the subscription and
     * carries its plan/interval context directly.
     */
    subscription?: SubscriptionContext;
    [key: string]: unknown;
}

export interface Cart {
    token: string;
    price: CartPrice;
    lineItems: LineItem[];
    deliveries: CartDelivery[];
    transactions?: { paymentMethodId: string; amount: CalculatedPrice }[];
    /** Pass to `POST /store-api/checkout/order` — guards against a changed cart. */
    hash: string;
    errors: Record<string, CartError>;
    modified?: boolean;
    customerComment?: string | null;
    extensions?: CartExtensions;
}

/** One recurring bundle of a mixed cart. */
export interface ManagedCart extends Cart {
    extensions?: CartExtensions & { subscription?: SubscriptionContext };
}

/** `subscription` entity — the slice the success view shows. */
export interface Subscription {
    id: string;
    subscriptionNumber: string;
    nextSchedule: string;
    subscriptionPlanName: string;
    subscriptionIntervalName: string;
    initialExecutionCount?: number;
    remainingExecutionCount?: number;
    shippingMethod?: ShippingMethod | null;
    stateMachineState?: { technicalName: string; name?: string } | null;
}

// ------------------------------------------------------------------ methods --

export interface DeliveryTime {
    id: string;
    name: string;
    min?: number;
    max?: number;
    unit?: string;
}

export interface ShippingMethod {
    id: string;
    name: string;
    description?: string | null;
    position?: number;
    deliveryTime?: DeliveryTime | null;
    media?: Media | null;
    translated?: { name?: string; description?: string };
}

export interface PaymentMethod {
    id: string;
    name: string;
    description?: string | null;
    position?: number;
    shortName?: string;
    distinguishableName?: string | null;
    media?: Media | null;
    translated?: { name?: string; description?: string; distinguishableName?: string };
}

/**
 * `GET /store-api/checkout/gateway`.
 *
 * Careful: `errors` is an ErrorCollection which PHP serialises as `[]` when
 * empty and as a keyed object once it contains entries.
 */
export interface GatewayResponse {
    payments: PaymentMethod[];
    shipments: ShippingMethod[];
    errors: Record<string, CartError> | CartError[];
}

/** One entry of `POST /store-api/shipping-cost/cart` (6.7+ only). */
export interface ShippingCostEntry {
    shippingCost: CalculatedPrice;
    deliveryDate?: DeliveryDate;
    shippingMethod: ShippingMethod;
}

export interface CountryState {
    id: string;
    name: string;
    shortCode?: string;
    position?: number;
}

export interface Country {
    id: string;
    name: string;
    iso?: string;
    iso3?: string;
    position?: number;
    postalCodeRequired?: boolean;
    forceStateInRegistration?: boolean;
    shippingAvailable?: boolean;
    translated?: { name?: string };
}

/**
 * A managed sales channel context (one per recurring bundle) as found in
 * `SalesChannelContext.extensions.subscriptionManagedContexts`. Only the parts
 * the SPA reads are typed.
 */
export interface ManagedSalesChannelContext {
    token?: string;
    shippingMethod?: ShippingMethod | null;
    paymentMethod?: PaymentMethod | null;
    extensions?: { subscription?: SubscriptionContext };
}

export interface SalesChannelContext {
    token: string;
    currency: { id: string; isoCode: string; symbol: string };
    salesChannel: { id: string; name: string };
    customer: Customer | null;
    paymentMethod: PaymentMethod | null;
    shippingMethod: ShippingMethod | null;
    shippingLocation?: { country?: Country; address?: unknown };
    languageInfo?: { localeCode?: string; name?: string };
    extensions?: {
        subscriptionManagedContexts?: { elements?: Record<string, ManagedSalesChannelContext> };
        [key: string]: unknown;
    };
}

export interface CustomerAddress {
    id?: string;
    firstName?: string;
    lastName?: string;
    street?: string;
    zipcode?: string | null;
    city?: string;
    phoneNumber?: string | null;
    additionalAddressLine1?: string | null;
    countryId?: string;
    countryStateId?: string | null;
}

export interface Customer {
    id: string;
    guest: boolean;
    email: string;
    firstName: string;
    lastName: string;
    customerNumber?: string;
    /** Only present when double-opt-in guest orders are switched on. */
    doubleOptInRegistration?: boolean;
    /**
     * Present on the register response (the `active*Address` associations are
     * `null` there) — the handle the guest address updates are keyed on.
     */
    defaultBillingAddressId?: string | null;
    defaultShippingAddressId?: string | null;
    activeBillingAddress?: CustomerAddress | null;
    activeShippingAddress?: CustomerAddress | null;
}

export interface OrderLineItem {
    id: string;
    label: string;
    quantity: number;
    type: string;
    totalPrice: number;
}

export interface Order {
    id: string;
    orderNumber: string;
    amountTotal: number;
    amountNet: number;
    shippingTotal: number;
    orderDateTime: string;
    price?: CartPrice;
    currency?: { isoCode: string };
    lineItems?: OrderLineItem[];
    deliveries?: unknown[];
    transactions?: { id: string; paymentMethodId: string; stateMachineState?: { technicalName: string } }[];
    stateMachineState?: { technicalName: string; name: string };
    orderCustomer?: { email: string; firstName: string; lastName: string };
    deepLinkCode?: string;
    extensions?: {
        /**
         * Subscriptions created from a mixed cart. Not part of the
         * `POST /checkout/order` response — needs a `POST /store-api/order` read
         * with the association (see `api/endpoints/order.ts`).
         */
        initialSubscriptions?: Subscription[];
        /** The subscription an order of the dedicated subscription checkout belongs to. */
        subscription?: Subscription | null;
        [key: string]: unknown;
    };
}

export interface HandlePaymentResult {
    /** `null` for synchronous payment handlers — the order is done. */
    redirectUrl: string | null;
}

/** `POST /store-api/account/login`. The header carries the same token. */
export interface ContextTokenResult {
    contextToken: string;
}

/** Generic criteria payload for the DAL-backed store-api search routes. */
export interface Criteria {
    limit?: number;
    page?: number;
    ids?: string[];
    filter?: unknown[];
    sort?: { field: string; order: 'ASC' | 'DESC'; naturalSorting?: boolean }[];
    associations?: Record<string, unknown>;
    includes?: Record<string, string[]>;
    'total-count-mode'?: number;
}

export interface EntitySearchResult<T> {
    elements: T[];
    total?: number;
    aggregations?: Record<string, unknown>;
}
