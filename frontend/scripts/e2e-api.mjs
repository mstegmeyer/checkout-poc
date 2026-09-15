#!/usr/bin/env node
/**
 * End-to-end test of the checkout against a *live* Shopware store-api.
 *
 * It imports the compiled SPA code (`.e2e-build/e2e-entry.mjs`, produced by
 * `npm run e2e:build`) and drives the real Pinia stores — client, endpoints,
 * token handling, auto-selection and the order flow are the production ones.
 *
 * Usage:
 *   SW_ACCESS_KEY=SWSC… [SW_API_BASE=http://localhost:8000] \
 *   [SW_STOREFRONT_URL=http://localhost:8000] npm run e2e
 *
 * Commercial subscriptions (mixed carts) are covered when the shop has them and
 * the bundle is named explicitly — the store-api does not expose which plans a
 * product offers (see docs/subscriptions.md):
 *   SW_SUBSCRIPTION_PRODUCT_ID=… SW_SUBSCRIPTION_PLAN_ID=… SW_SUBSCRIPTION_INTERVAL_ID=…
 *
 * Requires Node 22 (global fetch). No secrets are stored in the repo — the
 * access key comes from the environment.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const BUILD = fileURLToPath(new URL('../.e2e-build/e2e-entry.mjs', import.meta.url));

const ACCESS_KEY = process.env.SW_ACCESS_KEY ?? '';
const API_BASE = (process.env.SW_API_BASE ?? 'http://localhost:8000').replace(/\/+$/, '');
const STOREFRONT_URL = (process.env.SW_STOREFRONT_URL ?? API_BASE).replace(/\/+$/, '');
const COUNTRY_ISO = process.env.SW_COUNTRY_ISO ?? 'DE';
const SUBSCRIPTION = {
    productId: process.env.SW_SUBSCRIPTION_PRODUCT_ID ?? '',
    planId: process.env.SW_SUBSCRIPTION_PLAN_ID ?? '',
    intervalId: process.env.SW_SUBSCRIPTION_INTERVAL_ID ?? '',
};
const SUBSCRIPTIONS_CONFIGURED = Boolean(SUBSCRIPTION.productId && SUBSCRIPTION.planId && SUBSCRIPTION.intervalId);

let failures = 0;
let stepNumber = 0;
/** Order number of the separate-billing-address scenario (step 12). */
let billingOrderNumber = null;
/** Order + subscription number of the subscription scenario (step 13). */
let subscriptionResult = null;
/** Order + subscription number of the dedicated subscription checkout scenario. */
let bubbleResult = null;

function step(title) {
    stepNumber += 1;
    console.log(`\n── ${stepNumber}. ${title}`);
}

function info(message) {
    console.log(`   ${message}`);
}

function check(label, condition, detail = '') {
    if (condition) {
        console.log(`   ✓ ${label}${detail ? ` — ${detail}` : ''}`);
        return true;
    }
    failures += 1;
    console.log(`   ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    return false;
}

function fatal(message) {
    console.error(`\n✗ ${message}`);
    process.exit(1);
}

if (!ACCESS_KEY) {
    fatal('SW_ACCESS_KEY is not set. Get it with `bin/console sales-channel:list`.');
}
if (!existsSync(BUILD)) {
    fatal(`missing ${BUILD} — run \`npm run e2e:build\` first (or use \`npm run e2e\`).`);
}

const { createHeadlessCheckout, ShopwareApiError } = await import(BUILD);

/**
 * Records the store-api call sequence. This is how the "no duplicate customer"
 * guarantee is proven: re-entering step 1 must never issue a second
 * `POST /store-api/account/register`.
 */
const apiCalls = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    apiCalls.push(`${(init.method ?? 'GET').toUpperCase()} ${url.replace(API_BASE, '')}`);
    return nativeFetch(input, init);
};

const countCalls = (pattern) => apiCalls.filter((entry) => pattern.test(entry)).length;
const REGISTER_CALL = /^POST \/store-api\/account\/register$/;
const ADDRESS_PATCH = /^PATCH \/store-api\/account\/address\//;
const ADDRESS_CREATE = /^POST \/store-api\/account\/address$/;
const PROFILE_CALL = /^POST \/store-api\/account\/change-profile$/;

/** Raw store-api read with the *current* context token (assertions only). */
async function rawApi(path, body, token) {
    const response = await nativeFetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'sw-access-key': ACCESS_KEY,
            'sw-context-token': token,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
}

/**
 * Documents the state of `POST /store-api/shipping-cost/cart` on the target
 * instance without touching the checkout's own cart: mints a separate context,
 * puts a product in it, calls the route and re-reads the cart.
 *
 * On shopware/platform trunk (6.7-dev, 2026-08-18) this either 500s (when the
 * cart carries a `shipping-method-blocked` error — an uncloneable Error struct)
 * or returns 200 and empties the persisted cart. Hence the preview is switched
 * off in `stores/checkout.ts`.
 */
