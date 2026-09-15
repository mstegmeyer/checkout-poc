<script setup lang="ts">
import { computed, ref } from 'vue';
import IconTag from '@/components/icons/IconTag.vue';
import { t } from '@/i18n';
import { useCartStore } from '@/stores/cart';
import { useCheckoutStore } from '@/stores/checkout';

/**
 * Promotion code entry. Bad codes come back inside a 200 response as cart
 * errors, so the message is whatever the store derived from `cart.errors`.
 *
 * Those promotion notices are rendered *here only* — `CartErrorList` filters them
 * out, so a rejected code is reported once instead of twice (issue 3).
 */
const cart = useCartStore();
const checkout = useCheckoutStore();

const code = ref('');
const message = ref<string | null>(null);
const pending = ref(false);

/**
 * The cart-derived promotion notices plus the message the last submit returned
 * (client-side rejections have no cart error), de-duplicated: the two sources
 * describe the same rejection.
 */
const messages = computed(() => {
    const seen = new Map<string, string>();
    for (const entry of checkout.promotionMessages) seen.set(entry.message, entry.message);
    if (message.value) seen.set(message.value, message.value);
    return [...seen.values()];
});

async function submit(): Promise<void> {
    pending.value = true;
    message.value = null;
    try {
        const error = await checkout.applyPromotion(code.value);
        message.value = error;
        if (!error) code.value = '';
    } finally {
        pending.value = false;
    }
}

function remove(lineItemId: string): void {
    void checkout.removeLineItem(lineItemId);
}
</script>

<template>
    <section class="c-promotion" aria-labelledby="checkout-promotion-heading">
        <h3 class="c-promotion__heading" id="checkout-promotion-heading">{{ t('promo.title') }}</h3>

        <form class="c-promotion__form" @submit.prevent="submit">
            <label class="c-promotion__label" for="checkout-promotion-code">{{ t('promo.title') }}</label>
            <input
                class="c-promotion__input"
                id="checkout-promotion-code"
                type="text"
                v-model="code"
                :placeholder="t('promo.placeholder')"
                autocomplete="off"
            />
            <button class="c-promotion__submit" type="submit" :disabled="pending || checkout.busy">
                {{ t('promo.apply') }}
            </button>
        </form>

        <p v-for="entry in messages" :key="entry" class="c-promotion__error" role="alert">{{ entry }}</p>

        <ul v-if="cart.promotionLineItems.length > 0" class="c-promotion__applied">
            <li v-for="promotion in cart.promotionLineItems" :key="promotion.id" class="c-promotion__chip">
                <IconTag />
                <span class="c-promotion__chip-label">
                    {{ t('summary.promotionApplied', { code: promotion.payload?.code ?? promotion.label ?? '' }) }}
                </span>
                <button
                    class="c-promotion__chip-remove"
                    type="button"
                    :disabled="checkout.busy"
                    @click="remove(promotion.id)"
                >
                    {{ t('common.remove') }}
                </button>
            </li>
        </ul>
    </section>
</template>
