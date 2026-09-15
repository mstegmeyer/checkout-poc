<script setup lang="ts">
import { computed } from 'vue';
import MethodRadioCard from '@/components/methods/MethodRadioCard.vue';
import Alert from '@/components/feedback/Alert.vue';
import { t } from '@/i18n';
import { useCheckoutStore } from '@/stores/checkout';

/**
 * Payment method selection only — by design there are no payment input fields
 * (no card data). Redirect-based handlers take over after the order is placed.
 */
const checkout = useCheckoutStore();

const entries = computed(() =>
    checkout.payments.map((method) => ({
        id: method.id,
        title: method.translated?.name ?? method.name,
        description: method.translated?.description ?? method.description ?? null,
        imageUrl: method.media?.url ?? null,
        blocked: checkout.blockedPaymentMethodIds.has(method.id),
    })),
);

function select(id: string): void {
    void checkout.selectPaymentMethod(id);
}
</script>

<template>
    <section class="c-method-list c-method-list--payment" aria-labelledby="checkout-payment-heading">
        <h3 class="c-method-list__heading" id="checkout-payment-heading">{{ t('payment.title') }}</h3>

        <Alert v-if="entries.length === 0" variant="warning" :message="t('payment.none')" />

        <ul v-else class="c-method-list__items" role="radiogroup" :aria-label="t('payment.title')">
            <li v-for="entry in entries" :key="entry.id" class="c-method-list__item">
                <MethodRadioCard
                    group="checkout-payment-method"
                    :value="entry.id"
                    :checked="checkout.selectedPaymentMethodId === entry.id"
                    :title="entry.title"
                    :description="entry.description"
                    :image-url="entry.imageUrl"
                    :disabled="entry.blocked || checkout.busy || checkout.paymentPending"
                    @select="select"
                />
            </li>
        </ul>
    </section>
</template>
