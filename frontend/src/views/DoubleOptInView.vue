<script setup lang="ts">
import { t } from '@/i18n';
import { useCustomerStore } from '@/stores/customer';

/**
 * Terminal state for `core.loginRegistration.doubleOptInGuestOrder`: the
 * registration answered `doubleOptInRegistration: true` and did **not** rotate
 * the context token, so the checkout cannot continue in this tab.
 */
const customer = useCustomerStore();
</script>

<template>
    <section class="v-double-opt-in" aria-labelledby="checkout-doi-heading">
        <h2 class="v-double-opt-in__heading" id="checkout-doi-heading">{{ t('doubleOptIn.title') }}</h2>
        <p class="v-double-opt-in__text">{{ t('doubleOptIn.text', { email: customer.form.email }) }}</p>
    </section>
</template>