async function diagnoseShippingCostRoute(productId) {
    const headers = { 'sw-access-key': ACCESS_KEY, 'Content-Type': 'application/json', Accept: 'application/json' };

    const contextResponse = await fetch(`${API_BASE}/store-api/context`, { headers });
    const token = contextResponse.headers.get('sw-context-token');
    const authed = { ...headers, 'sw-context-token': token };

    await fetch(`${API_BASE}/store-api/checkout/cart/line-item`, {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({ items: [{ type: 'product', referencedId: productId, quantity: 1 }] }),
    });

    const before = await (await fetch(`${API_BASE}/store-api/checkout/cart`, { method: 'POST', headers: authed, body: '{}' })).json();

    const shippingCostResponse = await fetch(`${API_BASE}/store-api/shipping-cost/cart`, {
        method: 'POST',
        headers: authed,
        body: '{}',
    });
    const shippingCostBody = await shippingCostResponse.json();

    const after = await (await fetch(`${API_BASE}/store-api/checkout/cart`, { method: 'POST', headers: authed, body: '{}' })).json();

    info(`route status ${shippingCostResponse.status}`);
    if (shippingCostResponse.status !== 200) {
        info(`route error: ${shippingCostBody?.errors?.[0]?.detail ?? 'unknown'}`);
    } else {
        info(`entries: ${Array.isArray(shippingCostBody) ? shippingCostBody.length : 'unexpected shape'}`);
    }
    info(`cart line items before ${before.lineItems?.length ?? 0} → after ${after.lineItems?.length ?? 0}`);

    const healthy = shippingCostResponse.status === 200 && (after.lineItems?.length ?? 0) === (before.lineItems?.length ?? 0);
    check(
        'shipping-cost route healthy (required since the preview is always on — needs shopware/shopware#19419)',
        healthy,
        `status ${shippingCostResponse.status}`,
    );
}

const app = createHeadlessCheckout({
    accessKey: ACCESS_KEY,
    apiBase: API_BASE,
    storefrontUrl: STOREFRONT_URL,
    shopName: 'E2E Storefront',
    currencyIso: 'EUR',
    locale: 'en-GB',
});

const { session, cart, catalog, checkout, customer, order } = app;

