<script setup lang="ts">
import { computed } from 'vue';
import StepIndicator from '@/components/StepIndicator.vue';
import CartSummary from '@/components/summary/CartSummary.vue';
import CartErrorList from '@/components/feedback/CartErrorList.vue';
import Alert from '@/components/feedback/Alert.vue';
import LoadingOverlay from '@/components/feedback/LoadingOverlay.vue';
import StepAddressView from '@/views/StepAddressView.vue';
import StepPaymentView from '@/views/StepPaymentView.vue';
import OrderSuccessView from '@/views/OrderSuccessView.vue';
import EmptyCartView from '@/views/EmptyCartView.vue';
import DoubleOptInView from '@/views/DoubleOptInView.vue';
import { t } from '@/i18n';
import { useBootstrap } from '@/bootstrap';
import { useCheckoutStore } from '@/stores/checkout';

/**
 * Shell: shop header, step indicator, the current step and the order summary
 * aside. The step machine lives in the checkout store — there is no router.
 */
const config = useBootstrap();
const checkout = useCheckoutStore();

const showSummary = computed(() => checkout.step === 'address' || checkout.step === 'payment');
const showSteps = computed(() => showSummary.value);

/**
 * The design collapses the summary into a bar on mobile; on desktop it lives in
 * the aside where there is room to show it expanded. Read once at mount — the
 * shopper owns the state from the first click onwards.
 */
const summaryInitiallyOpen =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(min-width: 60rem)').matches
        : false;

/**
 * Cart notices plus gateway notices, de-duplicated by key. Promotion notices are
 * excluded — they belong next to the promotion input, not here (issue 3).
 */
const notices = computed(() => checkout.generalErrors);
</script>

<template>
    <div class="checkout" :class="`checkout--step-${checkout.step}`">
        <header class="checkout__header">
            <p class="checkout__shop-name">{{ config.shopName }}</p>
            <StepIndicator v-if="showSteps" :current="checkout.stepIndex" />
        </header>

        <LoadingOverlay :active="checkout.step === 'boot'" />

        <Alert v-if="checkout.step === 'failed'" variant="error" :title="t('errors.boot')" :message="checkout.bootError ?? ''">
            <button class="checkout__retry" type="button" @click="checkout.boot()">{{ t('common.retry') }}</button>
        </Alert>

        <div v-if="checkout.step !== 'boot' && checkout.step !== 'failed'" class="checkout__layout">
            <main class="checkout__main">
                <!-- Dedicated subscription checkout: the shopper's own cart is parked meanwhile. -->
                <Alert
                    v-if="showSummary && checkout.subscriptionMode"
                    variant="info"
                    :message="t('subscription.bubbleHint')"
                />

                <CartErrorList v-if="showSummary" :errors="notices" />

                <StepAddressView v-if="checkout.step === 'address'" />
                <StepPaymentView v-else-if="checkout.step === 'payment'" />
                <OrderSuccessView v-else-if="checkout.step === 'success'" />
                <DoubleOptInView v-else-if="checkout.step === 'doubleOptIn'" />
                <EmptyCartView v-else-if="checkout.step === 'emptyCart'" />
            </main>

            <aside v-if="showSummary" class="checkout__aside">
                <CartSummary :initially-open="summaryInitiallyOpen" />
            </aside>
        </div>

        <LoadingOverlay :active="checkout.busy && checkout.step !== 'boot'" />
    </div>
</template>
