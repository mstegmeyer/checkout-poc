import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { isSubscriptionMode } from '@/api/checkoutRoutes';
import { addPromotionCode, fetchCart, removeLineItems } from '@/api/endpoints/cart';
import { useBootstrap } from '@/bootstrap';
import { t } from '@/i18n';
import type {
    Cart,
    CartError,
    DeliveryDate,
    LineItem,
    ManagedCart,
    ShippingMethod,
    SubscriptionContext,
    SubscriptionInterval,
    SubscriptionPlan,
} from '@/api/types';

/** Cart-error levels as used by Shopware. */
export const CART_ERROR_LEVEL = { notice: 0, warning: 10, error: 20 } as const;

/** Line item the commercial plugin adds per recurring bundle when the plan carries a discount. */
export const SUBSCRIPTION_DISCOUNT_TYPE = 'subscriptionDiscount';

/**
 * Main-cart error the plugin raises for a recurring bundle whose managed cart
 * has blocking errors. Its parameters only carry the *message keys* of those
 * errors — the managed cart itself has the full objects (`SubscriptionGroup.errors`).
 */
export const SUBSCRIPTION_GROUP_ERROR = 'subscription-managed-cart';

export type KeyedCartError = CartError & { key: string };

/**
 * One recurring bundle of a mixed cart (plan + interval), read from the managed
 * cart the commercial plugin calculates alongside the main cart. Everything a
 * shopper sees about "the subscription" comes from here: the items that recur,
 * the recurring total, the shipping method of the recurring deliveries and the
 * bundle's own errors.
 */
export interface SubscriptionGroup {
    /** `<planId>-<intervalId>` — the plugin's own key for the bundle. */
    key: string;
    planId: string;
    intervalId: string;
    plan: SubscriptionPlan;
    interval: SubscriptionInterval;
    /** Plan label if the shop wants it shown, else the plan name. */
    planName: string;
    intervalName: string;
    /** First delivery — today for every interval a mixed cart accepts. */
    nextSchedule: string;
    /** Cron-bound interval; the plugin blocks these in mixed carts. */
    delayed: boolean;
    discountPercentage: number;
    minimumExecutionCount: number;
    /** Product items of the bundle, as calculated in the managed cart. */
    lineItems: LineItem[];
    lineItemIds: Set<string>;
    /** Recurring total per delivery (managed cart grand total incl. shipping). */
    total: number;
    shippingCosts: number;
    shippingMethod: ShippingMethod | null;
    shippingMethodId: string | null;
    deliveryDate: DeliveryDate | null;
    errors: KeyedCartError[];
    blockingErrors: KeyedCartError[];
}

/**
 * PHP `ErrorCollection`s serialise as `[]` while empty and as a keyed object
 * once filled — normalise both to a keyed list.
 */
function keyedErrors(errors: Record<string, CartError> | CartError[] | null | undefined): KeyedCartError[] {
    if (!errors || Array.isArray(errors)) return [];
    return Object.entries(errors).map(([key, error]) => ({ ...error, key: error.key ?? key }));
}

function isProductLike(item: LineItem): boolean {
    return item.type !== 'promotion' && item.type !== SUBSCRIPTION_DISCOUNT_TYPE;
}

/**
 * Dedicated subscription checkout: the store-api never serialises the
 * subscription struct for that cart, so the bundle's description comes from
 * the bootstrap (the app template reads it off the Twig context). Missing
 * names fall back to neutral labels.
 */
function bootstrapSubscriptionContext(): SubscriptionContext | null {
    const bundle = useBootstrap().subscription;
    if (!bundle) return null;
    return {
        managed: false,
        nextSchedule: bundle.nextSchedule ?? new Date().toISOString(),
        interval: { id: bundle.intervalId, name: bundle.intervalName ?? '', delayed: bundle.delayed ?? false },
        plan: {
            id: bundle.planId,
            name: bundle.planName ?? '',
            discountPercentage: bundle.discountPercentage ?? 0,
            minimumExecutionCount: bundle.minimumExecutionCount ?? 0,
        },
    };
}

