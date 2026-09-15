<script setup lang="ts">
import { computed, ref } from 'vue';
import LoginForm from '@/components/account/LoginForm.vue';
import AddressForm from '@/components/address/AddressForm.vue';
import ShippingMethodList from '@/components/methods/ShippingMethodList.vue';
import CheckboxInput from '@/components/form/CheckboxInput.vue';
import TextInput from '@/components/form/TextInput.vue';
import Alert from '@/components/feedback/Alert.vue';
import IconCard from '@/components/icons/IconCard.vue';
import { t } from '@/i18n';
import { useCheckoutStore } from '@/stores/checkout';
import { POINTERS, useCustomerStore } from '@/stores/customer';

/**
 * Step 1 — contact, delivery address and shipping method. Submitting registers
 * the guest (which rotates the context token) and moves on to payment.
 *
 * With a commercial subscription in the cart the guest premise no longer holds
 * (the plugin refuses guests): the contact section then asks for a password and
 * creates an account, or the shopper logs into an existing one.
 */
const checkout = useCheckoutStore();
const customer = useCustomerStore();

const submitting = ref(false);
/** Inline login open (replaces the e-mail field while visible). */
const showLogin = ref(false);

/**
 * Row of accepted-payment marks under the order summary (Figma 441:10487…91).
 * Purely reassurance, and purely shop data: the marks are the media of the
 * sales channel's own payment methods, never bundled brand assets. When the
 * shop configured no media at all the row is dropped instead of degrading into
 * a line of identical placeholders.
 */
const paymentMarks = computed(() =>
    checkout.availablePayments.map((method) => ({
        id: method.id,
        title: method.translated?.name ?? method.name,
        imageUrl: method.media?.url ?? null,
    })),
);

const showPaymentMarks = computed(() => paymentMarks.value.some((mark) => mark.imageUrl !== null));

async function submit(): Promise<void> {
    submitting.value = true;
    try {
        await checkout.submitAddress();
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <form class="v-address" novalidate @submit.prevent="submit">
        <ul v-if="showPaymentMarks" class="c-payment-marks" :aria-label="t('payment.marks')">
            <li v-for="mark in paymentMarks" :key="mark.id" class="c-payment-marks__item">
                <img v-if="mark.imageUrl" class="c-payment-marks__image" :src="mark.imageUrl" :alt="mark.title" />
                <IconCard v-else />
            </li>
        </ul>

        <section class="v-address__contact" aria-labelledby="checkout-contact-heading">
            <header class="v-address__contact-header">
                <h2 class="v-address__heading" id="checkout-contact-heading">{{ t('contact.title') }}</h2>
                <p v-if="customer.isAccount" class="v-address__login">
                    <span class="v-address__login-question">{{ t('account.loggedInAs', { email: customer.form.email }) }}</span>
                </p>
                <p v-else-if="!showLogin" class="v-address__login">
                    <!-- The design shows the bare "Log in" link; the question
                         stays in the accessibility tree as its context. -->
                    <span class="v-address__login-question">{{ t('contact.loginQuestion') }}</span>
                    <button class="v-address__login-link" type="button" @click="showLogin = true">
                        {{ t('contact.login') }}
                    </button>
                </p>
            </header>

            <LoginForm
                v-if="showLogin"
                :initial-email="customer.form.email"
                @done="showLogin = false"
                @cancel="showLogin = false"
            />

            <template v-else>
                <Alert
                    v-if="customer.needsAccountRegistration"
                    variant="info"
                    :message="t('account.required')"
                />

                <TextInput
                    id="checkout-email"
                    type="email"
                    inputmode="email"
                    :label="t('contact.email')"
                    :placeholder="t('contact.email')"
                    :hint="customer.isAccount ? undefined : t('contact.emailHint')"
                    v-model="customer.form.email"
                    autocomplete="email"
                    :readonly="customer.isAccount"
                    :error="customer.fieldErrors[POINTERS.email]"
                    @blur="customer.clearFieldError(POINTERS.email)"
                />

                <TextInput
                    v-if="customer.needsAccountRegistration"
                    id="checkout-password"
                    type="password"
                    :label="t('account.password')"
                    :placeholder="t('account.password')"
                    :hint="t('account.passwordHint', { min: customer.passwordMinLength })"
                    v-model="customer.form.password"
                    autocomplete="new-password"
                    :error="customer.fieldErrors[POINTERS.password]"
                    @blur="customer.clearFieldError(POINTERS.password)"
                />
            </template>
        </section>

        <AddressForm />

        <!-- Billing address (Figma 443:10698 shows the same checkbox copy). Checked
             by default: the register call then sends one address and the server
             mirrors it into the shipping address. -->
        <CheckboxInput
            id="checkout-billing-same"
            class="v-address__billing-toggle"
            :label="t('address.billingSame')"
            v-model="customer.billingSameAsDelivery"
        />

        <AddressForm
            v-if="!customer.billingSameAsDelivery"
            class="v-address__billing"
            scope="billing"
            id-prefix="checkout-billing"
        />

        <ShippingMethodList />

        <Alert v-if="checkout.actionError" variant="error" :message="checkout.actionError" />

        <footer class="v-address__actions">
            <button
                class="v-address__submit"
                type="submit"
                :disabled="submitting || checkout.busy || checkout.availableShipments.length === 0"
            >
                {{ t('common.continue') }}
            </button>
        </footer>
    </form>
</template>
