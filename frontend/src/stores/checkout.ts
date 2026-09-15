import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { isSubscriptionMode } from '@/api/checkoutRoutes';
import { isHeaderMode } from '@/api/client';
import { updateContext } from '@/api/endpoints/context';
import { fetchGateway } from '@/api/endpoints/gateway';
import { fetchShippingCosts, type ShippingCostMap } from '@/api/endpoints/shippingCost';
import { updateSubscriptionContext } from '@/api/endpoints/subscription';
import { ShopwareApiError } from '@/api/errors';
import type { CartError, PaymentMethod, ShippingMethod } from '@/api/types';
import { cartErrorMessage, globalMessage, isPromotionCartError } from '@/i18n/violations';
import { t } from '@/i18n';
import { SUBSCRIPTION_GROUP_ERROR, useCartStore, type KeyedCartError, type SubscriptionGroup } from '@/stores/cart';
import { useCatalogStore } from '@/stores/catalog';
import { useCustomerStore } from '@/stores/customer';
import { useOrderStore } from '@/stores/order';
import { useSessionStore } from '@/stores/session';

/**
 * Step state machine — deliberately no vue-router: the checkout is a single
 * mount point inside a Shopware page, and a URL-less machine keeps the
 * back-button semantics of the surrounding storefront intact.
 */
export type CheckoutStep = 'boot' | 'address' | 'payment' | 'success' | 'emptyCart' | 'doubleOptIn' | 'failed';

const SHIPPING_BLOCKED = 'shipping-method-blocked';
const PAYMENT_BLOCKED = 'payment-method-blocked';

/**
 * Synthetic message key for a recurring bundle's own errors once they are
 * lifted into the general list (see `expandGroupError`).
 */
export const SUBSCRIPTION_GROUP_ERROR_EXPANDED = 'subscription-group-error';