function toGroup(key: string, managed: ManagedCart | Cart, context = managed.extensions?.subscription): SubscriptionGroup | null {
    const plan = context?.plan;
    const interval = context?.interval;
    if (!context || !plan || !interval) return null;

    // The key is `<planId>-<intervalId>`; ids are 32 hex chars without dashes.
    const [keyPlanId = '', keyIntervalId = ''] = key.split('-', 2);

    const lineItems = (managed.lineItems ?? []).filter(isProductLike);
    const deliveries = managed.deliveries ?? [];
    const delivery = deliveries[0];
    const errors = keyedErrors(managed.errors);

    const label = plan.translated?.label ?? plan.label ?? null;
    const name = plan.translated?.name ?? plan.name;

    return {
        key,
        planId: plan.id ?? keyPlanId,
        intervalId: interval.id ?? keyIntervalId,
        plan,
        interval,
        planName: plan.activeStorefrontLabel && label ? label : name,
        intervalName: (interval.translated?.name ?? interval.name) || t('subscription.unnamedInterval'),
        nextSchedule: context.nextSchedule,
        delayed: interval.delayed === true,
        discountPercentage: plan.discountPercentage ?? 0,
        minimumExecutionCount: plan.minimumExecutionCount ?? 0,
        lineItems,
        lineItemIds: new Set(lineItems.map((item) => item.id)),
        total: managed.price?.totalPrice ?? 0,
        shippingCosts: deliveries.reduce((sum, entry) => sum + (entry.shippingCosts?.totalPrice ?? 0), 0),
        shippingMethod: delivery?.shippingMethod ?? null,
        shippingMethodId: delivery?.shippingMethod?.id ?? null,
        deliveryDate: delivery?.deliveryDate ?? null,
        errors,
        blockingErrors: errors.filter((error) => error.block === true),
    };
}

