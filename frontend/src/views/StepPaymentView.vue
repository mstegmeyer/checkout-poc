<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AddressForm from '@/components/address/AddressForm.vue';
import PaymentMethodList from '@/components/methods/PaymentMethodList.vue';
import ShippingMethodList from '@/components/methods/ShippingMethodList.vue';
import CheckboxInput from '@/components/form/CheckboxInput.vue';
import TextInput from '@/components/form/TextInput.vue';
import Alert from '@/components/feedback/Alert.vue';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import { useCartStore } from '@/stores/cart';
import { useCheckoutStore } from '@/stores/checkout';
import { POINTERS, useCustomerStore, type AddressFields } from '@/stores/customer';

/**
 * Step 2 — payment method, review rows with *inline* editors (Figma 443:10698),
 * terms checkbox and the single place-order button gated by `canPlaceOrder`.
 */
const checkout = useCheckoutStore();
const customer = useCustomerStore();
const cart = useCartStore();
const { format } = useMoney();

const tosError = ref<string | null>(null);

/** One row at a time; `null` = every row collapsed to its summary. */
type ReviewRow = 'contact' | 'shipTo' | 'delivery';
const editing = ref<ReviewRow | null>(null);
const saving = ref(false);

/** Values as they were when the editor opened — restored on "Cancel". */
let backup: { email: string; delivery: AddressFields } | null = null;

/** The design puts the amount on the CTA itself ("Pay now €108.19"). */
const submitLabel = computed(() =>
    checkout.placingOrder ? t('order.placing') : t('order.placeWithAmount', { amount: format(cart.total) }),
);

const address = computed(() => {
    const form = customer.form;
    const parts = [
        `${form.firstName} ${form.lastName}`.trim(),
        form.street,
        [form.zipcode, form.city].filter(Boolean).join(' '),
        customer.selectedCountry?.name ?? '',
    ];
    return parts.filter((part) => part !== '').join(', ');
});

function isOpen(row: ReviewRow): boolean {
    return editing.value === row;
}

function snapshot(): { email: string; delivery: AddressFields } {
    return { email: customer.form.email, delivery: { ...customer.form } };
}

function open(row: ReviewRow): void {
    backup = snapshot();
    customer.resetFieldErrors();
    checkout.actionError = null;
    editing.value = row;
}

function close(): void {
    editing.value = null;
    backup = null;
}

function cancel(): void {
    if (backup) {
        customer.form.email = backup.email;
        Object.assign(customer.form, backup.delivery);
    }
    customer.resetFieldErrors();
    close();
}

function toggle(row: ReviewRow): void {
    if (isOpen(row)) {
        cancel();
        return;
    }
    if (editing.value !== null) cancel();
    open(row);
}

/** Applies the change through the guest update path and collapses the row. */
async function save(): Promise<void> {
    if (saving.value) return;
    saving.value = true;
    try {
        const ok = await checkout.saveCustomerDetails();
        if (ok) close();
    } finally {
        saving.value = false;
    }
}

// Picking a shipping method applies immediately — collapse once it landed.
watch(
    () => checkout.selectedShippingMethodId,
    () => {
        if (editing.value === 'delivery') close();
    },
);

async function submit(): Promise<void> {
    tosError.value = null;
    if (!checkout.tosAccepted) {
        tosError.value = t('tos.required');
        return;
    }
    await checkout.submitOrder();
}
</script>