export const useCheckoutStore = defineStore('checkout', () => {
    const session = useSessionStore();
    const cart = useCartStore();
    const catalog = useCatalogStore();
    const customer = useCustomerStore();
    const order = useOrderStore();

    /**
     * Dedicated subscription checkout (bootstrap `subscription`): cart, context
     * patches and the order go to the plugin's `/store-api/subscription/*`
     * twins. Fixed for the lifetime of the page.
     */
    const subscriptionMode = isSubscriptionMode();

    const step = ref<CheckoutStep>('boot');
    const payments = ref<PaymentMethod[]>([]);
    const shipments = ref<ShippingMethod[]>([]);
    const gatewayErrors = ref<Record<string, CartError>>({});
    const shippingCosts = ref<ShippingCostMap>({});
    /** True when `/store-api/shipping-cost/cart` exists (Shopware >= 6.7). */
    const perMethodCostsAvailable = ref(false);

    const selectedShippingMethodId = ref<string | null>(null);
    const selectedPaymentMethodId = ref<string | null>(null);
    const tosAccepted = ref(false);

    const bootError = ref<string | null>(null);
    const actionError = ref<string | null>(null);
    const loginError = ref<string | null>(null);
    const busy = ref(false);
    const redirecting = ref(false);
    /**
     * A payment-method switch is a *quiet* mutation: it must not raise `busy`
     * (which drives the global loading view) and it must not be mistaken for
     * order placement. The radios and the pay button watch this flag instead.
     */
    const paymentPending = ref(false);
    /** Key of the recurring bundle whose shipping method is being switched (quiet, too). */
    const subscriptionShippingPending = ref<string | null>(null);
    /** True only while `POST /checkout/order` + handle-payment are in flight. */
    const placingOrder = ref(false);

    // ---------------------------------------------------------------- mutex --

    let queue: Promise<unknown> = Promise.resolve();
    let depth = 0;

    /**
     * Serialises all mutating actions: a double-clicked button cannot interleave
     * two PATCH/refresh cycles and end up with a stale cart.
     *
     * `quiet` keeps the action out of the global `busy` state — the calling
     * component then owns its own pending affordance.
     */
    function serialize<T>(action: () => Promise<T>, quiet = false): Promise<T> {
        const run = queue.then(
            () => guarded(action, quiet),
            () => guarded(action, quiet),
        );
        queue = run.catch(() => undefined);
        return run;
    }

    async function guarded<T>(action: () => Promise<T>, quiet = false): Promise<T> {
        if (quiet) return await action();

        depth += 1;
        busy.value = true;
        try {
            return await action();
        } finally {
            depth -= 1;
            if (depth === 0) busy.value = false;
        }
    }

    // ------------------------------------------------------------- loading --

    async function loadGateway(): Promise<void> {
        const gateway = await fetchGateway();
        payments.value = gateway.payments;
        shipments.value = gateway.shipments;
        // The gateway has no subscription twin: its method lists are the best
        // available, but its blocked-method notices describe the shopper's
        // parked cart, not the subscription cart. The latter reports its own
        // blocked methods in `cart.errors`, which is what counts in the bubble.
        gatewayErrors.value = subscriptionMode ? {} : gateway.errors;
    }

    /**
     * Per-method price/delivery-date preview. Requires Shopware with the
     * `/store-api/shipping-cost/cart` fix (shopware/shopware#19419) — older
     * builds 500 on blocked methods or wipe the persisted cart
     * (docs/upstream-issue-shipping-cost-route.md).
     */
    async function loadShippingCosts(): Promise<void> {
        // The route has no subscription twin: it would price the shopper's
        // (other) cart. The bubble shows the selected method's cost from the cart.
        if (subscriptionMode) {
            shippingCosts.value = {};
            perMethodCostsAvailable.value = false;
            return;
        }
        const costs = await fetchShippingCosts(shipments.value.map((method) => method.id));
        shippingCosts.value = costs;
        perMethodCostsAvailable.value = Object.keys(costs).length > 0;
    }

    /**
     * `GET /store-api/context` has no subscription twin, so in the bubble the
     * subscription context's selections are read back from its cart: the
     * delivery's method and the transaction's payment method.
     */
    function syncSelectionsFromCart(): void {
        if (!subscriptionMode) return;
        const current = cart.cart;
        selectedShippingMethodId.value = current?.deliveries?.[0]?.shippingMethod?.id ?? selectedShippingMethodId.value;
        selectedPaymentMethodId.value = current?.transactions?.[0]?.paymentMethodId ?? selectedPaymentMethodId.value;
    }

    /** Every mutation is followed by this: cart and gateway always move together. */
    async function refresh(): Promise<void> {
        await Promise.all([cart.load(), loadGateway()]);
    }

    // ------------------------------------------------------------- helpers --

    /**
     * The commercial plugin reports a broken recurring bundle as ONE main-cart
     * error (`subscription-managed-cart`) whose parameters carry only the message
     * *keys* of the underlying errors — not enough for a sentence. The managed
     * cart has the full errors, so the wrapper is replaced by those, each
     * prefixed with the bundle's interval name.
     */
    function expandGroupError(error: KeyedCartError): KeyedCartError[] {
        const group = cart.subscriptionGroups.find((candidate) => error.key === `${SUBSCRIPTION_GROUP_ERROR}-${candidate.key}`);
        const parameters = (error.parameters ?? {}) as { intervalName?: unknown };
        const intervalName =
            typeof parameters.intervalName === 'string' ? parameters.intervalName : (group?.intervalName ?? '');

        const inner = group?.errors ?? [];
        if (inner.length === 0) {
            return [
                {
                    ...error,
                    messageKey: SUBSCRIPTION_GROUP_ERROR_EXPANDED,
                    parameters: { intervalName, detail: t('cart.error.subscription-managed-cart', { intervalName }) },
                },
            ];
        }

        return inner.map((entry) => ({
            ...entry,
            key: `${error.key}:${entry.key}`,
            messageKey: SUBSCRIPTION_GROUP_ERROR_EXPANDED,
            block: entry.block ?? error.block,
            level: entry.level ?? error.level,
            parameters: { intervalName, detail: cartErrorMessage(entry) },
        }));
    }

    /** Cart notices plus gateway notices, de-duplicated by error key. */
    const allErrors = computed<KeyedCartError[]>(() => {
        const map = new Map<string, KeyedCartError>();
        const put = (error: KeyedCartError): void => {
            if (error.messageKey === SUBSCRIPTION_GROUP_ERROR) {
                for (const expanded of expandGroupError(error)) map.set(expanded.key, expanded);
                return;
            }
            map.set(error.key, error);
        };
        for (const error of cart.errors) put(error);
        for (const [key, error] of Object.entries(gatewayErrors.value)) put({ ...error, key: error.key ?? key });
        return [...map.values()];
    });

    /**
     * Promotion notices are shown *only* next to the promotion input, so they are
     * kept out of the general list — a rejected code used to be reported twice.
     */
    const promotionErrors = computed(() => allErrors.value.filter(isPromotionCartError));
    const generalErrors = computed(() => allErrors.value.filter((error) => !isPromotionCartError(error)));
    const promotionMessages = computed(() =>
        promotionErrors.value.map((error) => ({ key: error.key, message: cartErrorMessage(error) })),
    );

    function blockedIdsIn(errors: KeyedCartError[], messageKey: string, methods: { id: string; name: string }[]): Set<string> {
        const ids = new Set<string>();
        for (const error of errors) {
            if (error.messageKey !== messageKey) continue;
            const parameters = (error.parameters ?? {}) as { id?: unknown; name?: unknown };
            if (typeof parameters.id === 'string' && parameters.id !== '') {
                ids.add(parameters.id);
                continue;
            }
            // 6.6 only reports the method *name* — match it back to the list.
            if (typeof parameters.name === 'string') {
                const match = methods.find((method) => method.name === parameters.name);
                if (match) ids.add(match.id);
            }
        }
        return ids;
    }

    const blockedShippingMethodIds = computed(() => blockedIdsIn(allErrors.value, SHIPPING_BLOCKED, shipments.value));
    const blockedPaymentMethodIds = computed(() => blockedIdsIn(allErrors.value, PAYMENT_BLOCKED, payments.value));

    /**
     * Shipping methods a recurring bundle cannot use. The managed cart's blocked
     * errors stay inside the bundle (they are not lifted into the main cart's
     * `shipping-method-blocked`), so they are read from the group itself.
     */
    function blockedShippingMethodIdsFor(group: SubscriptionGroup): Set<string> {
        return blockedIdsIn(group.errors, SHIPPING_BLOCKED, shipments.value);
    }

    const availableShipments = computed(() => shipments.value.filter((method) => !blockedShippingMethodIds.value.has(method.id)));
    const availablePayments = computed(() => payments.value.filter((method) => !blockedPaymentMethodIds.value.has(method.id)));

    const hasBlockedMethodErrors = computed(() =>
        allErrors.value.some((error) => error.messageKey === SHIPPING_BLOCKED || error.messageKey === PAYMENT_BLOCKED),
    );

    const selectedShippingMethod = computed(
        () => shipments.value.find((method) => method.id === selectedShippingMethodId.value) ?? null,
    );
    const selectedPaymentMethod = computed(
        () => payments.value.find((method) => method.id === selectedPaymentMethodId.value) ?? null,
    );

    /**
     * Recurring bundles in the cart. The commercial plugin refuses guests for
     * those, so step 1 creates an account (or logs in) instead of a guest.
     */
    const accountRequired = computed(() => cart.hasSubscriptions);

    /**
     * Everything the order needs, ignoring transient busy state — this is what
     * `submitOrder()` checks (it runs *inside* the mutex, where `busy` is true).
     */
    const orderRequirementsMet = computed(
        () =>
            !cart.isEmpty &&
            !cart.hasBlockingErrors &&
            !hasBlockedMethodErrors.value &&
            selectedShippingMethodId.value !== null &&
            selectedPaymentMethodId.value !== null &&
            tosAccepted.value,
    );

    /** The single gate for the pay button. */
    const canPlaceOrder = computed(
        () => !busy.value && !paymentPending.value && subscriptionShippingPending.value === null && orderRequirementsMet.value,
    );

    const stepIndex = computed(() => (step.value === 'payment' ? 2 : 1));

    /** Shipping cost to show for a method (per-method route, else cart/free). */
    function shippingCostFor(methodId: string): number | null {
        const entry = shippingCosts.value[methodId];
        if (entry) return entry.price.totalPrice;
        if (methodId === selectedShippingMethodId.value && cart.hasDeliveries) return cart.shippingCosts;
        return null;
    }

    function deliveryDateFor(methodId: string) {
        return shippingCosts.value[methodId]?.deliveryDate ?? (methodId === selectedShippingMethodId.value ? cart.deliveryDate : null);
    }

    /**
     * Auto-selects the first available method whenever nothing is selected or
     * the selected one got blocked — otherwise placing the order would fail with
     * `CHECKOUT__CART_INVALID`. Returns true when the context was patched.
     */
    async function reconcileSelections(): Promise<boolean> {
        const update: { shippingMethodId?: string; paymentMethodId?: string } = {};

        const shippingOk =
            selectedShippingMethodId.value !== null &&
            !blockedShippingMethodIds.value.has(selectedShippingMethodId.value) &&
            shipments.value.some((method) => method.id === selectedShippingMethodId.value);
        if (!shippingOk && availableShipments.value.length > 0) {
            update.shippingMethodId = availableShipments.value[0]!.id;
        }

        const paymentOk =
            selectedPaymentMethodId.value !== null &&
            !blockedPaymentMethodIds.value.has(selectedPaymentMethodId.value) &&
            payments.value.some((method) => method.id === selectedPaymentMethodId.value);
        if (!paymentOk && availablePayments.value.length > 0) {
            update.paymentMethodId = availablePayments.value[0]!.id;
        }

        let changed = false;
        if (Object.keys(update).length > 0) {
            await updateContext(update);
            if (update.shippingMethodId) selectedShippingMethodId.value = update.shippingMethodId;
            if (update.paymentMethodId) selectedPaymentMethodId.value = update.paymentMethodId;
            await refresh();
            changed = true;
        }

        if (await reconcileSubscriptionShipping()) changed = true;

        return changed;
    }

    /**
     * Same idea per recurring bundle: a bundle follows the main shipping method
     * until it gets its own, and a blocked one blocks the whole order. One pass
     * per call — a candidate that turns out blocked as well is skipped on the
     * next reconcile, so this terminates.
     */
    async function reconcileSubscriptionShipping(): Promise<boolean> {
        // In the bubble the one group *is* the cart; the main reconcile covers it.
        if (subscriptionMode) return false;

        let changed = false;
        for (const group of cart.subscriptionGroups) {
            const blocked = blockedShippingMethodIdsFor(group);
            if (group.shippingMethodId !== null && !blocked.has(group.shippingMethodId)) continue;

            const candidate = shipments.value.find(
                (method) =>
                    method.id !== group.shippingMethodId &&
                    !blocked.has(method.id) &&
                    !blockedShippingMethodIds.value.has(method.id),
            );
            if (!candidate) continue;

            await updateSubscriptionContext(group.planId, group.intervalId, { shippingMethodId: candidate.id });
            changed = true;
        }
        if (changed) await refresh();
        return changed;
    }

    // ---------------------------------------------------------------- boot --

    async function boot(): Promise<void> {
        bootError.value = null;
        step.value = 'boot';

        try {
            await guarded(async () => {
                // In header mode a token must exist before anything runs in
                // parallel, otherwise each concurrent call would mint its own
                // context (and cart). Session mode has no such race: every call
                // resolves the same token out of the storefront session.
                if (isHeaderMode() && !session.hasToken) {
                    await session.loadContext();
                    await Promise.all([cart.load(), catalog.loadCountries(), loadGateway()]);
                } else {
                    await Promise.all([session.loadContext(), cart.load(), catalog.loadCountries(), loadGateway()]);
                }

                selectedShippingMethodId.value = session.contextShippingMethodId;
                selectedPaymentMethodId.value = session.contextPaymentMethodId;
                syncSelectionsFromCart();

                // A customer already on the context (logged in or a guest from
                // the storefront) is continued, never registered a second time.
                if (session.customer) customer.adoptExisting(session.customer);

                prefillCountry();

                if (cart.isEmpty) {
                    step.value = 'emptyCart';
                    return;
                }

                await reconcileSelections();
                await Promise.all([loadShippingCosts(), ensureStates()]);

                step.value = 'address';
            });
        } catch (error) {
            bootError.value = globalMessage(error);
            step.value = 'failed';
        }
    }

    function prefillCountry(): void {
        const contextCountryId = session.countryId;
        const fallback = catalog.countries[0]?.id ?? '';
        const preselect = contextCountryId && catalog.countryById(contextCountryId) ? contextCountryId : fallback;
        if (customer.form.countryId === '') customer.form.countryId = preselect;
        if (customer.billing.countryId === '') customer.billing.countryId = preselect;
    }

    async function ensureStates(): Promise<void> {
        const loads: Promise<unknown>[] = [];
        if (customer.stateRequired && customer.form.countryId !== '') {
            loads.push(catalog.loadStates(customer.form.countryId));
        }
        if (customer.billingStateRequired && customer.billing.countryId !== '') {
            loads.push(catalog.loadStates(customer.billing.countryId));
        }
        await Promise.all(loads);
    }

    // ------------------------------------------------------------- actions --

    /** Country change: PATCH context (allowed pre-register), then refetch. */
    function setCountry(countryId: string, countryStateId: string | null = null): Promise<void> {
        return serialize(async () => {
            actionError.value = null;
            customer.form.countryId = countryId;
            customer.form.countryStateId = countryStateId ?? '';
            customer.clearFieldError(customer.deliveryPointers.countryId);

            try {
                await updateContext({ countryId, countryStateId: countryStateId || null });
                await refresh();
                await reconcileSelections();
                await Promise.all([loadShippingCosts(), ensureStates()]);
            } catch (error) {
                actionError.value = globalMessage(error);
            }
        });
    }

    function selectShippingMethod(shippingMethodId: string): Promise<void> {
        return serialize(async () => {
            if (shippingMethodId === selectedShippingMethodId.value) return;
            actionError.value = null;
            const previous = selectedShippingMethodId.value;
            selectedShippingMethodId.value = shippingMethodId;
            try {
                await updateContext({ shippingMethodId });
                await refresh();
                await reconcileSubscriptionShipping();
                await loadShippingCosts();
            } catch (error) {
                selectedShippingMethodId.value = previous;
                actionError.value = globalMessage(error);
            }
        });
    }

    /**
     * Shipping method of one recurring bundle. Quiet like the payment switch:
     * the select owns its pending state via `subscriptionShippingPending`.
     *
     * Goes through the subscription context route, which is addressed with the
     * shopper's own token plus the plan/interval headers — the client never
     * touches the bundle's derived token (docs/subscriptions.md).
     *
     * Like the order's own method, an explicit choice is not second-guessed: a
     * method the bundle's calculation then blocks stays selected and is shown
     * as blocked. Only the automatic paths (boot, country, registration, …)
     * reconcile it away.
     */
    function selectSubscriptionShippingMethod(group: SubscriptionGroup, shippingMethodId: string): Promise<void> {
        return serialize(async () => {
            if (shippingMethodId === group.shippingMethodId) return;
            actionError.value = null;
            subscriptionShippingPending.value = group.key;
            try {
                await updateSubscriptionContext(group.planId, group.intervalId, { shippingMethodId });
                await refresh();
            } catch (error) {
                actionError.value = globalMessage(error);
            } finally {
                subscriptionShippingPending.value = null;
            }
        }, true);
    }

    /**
     * Switching the payment method is a *quiet* mutation: the PATCH + refetch
     * must not flip the whole view into a loading state (issue 2). The radios and
     * the pay button disable themselves on `paymentPending` instead.
     */
    function selectPaymentMethod(paymentMethodId: string): Promise<void> {
        return serialize(async () => {
            if (paymentMethodId === selectedPaymentMethodId.value) return;
            actionError.value = null;
            const previous = selectedPaymentMethodId.value;
            selectedPaymentMethodId.value = paymentMethodId;
            paymentPending.value = true;
            try {
                await updateContext({ paymentMethodId });
                await refresh();
            } catch (error) {
                selectedPaymentMethodId.value = previous;
                actionError.value = globalMessage(error);
            } finally {
                paymentPending.value = false;
            }
        }, true);
    }

    /** Billing country change — a plain form field, no context PATCH. */
    function setBillingCountry(countryId: string, countryStateId: string | null = null): Promise<void> {
        return serialize(async () => {
            actionError.value = null;
            customer.billing.countryId = countryId;
            customer.billing.countryStateId = countryStateId ?? '';
            customer.clearFieldError(customer.billingPointers.countryId);
            await ensureStates();
        }, true);
    }

    /**
     * Logs an existing customer in. The token rotates and the server merges the
     * anonymous cart into the customer's, so cart, gateway and selections are
     * re-read from scratch. The customer's stored addresses prefill the form.
     */
    function login(email: string, password: string): Promise<boolean> {
        return serialize(async () => {
            loginError.value = null;
            actionError.value = null;
            try {
                await customer.login(email, password);
                const context = await session.loadContext();
                if (context.customer) customer.adoptExisting(context.customer);

                selectedShippingMethodId.value = context.shippingMethod?.id ?? selectedShippingMethodId.value;
                selectedPaymentMethodId.value = context.paymentMethod?.id ?? selectedPaymentMethodId.value;

                await refresh();
                syncSelectionsFromCart();
                if (cart.isEmpty) {
                    step.value = 'emptyCart';
                    return true;
                }
                await reconcileSelections();
                await Promise.all([loadShippingCosts(), ensureStates()]);
                return true;
            } catch (error) {
                loginError.value = globalMessage(error);
                return false;
            }
        });
    }

    /**
     * Registers *or* updates the customer (the customer store diffs against the
     * last submitted values), then re-reads cart + gateway when something
     * changed. Shared by the step-1 submit and the step-2 inline editors.
     */
    async function persistCustomer(): Promise<boolean> {
        actionError.value = null;
        try {
            const ok = await customer.submit();
            if (!ok) return false;

            if (customer.doubleOptInPending) {
                step.value = 'doubleOptIn';
                return true;
            }

            if (customer.lastSubmitMutated) {
                await refresh();
                await reconcileSelections();
                await loadShippingCosts();
            }

            if (cart.isEmpty) {
                step.value = 'emptyCart';
                return false;
            }

            return true;
        } catch (error) {
            actionError.value = globalMessage(error);
            return false;
        }
    }

    /** Step 1 → step 2: registers (or updates) the customer, then advances. */
    function submitAddress(): Promise<boolean> {
        return serialize(async () => {
            const ok = await persistCustomer();
            if (!ok || step.value === 'doubleOptIn' || step.value === 'emptyCart') return ok;
            step.value = 'payment';
            return true;
        });
    }

    /**
     * Step 2 inline editors (issue 1): applies a contact / address change without
     * leaving the payment step.
     */
    function saveCustomerDetails(): Promise<boolean> {
        return serialize(() => persistCustomer());
    }

    function goToStep(next: Extract<CheckoutStep, 'address' | 'payment'>): void {
        if (next === 'payment' && !customer.isRegistered) return;
        actionError.value = null;
        step.value = next;
    }

    /** Applies a promotion code; returns a message when the code was rejected. */
    function applyPromotion(code: string): Promise<string | null> {
        return serialize(async () => {
            actionError.value = null;
            if (code.trim() === '') return t('promo.empty');
            try {
                const result = await cart.applyPromotion(code);
                await loadGateway();
                await reconcileSelections();
                if (!result.ok) {
                    const first = result.errors[0];
                    return first ? cartErrorMessage(first) : t('errors.generic');
                }
                return null;
            } catch (error) {
                return globalMessage(error);
            }
        });
    }

    function removeLineItem(lineItemId: string): Promise<void> {
        return serialize(async () => {
            actionError.value = null;
            try {
                await cart.removeLineItem(lineItemId);
                await loadGateway();
                await reconcileSelections();
                await loadShippingCosts();
                if (cart.isEmpty) step.value = 'emptyCart';
            } catch (error) {
                actionError.value = globalMessage(error);
            }
        });
    }

    /**
     * Places the order and starts the payment. On a cart hash mismatch the cart
     * is refreshed and the customer has to confirm once more.
     */
    function submitOrder(): Promise<boolean> {
        return serialize(async () => {
            actionError.value = null;

            if (!tosAccepted.value) {
                actionError.value = t('tos.required');
                return false;
            }
            if (!orderRequirementsMet.value) {
                actionError.value = selectedPaymentMethodId.value === null ? t('errors.selectPayment') : t('errors.cartInvalid');
                return false;
            }

            const hadSubscriptions = cart.hasSubscriptions;
            placingOrder.value = true;
            try {
                await order.submit(cart.hash, cart.cart?.customerComment ?? undefined);

                if (order.redirectUrl) {
                    // Browser is leaving for the payment provider.
                    redirecting.value = true;
                    return true;
                }

                // The order response does not carry the subscriptions the
                // plugin created; the success view shows them from a follow-up read.
                if (hadSubscriptions && order.order) await order.loadSubscriptions(order.order.id);

                step.value = 'success';
                return true;
            } catch (error) {
                if (error instanceof ShopwareApiError && error.isCartHashMismatch) {
                    await refresh();
                    await reconcileSelections();
                    await loadShippingCosts();
                    actionError.value = t('errors.cartChanged');
                    return false;
                }
                if (order.isPlaced) {
                    // Order exists but handle-payment failed — never silently retry.
                    actionError.value = t('errors.paymentFailed');
                    return false;
                }
                actionError.value = globalMessage(error);
                return false;
            } finally {
                placingOrder.value = false;
            }
        });
    }

    return {
        // state
        subscriptionMode,
        step,
        payments,
        shipments,
        gatewayErrors,
        shippingCosts,
        perMethodCostsAvailable,
        selectedShippingMethodId,
        selectedPaymentMethodId,
        tosAccepted,
        bootError,
        actionError,
        loginError,
        busy,
        redirecting,
        paymentPending,
        subscriptionShippingPending,
        placingOrder,
        // getters
        availableShipments,
        availablePayments,
        blockedShippingMethodIds,
        blockedPaymentMethodIds,
        hasBlockedMethodErrors,
        promotionErrors,
        promotionMessages,
        generalErrors,
        selectedShippingMethod,
        selectedPaymentMethod,
        accountRequired,
        orderRequirementsMet,
        canPlaceOrder,
        stepIndex,
        // actions
        boot,
        refresh,
        loadGateway,
        loadShippingCosts,
        reconcileSelections,
        setCountry,
        setBillingCountry,
        selectShippingMethod,
        selectSubscriptionShippingMethod,
        selectPaymentMethod,
        login,
        submitAddress,
        saveCustomerDetails,
        goToStep,
        applyPromotion,
        removeLineItem,
        submitOrder,
        shippingCostFor,
        deliveryDateFor,
        blockedShippingMethodIdsFor,
    };
});
