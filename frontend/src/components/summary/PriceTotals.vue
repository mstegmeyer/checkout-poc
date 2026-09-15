<script setup lang="ts">
import { computed } from 'vue';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import { useCartStore } from '@/stores/cart';
import { useCheckoutStore } from '@/stores/checkout';

/**
 * All amounts come straight from the server (`cart.price`, `deliveries[]`) —
 * nothing is recomputed on the client.
 */
const cart = useCartStore();
const checkout = useCheckoutStore();
const { format } = useMoney();

const promotionTotal = computed(() =>
    cart.promotionLineItems.reduce((sum, item) => sum + item.price.totalPrice, 0),
);

const showShipping = computed(() => cart.hasDeliveries || checkout.step === 'payment');
</script>

<template>
    <dl class="c-price-totals">
        <div class="c-price-totals__row c-price-totals__row--subtotal">
            <dt class="c-price-totals__label">{{ t('summary.subtotal') }}</dt>
            <dd class="c-price-totals__value">{{ format(cart.subtotal) }}</dd>
        </div>

        <div v-if="promotionTotal !== 0" class="c-price-totals__row c-price-totals__row--promotion">
            <dt class="c-price-totals__label">{{ t('summary.promotion') }}</dt>
            <dd class="c-price-totals__value">{{ format(promotionTotal) }}</dd>
        </div>

        <div v-if="cart.subscriptionDiscountTotal !== 0" class="c-price-totals__row c-price-totals__row--promotion">
            <dt class="c-price-totals__label">{{ t('subscription.discount') }}</dt>
            <dd class="c-price-totals__value">{{ format(cart.subscriptionDiscountTotal) }}</dd>
        </div>

        <div class="c-price-totals__row c-price-totals__row--shipping">
            <dt class="c-price-totals__label">{{ t('summary.shipping') }}</dt>
            <dd class="c-price-totals__value">
                <template v-if="showShipping">
                    {{ cart.shippingCosts === 0 ? t('shipping.free') : format(cart.shippingCosts) }}
                </template>
                <template v-else>{{ t('summary.shippingPending') }}</template>
            </dd>
        </div>

        <div
            v-for="tax in cart.taxes"
            :key="`tax-${tax.taxRate}`"
            class="c-price-totals__row c-price-totals__row--tax"
        >
            <dt class="c-price-totals__label">{{ t('summary.vat', { rate: tax.taxRate }) }}</dt>
            <dd class="c-price-totals__value">{{ format(tax.tax) }}</dd>
        </div>

        <div v-if="cart.taxStatus === 'net'" class="c-price-totals__row c-price-totals__row--net">
            <dt class="c-price-totals__label">{{ t('summary.net') }}</dt>
            <dd class="c-price-totals__value">{{ format(cart.netTotal) }}</dd>
        </div>

        <div class="c-price-totals__row c-price-totals__row--total">
            <dt class="c-price-totals__label">{{ t('summary.total') }}</dt>
            <dd class="c-price-totals__value">{{ format(cart.total) }}</dd>
        </div>

        <!-- What each recurring bundle costs per delivery, after today's order. -->
        <div
            v-for="group in cart.subscriptionGroups"
            :key="group.key"
            class="c-price-totals__row c-price-totals__row--recurring"
        >
            <dt class="c-price-totals__label">{{ t('subscription.recurringTotal', { interval: group.intervalName }) }}</dt>
            <dd class="c-price-totals__value">{{ format(group.total) }}</dd>
        </div>
    </dl>
</template>
