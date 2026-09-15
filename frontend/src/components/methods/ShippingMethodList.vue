<script setup lang="ts">
import { computed } from 'vue';
import MethodRadioCard from '@/components/methods/MethodRadioCard.vue';
import SelectInput, { type SelectOption } from '@/components/form/SelectInput.vue';
import Alert from '@/components/feedback/Alert.vue';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import { useCartStore, type SubscriptionGroup } from '@/stores/cart';
import { useCheckoutStore } from '@/stores/checkout';

/**
 * Shipping method of the order, plus — with commercial subscriptions in the
 * cart — one select per recurring bundle: the plugin keeps a shipping method
 * per bundle for its recurring deliveries, defaulting to the order's until the
 * shopper picks another one.
 */
const checkout = useCheckoutStore();
const cart = useCartStore();
const { format, formatDate } = useMoney();

interface Entry {
    id: string;
    title: string;
    description: string | null;
    meta: string | null;
    price: string | null;
    imageUrl: string | null;
    blocked: boolean;
}

const entries = computed<Entry[]>(() =>
    checkout.shipments.map((method) => {
        const cost = checkout.shippingCostFor(method.id);
        const date = checkout.deliveryDateFor(method.id);
        const deliveryTimeName = method.deliveryTime?.name;

        let meta: string | null = null;
        if (date?.earliest && date?.latest) {
            meta = t('shipping.deliveryBetween', { earliest: formatDate(date.earliest), latest: formatDate(date.latest) });
        } else if (deliveryTimeName) {
            meta = t('shipping.deliveryTime', { time: deliveryTimeName });
        }

        return {
            id: method.id,
            title: method.translated?.name ?? method.name,
            description: method.translated?.description ?? method.description ?? null,
            meta,
            price: cost === null ? null : cost === 0 ? t('shipping.free') : format(cost),
            imageUrl: method.media?.url ?? null,
            blocked: checkout.blockedShippingMethodIds.has(method.id),
        };
    }),
);

function select(id: string): void {
    void checkout.selectShippingMethod(id);
}

/**
 * Options for a bundle: the order's shipping methods, with the ones the
 * bundle's own calculation blocked marked as such (the plugin does not expose
 * a per-bundle method list to the store-api).
 */
function subscriptionOptions(group: SubscriptionGroup): SelectOption[] {
    const blocked = checkout.blockedShippingMethodIdsFor(group);
    return checkout.shipments.map((method) => {
        const name = method.translated?.name ?? method.name;
        return {
            value: method.id,
            label: blocked.has(method.id) ? t('subscription.shippingMethodUnavailable', { name }) : name,
        };
    });
}

function subscriptionShippingLabel(group: SubscriptionGroup): string {
    return group.shippingCosts === 0
        ? t('subscription.shippingFree')
        : t('subscription.shippingCosts', { amount: format(group.shippingCosts) });
}

function selectForGroup(group: SubscriptionGroup, shippingMethodId: string): void {
    void checkout.selectSubscriptionShippingMethod(group, shippingMethodId);
}
</script>

<template>
    <section class="c-method-list c-method-list--shipping" aria-labelledby="checkout-shipping-heading">
        <h3 class="c-method-list__heading" id="checkout-shipping-heading">{{ t('shipping.title') }}</h3>

        <Alert v-if="entries.length === 0" variant="warning" :message="t('shipping.none')" />

        <ul v-else class="c-method-list__items" role="radiogroup" :aria-label="t('shipping.title')">
            <li v-for="entry in entries" :key="entry.id" class="c-method-list__item">
                <MethodRadioCard
                    group="checkout-shipping-method"
                    :value="entry.id"
                    :checked="checkout.selectedShippingMethodId === entry.id"
                    :title="entry.title"
                    :description="entry.description"
                    :meta="entry.meta"
                    :price="entry.price"
                    :image-url="entry.imageUrl"
                    :disabled="entry.blocked || checkout.busy"
                    @select="select"
                />
            </li>
        </ul>

        <!-- Per-bundle methods exist only in mixed carts; in the bubble the list above is the bundle's. -->
        <div
            v-for="group in checkout.subscriptionMode ? [] : cart.subscriptionGroups"
            :key="group.key"
            class="c-method-list__subscription"
        >
            <SelectInput
                :id="`checkout-subscription-shipping-${group.key}`"
                :label="t('subscription.shippingMethod', { interval: group.intervalName })"
                :model-value="group.shippingMethodId ?? ''"
                :options="subscriptionOptions(group)"
                :hint="subscriptionShippingLabel(group)"
                :disabled="checkout.busy || checkout.subscriptionShippingPending === group.key"
                @change="(id) => selectForGroup(group, id)"
            />
        </div>
    </section>
</template>