try {
    // ---------------------------------------------------------------------- 1
    step('Mint a context token');
    const context = await session.loadContext();
    const initialToken = app.getContextToken();
    check('token minted', initialToken.length > 0, initialToken);
    check('token adopted by the client from the response header', initialToken === context.token);
    info(`currency ${context.currency?.isoCode}, sales channel “${context.salesChannel?.name}”`);

    // ---------------------------------------------------------------------- 2
    step('Find a sellable product and add it to the cart');
    let product;
    if (process.env.SW_PRODUCT_ID) {
        // Escape hatch: demo data exposes variant *parents*, which the cart drops
        // silently. Pass a known-good id to skip the search.
        product = { id: process.env.SW_PRODUCT_ID, name: '(SW_PRODUCT_ID)' };
        check('product id supplied via SW_PRODUCT_ID', true, product.id);
    } else {
        const products = await app.findSellableProducts(3);
        check('sellable products found', products.length > 0, `${products.length}`);
        product = products[0];
    }
    if (!product) fatal('no sellable product in this sales channel');
    info(`using “${product.name}” (${product.id})`);

    const cartAfterAdd = await app.addLineItems([{ type: 'product', referencedId: product.id, quantity: 2 }]);
    cart.setCart(cartAfterAdd);
    check('line item added', cart.productLineItems.length === 1, `${cart.productLineItems.length} item(s)`);
    check('quantity is 2', cart.productLineItems[0]?.quantity === 2);

    // ---------------------------------------------------------------------- 3
    step('boot(): cart + countries + gateway (+ per-method shipping costs)');
    await checkout.boot();
    check('step is "address"', checkout.step === 'address', checkout.step);
    if (checkout.step === 'failed') fatal(`boot failed: ${checkout.bootError}`);
    check('countries loaded', catalog.countries.length > 0, `${catalog.countries.length}`);
    check('gateway payments loaded', checkout.payments.length > 0, checkout.payments.map((m) => m.name).join(', '));
    check('gateway shipments loaded', checkout.shipments.length > 0, checkout.shipments.map((m) => m.name).join(', '));
    check(
        'per-method shipping cost preview active (requires shopware/shopware#19419 in the shop)',
        checkout.perMethodCostsAvailable,
    );
    check(
        'a shipping method is selected and not blocked',
        checkout.selectedShippingMethodId !== null && !checkout.blockedShippingMethodIds.has(checkout.selectedShippingMethodId),
        checkout.selectedShippingMethod?.name ?? 'none',
    );
    check('a payment method is selected', checkout.selectedPaymentMethodId !== null, checkout.selectedPaymentMethod?.name ?? 'none');

    // ---------------------------------------------------------------------- 4
    step('Bogus promotion code is reported from cart.errors (200 response)');
    const promoMessage = await checkout.applyPromotion(`E2E-NOPE-${randomUUID().slice(0, 6)}`);
    check('rejected with a human message', typeof promoMessage === 'string' && promoMessage.length > 0, promoMessage ?? 'null');
    // Issue 3: the notice belongs to the promo input only, never to the general list.
    check(
        'promotion notices are routed to the promo input',
        checkout.promotionMessages.every((entry) => entry.message.length > 0),
        checkout.promotionMessages.map((entry) => entry.key).join(', ') || '(already cleared by the refetch)',
    );
    check(
        'no promotion notice leaked into the general error list',
        checkout.generalErrors.every((error) => !(error.messageKey ?? error.key ?? '').startsWith('promotion')),
        checkout.generalErrors.map((error) => error.key).join(', ') || 'none',
    );

    // ---------------------------------------------------------------------- 5
    step('Country change PATCHes the context and refetches cart + gateway');
    const country = catalog.countries.find((entry) => entry.iso === COUNTRY_ISO) ?? catalog.countries[0];
    if (!country) fatal('no shippable country available');
    const totalBefore = cart.total;
    await checkout.setCountry(country.id, null);
    check('country applied to the form', customer.form.countryId === country.id, `${country.name} (${country.id})`);
    check('cart still has the line item', cart.productLineItems.length === 1);
    info(`total before ${totalBefore} → after ${cart.total}`);

    // ---------------------------------------------------------------------- 6
    step('Shipping method selection (double-click safe)');
    const shipping = checkout.availableShipments[0];
    if (!shipping) fatal('no available shipping method');
    // Fire twice on purpose: the store mutex has to serialise this.
    await Promise.all([checkout.selectShippingMethod(shipping.id), checkout.selectShippingMethod(shipping.id)]);
    check('shipping method selected', checkout.selectedShippingMethodId === shipping.id, shipping.name);
    check('no action error after concurrent clicks', checkout.actionError === null, checkout.actionError ?? '');

    // ---------------------------------------------------------------------- 7
    step('Guest registration (token rotation, cart follows)');
    const email = `e2e-${randomUUID()}@example.com`;
    Object.assign(customer.form, {
        email,
        firstName: 'E2E',
        lastName: 'Tester',
        street: 'Teststraße 1',
        zipcode: '12345',
        city: 'Berlin',
        countryId: country.id,
        phoneNumber: '+49 30 1234567',
    });

    const lineItemsBefore = cart.productLineItems.map((item) => ({ id: item.referencedId ?? item.id, quantity: item.quantity }));
    const tokenBeforeRegister = app.getContextToken();

    const submitted = await checkout.submitAddress();
    if (!submitted) {
        fatal(`address step failed: ${checkout.actionError ?? JSON.stringify(customer.fieldErrors)}`);
    }
    const tokenAfterRegister = app.getContextToken();

    check('guest customer created', customer.customer?.guest === true, customer.customer?.id ?? 'none');
    check('no double opt-in pending', customer.doubleOptInPending === false);
    check('context token rotated', tokenAfterRegister !== tokenBeforeRegister, `${tokenBeforeRegister} → ${tokenAfterRegister}`);
    check('step advanced to "payment"', checkout.step === 'payment', checkout.step);
    check('exactly one register call so far', countCalls(REGISTER_CALL) === 1, `${countCalls(REGISTER_CALL)}`);
    check(
        'register response carried the address ids',
        Boolean(customer.addressIds?.shippingId),
        JSON.stringify(customer.addressIds),
    );

    const lineItemsAfter = cart.productLineItems.map((item) => ({ id: item.referencedId ?? item.id, quantity: item.quantity }));
    check(
        'cart followed the new token (same line items)',
        JSON.stringify(lineItemsBefore) === JSON.stringify(lineItemsAfter),
        JSON.stringify(lineItemsAfter),
    );

    // ---------------------------------------------------------------------- 8
    step('Back to step 1 and continue again — the guest is UPDATED, never re-registered');
    const customerIdBefore = customer.customer?.id;

    // 8a: nothing changed → no request at all, just the step switch.
    checkout.goToStep('address');
    const callsBeforeNoop = apiCalls.length;
    const noopSubmitted = await checkout.submitAddress();
    check('no-op continue succeeded', noopSubmitted === true, checkout.actionError ?? '');
    check('no-op issued no store-api call', apiCalls.length === callsBeforeNoop, `${apiCalls.length - callsBeforeNoop} call(s)`);
    check('still exactly one register call', countCalls(REGISTER_CALL) === 1, `${countCalls(REGISTER_CALL)}`);

    // 8b: tweaked street → PATCH the existing address, no second registration.
    checkout.goToStep('address');
    const patchesBefore = countCalls(ADDRESS_PATCH);
    customer.form.street = 'Teststraße 2b';
    customer.form.lastName = 'Tester-Updated';
    const updated = await checkout.submitAddress();
    check('continue after the tweak succeeded', updated === true, checkout.actionError ?? JSON.stringify(customer.fieldErrors));
    check('NO second register call', countCalls(REGISTER_CALL) === 1, `${countCalls(REGISTER_CALL)} register call(s)`);
    check('the same guest customer is still in use', customer.customer?.id === customerIdBefore, customer.customer?.id ?? 'none');
    check('address was PATCHed instead', countCalls(ADDRESS_PATCH) > patchesBefore, `${countCalls(ADDRESS_PATCH)} PATCH(es)`);
    check('profile name change went through change-profile', countCalls(PROFILE_CALL) === 1, `${countCalls(PROFILE_CALL)}`);
    check('back on step "payment"', checkout.step === 'payment', checkout.step);

    const addressesAfterUpdate = await rawApi('/store-api/account/list-address', { limit: 10 }, app.getContextToken());
    check(
        'the guest still owns exactly one address (no duplicate)',
        addressesAfterUpdate.body?.elements?.length === 1,
        (addressesAfterUpdate.body?.elements ?? []).map((entry) => entry.street).join(' | '),
    );
    check(
        'the address carries the new street',
        addressesAfterUpdate.body?.elements?.[0]?.street === 'Teststraße 2b',
        addressesAfterUpdate.body?.elements?.[0]?.street ?? 'none',
    );

    // 8c: the step-2 inline editor uses the very same update path (issue 1).
    const patchesBeforeInline = countCalls(ADDRESS_PATCH);
    customer.form.street = 'Teststraße 3c';
    const inlineSaved = await checkout.saveCustomerDetails();
    check('inline save succeeded', inlineSaved === true, checkout.actionError ?? '');
    check('inline save stayed on step "payment"', checkout.step === 'payment', checkout.step);
    check('inline save PATCHed the address', countCalls(ADDRESS_PATCH) > patchesBeforeInline);
    check('inline save did not register again', countCalls(REGISTER_CALL) === 1, `${countCalls(REGISTER_CALL)}`);

    // ---------------------------------------------------------------------- 9
    step('Payment method selection');
    // Prefer a synchronous handler so `handle-payment` finishes without a redirect.
    const synchronous = checkout.availablePayments.find((method) =>
        ['cash_payment', 'invoice_payment', 'pre_payment'].some((name) => (method.shortName ?? '').includes(name)),
    );
    const payment = synchronous ?? checkout.availablePayments[0];
    if (!payment) fatal('no available payment method');
    // Issue 2: the switch must stay *quiet* — no global busy state, no
    // "placing your order…" label; only `paymentPending` flips. Park on another
    // method first so the measured call is a real switch and not a no-op.
    const other = checkout.availablePayments.find((method) => method.id !== payment.id);
    if (checkout.selectedPaymentMethodId === payment.id && other) {
        await checkout.selectPaymentMethod(other.id);
    }
    const realSwitch = checkout.selectedPaymentMethodId !== payment.id;

    const seen = { busy: [], pending: [], placing: [] };
    const sampler = setInterval(() => {
        seen.busy.push(checkout.busy);
        seen.pending.push(checkout.paymentPending);
        seen.placing.push(checkout.placingOrder);
    }, 1);
    await checkout.selectPaymentMethod(payment.id);
    clearInterval(sampler);

    check('payment method selected', checkout.selectedPaymentMethodId === payment.id, payment.name);
    check('the switch never raised the global loading state', seen.busy.every((value) => value === false));
    check('the switch never looked like order placement', seen.placing.every((value) => value === false));
    if (realSwitch) {
        check(
            'the switch disabled the radios via paymentPending',
            seen.pending.some((value) => value === true),
            `${seen.pending.length} sample(s)`,
        );
    } else {
        info('only one payment method available — the quiet-switch flag could not be sampled');
    }
    check('paymentPending released afterwards', checkout.paymentPending === false);
    if (!synchronous) info('WARNING: no synchronous payment method found — handle-payment may return a redirectUrl');

    // ---------------------------------------------------------------------- 9
    step('canPlaceOrder gate');
    check('blocked while the terms checkbox is unchecked', checkout.canPlaceOrder === false);
    checkout.tosAccepted = true;
    check('open once terms are accepted', checkout.canPlaceOrder === true, `cart hash ${cart.hash.slice(0, 12)}…`);
    check('no blocking cart errors', cart.hasBlockingErrors === false, cart.blockingErrors.map((e) => e.key).join(', '));

    // --------------------------------------------------------------------- 10
    step('Place order + handle-payment');
    const placed = await checkout.submitOrder();
    if (!placed) fatal(`order failed: ${checkout.actionError}`);
    check('order created', Boolean(order.orderNumber), `order number ${order.orderNumber}`);
    check('handle-payment returned no redirect (synchronous handler)', order.redirectUrl === null, String(order.redirectUrl));
    check('step is "success"', checkout.step === 'success', checkout.step);
    info(`order id ${order.order?.id}, total ${order.order?.price?.totalPrice ?? order.order?.amountTotal}`);
    info(`transaction state ${order.order?.transactions?.[0]?.stateMachineState?.technicalName ?? 'unknown'}`);

    // --------------------------------------------------------------------- 11
    step('Cart hash mismatch is handled');
    // The cart was converted into an order, so the old hash is stale.
    try {
        await order.create(cart.hash);
        check('stale hash rejected', false, 'the API accepted a stale cart hash');
    } catch (error) {
        const isApiError = error instanceof ShopwareApiError;
        check(
            'stale cart is rejected by the API',
            isApiError,
            isApiError ? `${error.status} ${error.errors[0]?.code}` : String(error),
        );
    }
    // --------------------------------------------------------------------- 12
    step('Separate billing address (issue 5): register with a distinct billing address');
    // A second, independent checkout — `createHeadlessCheckout()` reinstalls the
    // bootstrap + token sink, so this must run after the first flow is finished.
    const second = createHeadlessCheckout({
        accessKey: ACCESS_KEY,
        apiBase: API_BASE,
        storefrontUrl: STOREFRONT_URL,
        shopName: 'E2E Storefront',
        currencyIso: 'EUR',
        locale: 'en-GB',
    });

    await second.session.loadContext();
    second.cart.setCart(await second.addLineItems([{ type: 'product', referencedId: product.id, quantity: 1 }]));
    await second.checkout.boot();
    if (second.checkout.step === 'failed') fatal(`second boot failed: ${second.checkout.bootError}`);

    const country2 = second.catalog.countries.find((entry) => entry.iso === COUNTRY_ISO) ?? second.catalog.countries[0];
    await second.checkout.setCountry(country2.id, null);

    const deliveryStreet = 'Lieferweg 7';
    const billingStreet = 'Rechnungsallee 3';
    Object.assign(second.customer.form, {
        email: `e2e-billing-${randomUUID()}@example.com`,
        firstName: 'Delivery',
        lastName: 'Recipient',
        street: deliveryStreet,
        zipcode: '20095',
        city: 'Hamburg',
        countryId: country2.id,
        phoneNumber: '+49 40 1234567',
    });
    second.customer.billingSameAsDelivery = false;
    Object.assign(second.customer.billing, {
        firstName: 'Billing',
        lastName: 'Payer',
        street: billingStreet,
        zipcode: '50667',
        city: 'Koeln',
        countryId: country2.id,
    });

    const registersBefore = countCalls(REGISTER_CALL);
    const submittedTwo = await second.checkout.submitAddress();
    if (!submittedTwo) {
        fatal(`billing-address step failed: ${second.checkout.actionError ?? JSON.stringify(second.customer.fieldErrors)}`);
    }
    check('second guest registered once', countCalls(REGISTER_CALL) === registersBefore + 1);
    check(
        'billing and shipping address are two different records',
        Boolean(second.customer.addressIds) &&
            second.customer.addressIds.billingId !== second.customer.addressIds.shippingId,
        JSON.stringify(second.customer.addressIds),
    );

    const twoAddresses = await rawApi('/store-api/account/list-address', { limit: 10 }, second.getContextToken());
    const streets = (twoAddresses.body?.elements ?? []).map((entry) => entry.street).sort();
    check(
        'both addresses exist with their own street',
        streets.length === 2 && streets.includes(deliveryStreet) && streets.includes(billingStreet),
        streets.join(' | '),
    );

    const payment2 =
        second.checkout.availablePayments.find((method) =>
            ['cash_payment', 'invoice_payment', 'pre_payment'].some((name) => (method.shortName ?? '').includes(name)),
        ) ?? second.checkout.availablePayments[0];
    if (!payment2) fatal('no available payment method for the billing scenario');
    await second.checkout.selectPaymentMethod(payment2.id);
    second.checkout.tosAccepted = true;

    const placedTwo = await second.checkout.submitOrder();
    if (!placedTwo) fatal(`billing-address order failed: ${second.checkout.actionError}`);
    billingOrderNumber = second.order.orderNumber;
    check('order with a separate billing address created', Boolean(second.order.orderNumber), `order number ${second.order.orderNumber}`);
    check('step is "success"', second.checkout.step === 'success', second.checkout.step);

    const orderRead = await rawApi(
        '/store-api/order',
        {
            limit: 1,
            filter: [{ type: 'equals', field: 'id', value: second.order.order?.id }],
            associations: { billingAddress: {}, deliveries: { associations: { shippingOrderAddress: {} } } },
        },
        second.getContextToken(),
    );
    const placedOrder = orderRead.body?.orders?.elements?.[0] ?? orderRead.body?.elements?.[0];
    const orderBillingStreet = placedOrder?.billingAddress?.street ?? null;
    const orderShippingStreet = placedOrder?.deliveries?.[0]?.shippingOrderAddress?.street ?? null;
    check(
        'the order kept both addresses apart',
        orderBillingStreet === billingStreet && orderShippingStreet === deliveryStreet,
        `billing “${orderBillingStreet}” vs shipping “${orderShippingStreet}”`,
    );


    // --------------------------------------------------------------------- 13
    step('Commercial subscriptions (mixed cart): account instead of guest, per-bundle shipping, order');
    if (!SUBSCRIPTIONS_CONFIGURED) {
        info('skipped — set SW_SUBSCRIPTION_PRODUCT_ID, SW_SUBSCRIPTION_PLAN_ID and SW_SUBSCRIPTION_INTERVAL_ID');
    } else {
        const sub = createHeadlessCheckout({
            accessKey: ACCESS_KEY,
            apiBase: API_BASE,
            storefrontUrl: STOREFRONT_URL,
            shopName: 'E2E Storefront',
            currencyIso: 'EUR',
            locale: 'en-GB',
        });
        await sub.session.loadContext();

        // One-time item plus the same product as a weekly subscription; the plugin
        // gives the recurring one its own line-item id (product + plan + interval).
        sub.cart.setCart(
            await sub.addLineItems([
                { type: 'product', referencedId: SUBSCRIPTION.productId, quantity: 1 },
                {
                    id: SUBSCRIPTION.productId,
                    type: 'product',
                    referencedId: SUBSCRIPTION.productId,
                    quantity: 1,
                    subscriptionPlan: SUBSCRIPTION.planId,
                    subscriptionInterval: SUBSCRIPTION.intervalId,
                },
            ]),
        );
        check('cart carries exactly one recurring bundle', sub.cart.subscriptionGroups.length === 1, sub.cart.subscriptionGroups.map((g) => g.key).join(', ') || 'none');
        const bundle = sub.cart.subscriptionGroups[0];
        if (!bundle) fatal('no recurring bundle — is SwagCommercial active and subscriptions.mixedCartsEnabled set?');
        check('bundle reads plan + interval from the managed cart', bundle.planName.length > 0 && bundle.intervalName.length > 0, `${bundle.planName} / ${bundle.intervalName}`);
        check('one-time item is split from the bundle', sub.cart.oneTimeLineItems.length === 1 && bundle.lineItems.length === 1, `${sub.cart.oneTimeLineItems.length} one-time, ${bundle.lineItems.length} recurring`);
        check('bundle line item carries plan/interval payload', bundle.lineItems[0]?.payload?.subscriptionPlan === SUBSCRIPTION.planId);

        await sub.checkout.boot();
        if (sub.checkout.step === 'failed') fatal(`subscription boot failed: ${sub.checkout.bootError}`);
        check('step is "address"', sub.checkout.step === 'address', sub.checkout.step);
        check('an account is required (guest checkout refused by the plugin)', sub.checkout.accountRequired === true && sub.customer.needsAccountRegistration === true);
        check(
            'gateway offers recurring-capable payment methods only (no cash on delivery)',
            sub.checkout.payments.length > 0 && !sub.checkout.payments.some((m) => (m.shortName ?? '').includes('cash_payment')),
            sub.checkout.payments.map((m) => m.shortName ?? m.name).join(', '),
        );
        check('no subscription error reported while nobody is registered', !sub.cart.errors.some((e) => e.messageKey === 'subscription-managed-cart'), sub.cart.errors.map((e) => e.key).join(', ') || 'none');

        // Per-bundle shipping method through the subscription context route.
        // A real alternative needs a method the bundle's own calculation accepts;
        // demo data often has just one for a given price, so the test first looks
        // for one that is blocked neither for the order nor for the bundle. If
        // there is none, it still exercises the route with a blocked method and
        // asserts the blocked state is shown and auto-reconciled.
        const bundleBefore = sub.cart.subscriptionGroups[0];
        const mainShippingBefore = sub.checkout.selectedShippingMethodId;
        const bundleBlocked = sub.checkout.blockedShippingMethodIdsFor(bundleBefore);
        const otherShipping = sub.checkout.shipments.find(
            (m) => m.id !== bundleBefore.shippingMethodId && !bundleBlocked.has(m.id) && !sub.checkout.blockedShippingMethodIds.has(m.id),
        );
        const anyOther = sub.checkout.shipments.find((m) => m.id !== bundleBefore.shippingMethodId);
        const target = otherShipping ?? anyOther;
        /** Set once the switch landed on a method the bundle can actually use. */
        let switchedToUsable = null;
        if (target) {
            const tokenBefore = sub.getContextToken();
            await sub.checkout.selectSubscriptionShippingMethod(bundleBefore, target.id);
            const bundleAfter = sub.cart.subscriptionGroups[0];
            check('bundle shipping method switched', bundleAfter?.shippingMethodId === target.id, `${bundleBefore.shippingMethod?.name} → ${bundleAfter?.shippingMethod?.name}`);
            // Whether a method is blocked only shows once it is selected, so decide here.
            const usable = Boolean(bundleAfter) && !sub.checkout.blockedShippingMethodIdsFor(bundleAfter).has(target.id);
            switchedToUsable = usable ? target : null;
            check("order's own shipping method untouched", sub.checkout.selectedShippingMethodId === mainShippingBefore, sub.checkout.selectedShippingMethod?.name ?? 'none');
            check(
                'client token NOT hijacked by the subscription route (answers with the bundle token)',
                sub.getContextToken() === tokenBefore,
                `${tokenBefore} → ${sub.getContextToken()}`,
            );
            check('no action error', sub.checkout.actionError === null, sub.checkout.actionError ?? '');
            if (!usable) {
                const blockedNow = sub.checkout.blockedShippingMethodIdsFor(bundleAfter);
                check('the only alternative is blocked for the bundle and shown as such', blockedNow.has(target.id), [...blockedNow].join(', '));
                check(
                    'the blocked bundle surfaces as a general error with the interval name',
                    sub.checkout.generalErrors.some((e) => e.messageKey === 'subscription-group-error'),
                    sub.checkout.generalErrors.map((e) => e.key).join(', '),
                );
                await sub.checkout.reconcileSelections();
                const bundleReconciled = sub.cart.subscriptionGroups[0];
                check('auto-reconcile moved the bundle back to a usable method', bundleReconciled?.shippingMethodId !== target.id && bundleReconciled?.blockingErrors.length === 0, bundleReconciled?.shippingMethod?.name ?? 'none');
                info('no second usable shipping method for this price — a persistent per-bundle switch is not exercised');
            }
        } else {
            info('only one shipping method — per-bundle switch not exercised');
        }

        // Account registration: password validated client-side first.
        const subEmail = `e2e-sub-${randomUUID()}@example.com`;
        const subPassword = `E2e-${randomUUID().slice(0, 12)}`;
        const country3 = sub.catalog.countries.find((entry) => entry.iso === COUNTRY_ISO) ?? sub.catalog.countries[0];
        Object.assign(sub.customer.form, {
            email: subEmail,
            password: 'short',
            firstName: 'Abo',
            lastName: 'Kunde',
            street: 'Abostraße 5',
            zipcode: '10115',
            city: 'Berlin',
            countryId: country3.id,
            phoneNumber: '+49 30 7654321',
        });
        const registersBeforeSub = countCalls(REGISTER_CALL);
        const tooShort = await sub.checkout.submitAddress();
        check('too short password is rejected client-side', tooShort === false && Boolean(sub.customer.fieldErrors['/password']), sub.customer.fieldErrors['/password'] ?? '');
        check('…without a register call', countCalls(REGISTER_CALL) === registersBeforeSub);

        sub.customer.form.password = subPassword;
        const tokenBeforeRegister = sub.getContextToken();
        const registered = await sub.checkout.submitAddress();
        if (!registered) fatal(`account registration failed: ${sub.checkout.actionError ?? JSON.stringify(sub.customer.fieldErrors)}`);
        check('a customer ACCOUNT was created (guest: false)', sub.customer.customer?.guest === false, sub.customer.customer?.id ?? 'none');
        check('registered as account with a rotated token', sub.getContextToken() !== tokenBeforeRegister);
        check('password field cleared after registration', sub.customer.form.password === '');
        check('no blocking subscription error for the account customer', !sub.cart.errors.some((e) => e.messageKey === 'subscription-managed-cart'), sub.cart.errors.map((e) => e.key).join(', ') || 'none');
        check('step advanced to "payment"', sub.checkout.step === 'payment', sub.checkout.step);
        if (switchedToUsable) {
            check('bundle shipping method survived the token rotation', sub.cart.subscriptionGroups[0]?.shippingMethodId === switchedToUsable.id, sub.cart.subscriptionGroups[0]?.shippingMethod?.name ?? 'none');
        } else {
            check('bundle is orderable after registration (blocked pick auto-reconciled)', sub.cart.subscriptionGroups[0]?.blockingErrors.length === 0, sub.cart.subscriptionGroups[0]?.shippingMethod?.name ?? 'none');
        }
        const bundleMethodAtOrder = sub.cart.subscriptionGroups[0]?.shippingMethodId ?? null;

        const recurringPayment =
            sub.checkout.availablePayments.find((m) => (m.shortName ?? '').includes('invoice_payment')) ??
            sub.checkout.availablePayments.find((m) => (m.shortName ?? '').includes('pre_payment')) ??
            sub.checkout.availablePayments[0];
        if (!recurringPayment) fatal('no payment method for the subscription scenario');
        await sub.checkout.selectPaymentMethod(recurringPayment.id);
        sub.checkout.tosAccepted = true;
        check('order can be placed', sub.checkout.canPlaceOrder === true, sub.cart.blockingErrors.map((e) => e.key).join(', ') || 'no blocking errors');

        const placedSub = await sub.checkout.submitOrder();
        if (!placedSub) fatal(`subscription order failed: ${sub.checkout.actionError}`);
        check('order with a recurring bundle created', Boolean(sub.order.orderNumber), `order number ${sub.order.orderNumber}`);
        check('exactly one subscription was created for the bundle', sub.order.subscriptions.length === 1, sub.order.subscriptions.map((s) => `${s.subscriptionNumber} (${s.subscriptionIntervalName})`).join(', ') || 'none');
        const created = sub.order.subscriptions[0];
        check('next delivery lies in the future', created ? new Date(created.nextSchedule).getTime() > Date.now() : false, created?.nextSchedule ?? '');
        check(
            'subscription keeps the bundle shipping method',
            Boolean(created) && created.shippingMethod?.id === bundleMethodAtOrder,
            created?.shippingMethod?.name ?? 'none',
        );
        check('step is "success"', sub.checkout.step === 'success', sub.checkout.step);
        subscriptionResult = { orderNumber: sub.order.orderNumber, subscriptionNumber: created?.subscriptionNumber ?? null };

        // ----------------------------------------------------------------- 14
        step('Login into the new account from a fresh checkout (cart merge, prefilled address, no re-register)');
        const returning = createHeadlessCheckout({
            accessKey: ACCESS_KEY,
            apiBase: API_BASE,
            storefrontUrl: STOREFRONT_URL,
            shopName: 'E2E Storefront',
            currencyIso: 'EUR',
            locale: 'en-GB',
        });
        await returning.session.loadContext();
        returning.cart.setCart(await returning.addLineItems([{ type: 'product', referencedId: product.id, quantity: 1 }]));
        await returning.checkout.boot();
        if (returning.checkout.step === 'failed') fatal(`returning boot failed: ${returning.checkout.bootError}`);

        const badLogin = await returning.checkout.login(subEmail, 'definitely-wrong');
        check('wrong password is refused with a message', badLogin === false && Boolean(returning.checkout.loginError), returning.checkout.loginError ?? '');

        const tokenBeforeLogin = returning.getContextToken();
        const goodLogin = await returning.checkout.login(subEmail, subPassword);
        check('login succeeded', goodLogin === true, returning.checkout.loginError ?? '');
        check('token rotated on login', returning.getContextToken() !== tokenBeforeLogin);
        check('account adopted', returning.customer.isAccount === true && returning.customer.form.email === subEmail, returning.customer.form.email);
        check('address prefilled from the account', returning.customer.form.street === 'Abostraße 5', returning.customer.form.street);
        check('cart kept its item across the login', returning.cart.productLineItems.length >= 1, `${returning.cart.productLineItems.length} item(s)`);
        check('no account is needed without a recurring bundle', returning.customer.needsAccountRegistration === false);

        const registersBeforeContinue = countCalls(REGISTER_CALL);
        const continued = await returning.checkout.submitAddress();
        check('continue with the logged-in account succeeded', continued === true, returning.checkout.actionError ?? JSON.stringify(returning.customer.fieldErrors));
        check('…without registering again', countCalls(REGISTER_CALL) === registersBeforeContinue);
        check('step is "payment"', returning.checkout.step === 'payment', returning.checkout.step);
    }

    // --------------------------------------------------------------------- 16
    step('Dedicated subscription checkout ("bubble"): separate subscription cart, account, order — shopper cart untouched');
    if (!SUBSCRIPTIONS_CONFIGURED) {
        info('skipped — set SW_SUBSCRIPTION_PRODUCT_ID, SW_SUBSCRIPTION_PLAN_ID and SW_SUBSCRIPTION_INTERVAL_ID');
    } else {
        const bubble = createHeadlessCheckout({
            accessKey: ACCESS_KEY,
            apiBase: API_BASE,
            storefrontUrl: STOREFRONT_URL,
            shopName: 'E2E Storefront',
            currencyIso: 'EUR',
            locale: 'en-GB',
            subscription: { planId: SUBSCRIPTION.planId, intervalId: SUBSCRIPTION.intervalId },
        });
        await bubble.session.loadContext();
        const mainToken = bubble.getContextToken();

        // Park a one-time item in the shopper's own cart (raw main route) — the
        // bubble must leave it alone.
        const parked = await rawApi('/store-api/checkout/cart/line-item', { items: [{ type: 'product', referencedId: product.id, quantity: 1 }] }, mainToken);
        check("shopper's cart holds the parked item", parked.body?.lineItems?.length === 1, `${parked.body?.lineItems?.length ?? 0} item(s)`);

        // The bubble's cart: the store routes this to the subscription twin, and the
        // plugin takes plan + interval from the subscription context — no payload needed.
        bubble.cart.setCart(
            await bubble.addLineItems([{ id: SUBSCRIPTION.productId, type: 'product', referencedId: SUBSCRIPTION.productId, quantity: 1 }]),
        );
        check(
            'subscription cart holds exactly the subscribed product',
            bubble.cart.productLineItems.length === 1 && bubble.cart.productLineItems[0]?.referencedId === SUBSCRIPTION.productId,
            `${bubble.cart.productLineItems.length} item(s)`,
        );
        check(
            'the cart is recognised as the subscription itself (bundle from the bootstrap, names fall back)',
            bubble.cart.isSubscriptionCart === true &&
                bubble.cart.subscriptionGroups.length === 1 &&
                bubble.cart.subscriptionGroups[0]?.planId === SUBSCRIPTION.planId &&
                bubble.cart.subscriptionGroups[0]?.intervalId === SUBSCRIPTION.intervalId,
            bubble.cart.subscriptionGroups[0]?.intervalName ?? 'none',
        );
        check('client token untouched by the subscription twin routes', bubble.getContextToken() === mainToken, `${mainToken} → ${bubble.getContextToken()}`);

        await bubble.checkout.boot();
        if (bubble.checkout.step === 'failed') fatal(`bubble boot failed: ${bubble.checkout.bootError}`);
        check('step is "address"', bubble.checkout.step === 'address', bubble.checkout.step);
        check('subscription mode with an account required', bubble.checkout.subscriptionMode === true && bubble.checkout.accountRequired === true);
        check('promotion input hidden (not implemented for subscription carts)', bubble.cart.promotionsSupported === false);
        check('per-method shipping preview off (route has no subscription twin)', bubble.checkout.perMethodCostsAvailable === false);
        check('a shipping method is selected on the subscription context', bubble.checkout.selectedShippingMethodId !== null, bubble.checkout.selectedShippingMethod?.name ?? 'none');
        check('a payment method is selected on the subscription context', bubble.checkout.selectedPaymentMethodId !== null, bubble.checkout.selectedPaymentMethod?.name ?? 'none');

        const country4 = bubble.catalog.countries.find((entry) => entry.iso === COUNTRY_ISO) ?? bubble.catalog.countries[0];
        await bubble.checkout.setCountry(country4.id, null);
        check('country change (subscription context) kept the subscription cart', bubble.cart.productLineItems.length === 1 && bubble.checkout.actionError === null, bubble.checkout.actionError ?? '');

        const bubbleEmail = `e2e-bubble-${randomUUID()}@example.com`;
        Object.assign(bubble.customer.form, {
            email: bubbleEmail,
            password: `E2e-${randomUUID().slice(0, 12)}`,
            firstName: 'Bubble',
            lastName: 'Kunde',
            street: 'Blasenweg 1',
            zipcode: '10115',
            city: 'Berlin',
            countryId: country4.id,
            phoneNumber: '+49 30 2222222',
        });
        const tokenBeforeBubbleRegister = bubble.getContextToken();
        const bubbleRegistered = await bubble.checkout.submitAddress();
        if (!bubbleRegistered) fatal(`bubble registration failed: ${bubble.checkout.actionError ?? JSON.stringify(bubble.customer.fieldErrors)}`);
        check('account created in the bubble', bubble.customer.customer?.guest === false, bubble.customer.customer?.id ?? 'none');
        check(
            'token rotated and the subscription cart followed the new token',
            bubble.getContextToken() !== tokenBeforeBubbleRegister && bubble.cart.productLineItems.length === 1,
            `${bubble.cart.productLineItems.length} item(s)`,
        );
        check('no blocking errors in the subscription cart', bubble.cart.hasBlockingErrors === false, bubble.cart.blockingErrors.map((e) => e.key).join(', ') || 'none');
        check('step is "payment"', bubble.checkout.step === 'payment', bubble.checkout.step);

        const bubblePayment =
            bubble.checkout.availablePayments.find((m) => (m.shortName ?? '').includes('invoice_payment')) ??
            bubble.checkout.availablePayments.find((m) => (m.shortName ?? '').includes('pre_payment')) ??
            bubble.checkout.availablePayments[0];
        if (!bubblePayment) fatal('no payment method for the bubble scenario');
        await bubble.checkout.selectPaymentMethod(bubblePayment.id);
        check('payment method applied to the subscription context', bubble.checkout.selectedPaymentMethodId === bubblePayment.id && bubble.checkout.actionError === null, bubblePayment.name);
        bubble.checkout.tosAccepted = true;
        check('order can be placed', bubble.checkout.canPlaceOrder === true, bubble.cart.blockingErrors.map((e) => e.key).join(', ') || 'no blocking errors');

        const bubblePlaced = await bubble.checkout.submitOrder();
        if (!bubblePlaced) fatal(`bubble order failed: ${bubble.checkout.actionError}`);
        check('subscription order created via the subscription order route', Boolean(bubble.order.orderNumber), `order number ${bubble.order.orderNumber}`);
        check('the order belongs to exactly one subscription', bubble.order.subscriptions.length === 1, bubble.order.subscriptions.map((s) => `${s.subscriptionNumber} (${s.subscriptionIntervalName})`).join(', ') || 'none');
        check('step is "success"', bubble.checkout.step === 'success', bubble.checkout.step);

        const mainAfter = await rawApi('/store-api/checkout/cart', {}, bubble.getContextToken());
        check(
            "shopper's own cart still holds the parked item",
            mainAfter.body?.lineItems?.length === 1 && mainAfter.body.lineItems[0]?.referencedId === product.id,
            `${mainAfter.body?.lineItems?.length ?? 0} item(s)`,
        );
        bubbleResult = { orderNumber: bubble.order.orderNumber, subscriptionNumber: bubble.order.subscriptions[0]?.subscriptionNumber ?? null };
    }

    // --------------------------------------------------------------------- 17
    step('Diagnostic: /store-api/shipping-cost/cart (raw, throwaway context)');
    await diagnoseShippingCostRoute(product.id);
} catch (error) {
    failures += 1;
    console.error('\nUnexpected failure:', error);
    if (error && typeof error === 'object' && 'errors' in error) {
        console.error(JSON.stringify(error.errors, null, 2));
    }
}

console.log('');
if (failures > 0) {
    console.log(`✗ e2e finished with ${failures} failed check(s)`);
    process.exit(1);
}
console.log(
    `✓ e2e passed — orders ${order.orderNumber}${billingOrderNumber ? ` + ${billingOrderNumber} (separate billing address)` : ''}${
        subscriptionResult ? ` + ${subscriptionResult.orderNumber} (subscription ${subscriptionResult.subscriptionNumber})` : ''
    }${bubbleResult ? ` + ${bubbleResult.orderNumber} (dedicated checkout, subscription ${bubbleResult.subscriptionNumber})` : ''} created against ${API_BASE}`,
);
