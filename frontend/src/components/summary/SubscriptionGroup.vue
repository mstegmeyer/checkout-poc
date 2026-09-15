<script setup lang="ts">
import { computed } from 'vue';
import CartLineItem from '@/components/summary/CartLineItem.vue';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import type { SubscriptionGroup } from '@/stores/cart';

/**
 * One recurring bundle in the order summary: what recurs, how often, from
 * when, and what the recurring deliveries cost to ship. The shipping method
 * itself is chosen on step 1 (`ShippingMethodList`); the recurring total sits
 * with the other totals (`PriceTotals`).
 */
const props = defineProps<{ group: SubscriptionGroup }>();

const { format, formatLongDate, isToday } = useMoney();

const meta = computed(() => {
    const parts: string[] = props.group.planName ? [props.group.planName] : [];
    parts.push(
        isToday(props.group.nextSchedule)
            ? t('subscription.firstDeliveryToday')
            : t('subscription.firstDelivery', { date: formatLongDate(props.group.nextSchedule) }),
    );
    if (props.group.minimumExecutionCount > 0) {
        parts.push(t('subscription.minimumDeliveries', { count: props.group.minimumExecutionCount }));
    }
    return parts;
});

const shippingLabel = computed(() =>
    props.group.shippingCosts === 0
        ? t('subscription.shippingFree')
        : t('subscription.shippingCosts', { amount: format(props.group.shippingCosts) }),
);

const shippingMethodName = computed(
    () => props.group.shippingMethod?.translated?.name ?? props.group.shippingMethod?.name ?? null,
);
</script>

<template>
    <section class="c-subscription-group" :aria-label="t('subscription.groupLabel', { interval: props.group.intervalName })">
        <header class="c-subscription-group__header">
            <h3 class="c-subscription-group__title">
                {{ t('subscription.groupLabel', { interval: props.group.intervalName }) }}
            </h3>
            <span v-if="props.group.discountPercentage > 0" class="c-subscription-group__badge">
                {{ t('subscription.discountBadge', { percent: props.group.discountPercentage }) }}
            </span>
        </header>

        <p class="c-subscription-group__meta">
            <span v-for="part in meta" :key="part" class="c-subscription-group__meta-item">{{ part }}</span>
        </p>

        <ul class="c-subscription-group__items">
            <li v-for="item in props.group.lineItems" :key="item.id" class="c-subscription-group__item">
                <CartLineItem :item="item" />
            </li>
        </ul>

        <p class="c-subscription-group__shipping">
            {{ shippingLabel }}<template v-if="shippingMethodName"> · {{ shippingMethodName }}</template>
        </p>
    </section>
</template>
