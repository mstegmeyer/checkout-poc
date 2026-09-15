<script setup lang="ts">
import { computed } from 'vue';
import IconCheck from '@/components/icons/IconCheck.vue';
import { useBootstrap } from '@/bootstrap';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import { useCustomerStore } from '@/stores/customer';
import { useOrderStore } from '@/stores/order';

/**
 * Terminal success state. Returning to the storefront is safe now: the store-api
 * wrote the post-registration token back into the storefront session, so the
 * storefront shows the same (order-emptied) cart rather than a stale one.
 */
const order = useOrderStore();
const customer = useCustomerStore();
const config = useBootstrap();
const { formatLongDate } = useMoney();

const email = computed(() => order.order?.orderCustomer?.email ?? customer.form.email);
</script>

<template>
    <section class="v-success" aria-labelledby="checkout-success-heading">
        <p class="v-success__icon" aria-hidden="true"><IconCheck /></p>
        <h2 class="v-success__heading" id="checkout-success-heading">{{ t('success.title') }}</h2>
        <p v-if="order.orderNumber" class="v-success__order-number">
            {{ t('success.orderNumber', { orderNumber: order.orderNumber }) }}
        </p>
        <p v-if="email" class="v-success__email">{{ t('success.email', { email }) }}</p>

        <section
            v-if="order.subscriptions.length > 0"
            class="v-success__subscriptions"
            aria-labelledby="checkout-success-subscriptions-heading"
        >
            <h3 class="v-success__subscriptions-heading" id="checkout-success-subscriptions-heading">
                {{ t('subscription.successTitle') }}
            </h3>
            <ul class="v-success__subscription-list">
                <li v-for="subscription in order.subscriptions" :key="subscription.id" class="v-success__subscription">
                    {{
                        t('subscription.successItem', {
                            number: subscription.subscriptionNumber,
                            interval: subscription.subscriptionIntervalName,
                            date: formatLongDate(subscription.nextSchedule),
                        })
                    }}
                </li>
            </ul>
            <p class="v-success__subscriptions-note">{{ t('subscription.successManage') }}</p>
        </section>
        <p class="v-success__actions">
            <a class="v-success__link" :href="config.homeUrl">{{ t('success.continueShopping') }}</a>
        </p>
    </section>
</template>