export const useCartStore = defineStore('cart', () => {
    const cart = ref<Cart | null>(null);
    const loading = ref(false);
    /** Error keys that were already present before the last mutation. */
    const knownErrorKeys = ref<string[]>([]);

    function setCart(next: Cart): void {
        cart.value = next;
    }

    async function load(): Promise<Cart> {
        loading.value = true;
        try {
            const next = await fetchCart();
            setCart(next);
            return next;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Adds a promotion code. The API answers 200 even for bogus codes, so the
     * result is derived from the *newly appeared* cart errors.
     */
    async function applyPromotion(code: string): Promise<{ ok: boolean; errors: CartError[] }> {
        knownErrorKeys.value = Object.keys(cart.value?.errors ?? {});
        const next = await addPromotionCode(code.trim());
        setCart(next);

        const newErrors = Object.entries(next.errors ?? {})
            .filter(([key]) => !knownErrorKeys.value.includes(key))
            .map(([, error]) => error);

        const promotionErrors = newErrors.filter((error) => (error.messageKey ?? '').startsWith('promotion'));

        return { ok: promotionErrors.length === 0, errors: promotionErrors };
    }

    async function removeLineItem(id: string): Promise<Cart> {
        const next = await removeLineItems([id]);
        setCart(next);
        return next;
    }

    const lineItems = computed<LineItem[]>(() => cart.value?.lineItems ?? []);
    /** Goods — products, whether bought once or as part of a recurring bundle. */
    const productLineItems = computed(() => lineItems.value.filter(isProductLike));
    const promotionLineItems = computed(() => lineItems.value.filter((item) => item.type === 'promotion'));
    const subscriptionDiscountLineItems = computed(() =>
        lineItems.value.filter((item) => item.type === SUBSCRIPTION_DISCOUNT_TYPE),
    );

    const isEmpty = computed(() => productLineItems.value.length === 0);
    const itemCount = computed(() => productLineItems.value.reduce((sum, item) => sum + item.quantity, 0));

    const hash = computed(() => cart.value?.hash ?? '');

    /** Line-item total without shipping (`price.positionPrice`). */
    const subtotal = computed(() => cart.value?.price.positionPrice ?? 0);
    /** Grand total — includes shipping, promotions and tax. */
    const total = computed(() => cart.value?.price.totalPrice ?? 0);
    const netTotal = computed(() => cart.value?.price.netPrice ?? 0);
    const taxStatus = computed(() => cart.value?.price.taxStatus ?? 'gross');
    const taxes = computed(() => (cart.value?.price.calculatedTaxes ?? []).filter((tax) => tax.tax !== 0));

    /** Shipping costs of the currently selected method, summed over deliveries. */
    const shippingCosts = computed(() =>
        (cart.value?.deliveries ?? []).reduce((sum, delivery) => sum + (delivery.shippingCosts?.totalPrice ?? 0), 0),
    );
    const hasDeliveries = computed(() => (cart.value?.deliveries ?? []).length > 0);
    const deliveryDate = computed(() => cart.value?.deliveries?.[0]?.deliveryDate ?? null);

    /** In-cart notices, normalised to a list with keys. */
    const errors = computed<KeyedCartError[]>(() => keyedErrors(cart.value?.errors));
    const blockingErrors = computed(() => errors.value.filter((error) => error.block === true));
    const hasBlockingErrors = computed(() => blockingErrors.value.length > 0);
    const notices = computed(() => errors.value.filter((error) => error.block !== true));

    // -------------------------------------------------------- subscriptions --

    /**
     * Dedicated subscription checkout: the cart *is* the subscription and
     * carries its plan/interval context directly (`extensions.subscription`).
     */
    const isSubscriptionCart = computed(() => isSubscriptionMode() && cart.value !== null);

    /**
     * Recurring bundles, in the order the plugin lists them. Empty without the
     * commercial plugin, without mixed carts, or for a cart with no recurring
     * item — the checkout then behaves exactly as before.
     *
     * In the dedicated subscription checkout the whole cart is the one bundle,
     * so it is presented as a single group built from the cart itself.
     */
    const subscriptionGroups = computed<SubscriptionGroup[]>(() => {
        const current = cart.value;
        if (!current) return [];

        if (isSubscriptionCart.value) {
            const context = current.extensions?.subscription ?? bootstrapSubscriptionContext();
            const group = context ? toGroup(`${context.plan.id}-${context.interval.id}`, current, context) : null;
            return group ? [group] : [];
        }

        const elements = current.extensions?.subscriptionManagedCarts?.elements;
        // An empty PHP struct serialises as `[]`.
        if (!elements || Array.isArray(elements)) return [];
        return Object.entries(elements)
            .map(([key, managed]) => toGroup(key, managed))
            .filter((group): group is SubscriptionGroup => group !== null);
    });

    const hasSubscriptions = computed(() => subscriptionGroups.value.length > 0);

    const subscriptionLineItemIds = computed(() => {
        const ids = new Set<string>();
        for (const group of subscriptionGroups.value) group.lineItemIds.forEach((id) => ids.add(id));
        return ids;
    });

    /** Products bought once — everything that is not part of a recurring bundle. */
    const oneTimeLineItems = computed(() =>
        isSubscriptionCart.value
            ? []
            : productLineItems.value.filter(
                  (item) =>
                      !subscriptionLineItemIds.value.has(item.id) &&
                      !(item.payload?.subscriptionPlan && item.payload?.subscriptionInterval),
              ),
    );

    /** The plugin refuses promotions in subscription carts (`CHECKOUT__PROMOTION_NOT_IMPLEMENTED`). */
    const promotionsSupported = computed(() => !isSubscriptionMode());

    /** Sum of the plan discounts, a negative amount (0 when there is none). */
    const subscriptionDiscountTotal = computed(() =>
        subscriptionDiscountLineItems.value.reduce((sum, item) => sum + item.price.totalPrice, 0),
    );

    function subscriptionGroupByKey(key: string): SubscriptionGroup | null {
        return subscriptionGroups.value.find((group) => group.key === key) ?? null;
    }

    return {
        cart,
        loading,
        setCart,
        load,
        applyPromotion,
        removeLineItem,
        lineItems,
        productLineItems,
        promotionLineItems,
        subscriptionDiscountLineItems,
        isEmpty,
        itemCount,
        hash,
        subtotal,
        total,
        netTotal,
        taxStatus,
        taxes,
        shippingCosts,
        hasDeliveries,
        deliveryDate,
        errors,
        blockingErrors,
        hasBlockingErrors,
        notices,
        isSubscriptionCart,
        subscriptionGroups,
        hasSubscriptions,
        subscriptionLineItemIds,
        oneTimeLineItems,
        promotionsSupported,
        subscriptionDiscountTotal,
        subscriptionGroupByKey,
    };
});