<template>
    <form class="v-payment" novalidate @submit.prevent="submit">
        <section class="v-payment__review" aria-labelledby="checkout-review-heading">
            <!-- Visually hidden: the design shows the review rows without a
                 heading, but the section still needs an accessible name. -->
            <h2 class="v-payment__heading" id="checkout-review-heading">{{ t('review.title') }}</h2>
            <dl class="v-payment__review-list">
                <!-- Contact --------------------------------------------------- -->
                <div
                    class="v-payment__review-row v-payment__review-row--contact"
                    :class="{ 'v-payment__review-row--editing': isOpen('contact') }"
                >
                    <dt class="v-payment__review-label">
                        {{ isOpen('contact') ? t('contact.title') : t('review.contact') }}
                    </dt>
                    <dd v-if="!isOpen('contact')" class="v-payment__review-value">{{ customer.form.email }}</dd>
                    <button
                        class="v-payment__edit"
                        :class="{ 'v-payment__edit--cancel': isOpen('contact') }"
                        type="button"
                        :aria-expanded="isOpen('contact')"
                        aria-controls="checkout-review-contact-editor"
                        @click="toggle('contact')"
                    >
                        {{ isOpen('contact') ? t('common.cancel') : t('common.edit') }}
                    </button>
                    <div v-if="isOpen('contact')" class="v-payment__review-edit" id="checkout-review-contact-editor">
                        <TextInput
                            id="checkout-review-email"
                            type="email"
                            inputmode="email"
                            :label="t('contact.email')"
                            :placeholder="t('contact.email')"
                            v-model="customer.form.email"
                            autocomplete="email"
                            :readonly="customer.isAccount"
                            :hint="customer.isAccount ? t('account.emailLocked') : undefined"
                            :error="customer.fieldErrors[POINTERS.email]"
                            @blur="customer.clearFieldError(POINTERS.email)"
                        />
                        <button
                            class="v-payment__review-save"
                            type="button"
                            :disabled="saving || checkout.busy"
                            @click="save()"
                        >
                            {{ t('review.saveContact') }}
                        </button>
                    </div>
                </div>

                <!-- Ship to (delivery address) -------------------------------- -->
                <div
                    class="v-payment__review-row v-payment__review-row--ship-to"
                    :class="{ 'v-payment__review-row--editing': isOpen('shipTo') }"
                >
                    <dt class="v-payment__review-label">
                        {{ isOpen('shipTo') ? t('address.title') : t('review.shipTo') }}
                    </dt>
                    <dd v-if="!isOpen('shipTo')" class="v-payment__review-value">{{ address }}</dd>
                    <button
                        class="v-payment__edit"
                        :class="{ 'v-payment__edit--cancel': isOpen('shipTo') }"
                        type="button"
                        :aria-expanded="isOpen('shipTo')"
                        aria-controls="checkout-review-address-editor"
                        @click="toggle('shipTo')"
                    >
                        {{ isOpen('shipTo') ? t('common.cancel') : t('common.edit') }}
                    </button>
                    <div v-if="isOpen('shipTo')" class="v-payment__review-edit" id="checkout-review-address-editor">
                        <AddressForm id-prefix="checkout-review" :show-legend="false" />
                        <button
                            class="v-payment__review-save"
                            type="button"
                            :disabled="saving || checkout.busy"
                            @click="save()"
                        >
                            {{ t('review.saveAddress') }}
                        </button>
                    </div>
                </div>

                <!-- Delivery (shipping method) -------------------------------- -->
                <div
                    class="v-payment__review-row v-payment__review-row--delivery"
                    :class="{ 'v-payment__review-row--editing': isOpen('delivery') }"
                >
                    <dt class="v-payment__review-label">
                        {{ isOpen('delivery') ? t('shipping.title') : t('review.method') }}
                    </dt>
                    <dd v-if="!isOpen('delivery')" class="v-payment__review-value">
                        <span class="v-payment__review-line">{{ checkout.selectedShippingMethod?.name ?? '—' }}</span>
                        <!-- Each recurring bundle ships with its own method. -->
                        <span
                            v-for="group in checkout.subscriptionMode ? [] : cart.subscriptionGroups"
                            :key="group.key"
                            class="v-payment__review-line v-payment__review-line--sub"
                        >
                            {{ t('subscription.shippingMethod', { interval: group.intervalName }) }}:
                            {{ group.shippingMethod?.translated?.name ?? group.shippingMethod?.name ?? '—' }}
                        </span>
                    </dd>
                    <button
                        class="v-payment__edit"
                        :class="{ 'v-payment__edit--cancel': isOpen('delivery') }"
                        type="button"
                        :aria-expanded="isOpen('delivery')"
                        aria-controls="checkout-review-delivery-editor"
                        @click="toggle('delivery')"
                    >
                        {{ isOpen('delivery') ? t('common.cancel') : t('common.edit') }}
                    </button>
                    <div v-if="isOpen('delivery')" class="v-payment__review-edit" id="checkout-review-delivery-editor">
                        <ShippingMethodList />
                    </div>
                </div>
            </dl>
        </section>

        <PaymentMethodList />

        <!-- Recurring charge notice — the plugin's storefront shows the same text before the order button. -->
        <p v-if="cart.hasSubscriptions" class="v-payment__disclaimer">{{ t('subscription.disclaimer') }}</p>

        <CheckboxInput
            id="checkout-tos"
            :label="t('tos.label')"
            v-model="checkout.tosAccepted"
            :error="tosError ?? undefined"
            required
        />

        <Alert v-if="checkout.actionError" variant="error" :message="checkout.actionError" />
        <Alert v-if="checkout.redirecting" variant="info" :message="t('payment.redirecting')" />

        <footer class="v-payment__actions">
            <button class="v-payment__back" type="button" @click="checkout.goToStep('address')">
                {{ t('common.back') }}
            </button>
            <button class="v-payment__submit" type="submit" :disabled="!checkout.canPlaceOrder">
                {{ submitLabel }}
            </button>
        </footer>
    </form>
</template>
