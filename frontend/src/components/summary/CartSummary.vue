<script setup lang="ts">
import { computed, ref } from 'vue';
import CartLineItem from '@/components/summary/CartLineItem.vue';
import PriceTotals from '@/components/summary/PriceTotals.vue';
import PromotionInput from '@/components/summary/PromotionInput.vue';
import SubscriptionGroup from '@/components/summary/SubscriptionGroup.vue';
import IconChevronDown from '@/components/icons/IconChevronDown.vue';
import IconTag from '@/components/icons/IconTag.vue';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import { useCartStore } from '@/stores/cart';

/**
 * Collapsible order summary: line items, promotion entry and the server-side
 * totals.
 *
 * The design gives the two states different anatomies (Figma 442:10664 vs
 * 425:9327): collapsed it is a band with the item count, the total, the applied
 * promotion and a "Show details" toggle; expanded it grows a heading, the
 * product rows and the price breakdown, and the toggle moves to the bottom.
 * Both share one grid — `base.css` re-places the children, so the toggle stays
 * a single button (one `aria-expanded`, one `aria-controls`).
 *
 * With commercial subscriptions in the cart the items split: products bought
 * once stay in the plain list, every recurring bundle gets its own box.
 */
const props = withDefaults(defineProps<{ collapsible?: boolean; initiallyOpen?: boolean }>(), {
    collapsible: true,
    initiallyOpen: true,
});

const cart = useCartStore();
const { format } = useMoney();

const open = ref(props.initiallyOpen);

const itemCountLabel = computed(() =>
    cart.itemCount === 1 ? t('summary.itemCountOne') : t('summary.itemCount', { count: cart.itemCount }),
);

/** The collapsed band mirrors the applied promotion as a single chip line. */
/** Plain list: everything when there are no subscriptions, else the one-time items. */
const plainItems = computed(() => (cart.hasSubscriptions ? cart.oneTimeLineItems : cart.productLineItems));

const appliedPromotion = computed(() => {
    const promotion = cart.promotionLineItems[0];
    if (!promotion) return null;
    return t('summary.promotionApplied', { code: promotion.payload?.code ?? promotion.label ?? '' });
});
</script>

<template>
    <section class="c-summary" :class="{ 'c-summary--open': open }" aria-labelledby="checkout-summary-heading">
        <h2 class="c-summary__heading" id="checkout-summary-heading">{{ t('summary.title') }}</h2>

        <p v-if="!open" class="c-summary__count">{{ itemCountLabel }}</p>
        <p v-if="!open" class="c-summary__total">{{ format(cart.total) }}</p>
        <p v-if="!open && appliedPromotion" class="c-summary__promo">
            <IconTag />
            <span class="c-summary__promo-label">{{ appliedPromotion }}</span>
        </p>

        <button
            v-if="props.collapsible"
            class="c-summary__toggle"
            type="button"
            :aria-expanded="open"
            aria-controls="checkout-summary-body"
            @click="open = !open"
        >
            <span class="c-summary__toggle-label">{{ open ? t('summary.toggleHide') : t('summary.toggleShow') }}</span>
            <IconChevronDown />
        </button>

        <div v-show="open" class="c-summary__body" id="checkout-summary-body">
            <ul v-if="plainItems.length > 0" class="c-summary__items">
                <li v-for="item in plainItems" :key="item.id" class="c-summary__item">
                    <CartLineItem :item="item" />
                </li>
            </ul>

            <SubscriptionGroup v-for="group in cart.subscriptionGroups" :key="group.key" :group="group" />

            <PromotionInput v-if="cart.promotionsSupported" />
            <PriceTotals />
        </div>
    </section>
</template>
