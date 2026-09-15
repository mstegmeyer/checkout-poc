<script setup lang="ts">
import { computed } from 'vue';
import IconCard from '@/components/icons/IconCard.vue';
import { t } from '@/i18n';

/**
 * One selectable payment/shipping method. Presentational only — the parent list
 * owns the selection and the resulting context PATCH.
 *
 * The mark on the right is whatever media the shop configured for the method;
 * methods without media fall back to a neutral card glyph. No provider logos
 * are bundled — a "PayPal" row only shows the PayPal mark if the shop's own
 * payment method carries it. `base.css` hides the fallback in shipping lists,
 * where the design shows no icon at all.
 */
const props = withDefaults(
    defineProps<{
        group: string;
        value: string;
        checked: boolean;
        title: string;
        description?: string | null;
        meta?: string | null;
        price?: string | null;
        imageUrl?: string | null;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ select: [string] }>();

const inputId = `${props.group}-${props.value}`;

/**
 * The design prints a free shipping price in the success colour. The list hands
 * the price down as a formatted string, so recognising "free" means comparing
 * against the very label the list used — locale-correct, and it keeps the
 * component's props untouched.
 */
const isFree = computed(() => props.price !== null && props.price === t('shipping.free'));
</script>

<template>
    <div
        class="c-method-card"
        :class="{
            'c-method-card--selected': props.checked,
            'c-method-card--disabled': props.disabled,
        }"
    >
        <input
            class="c-method-card__input"
            type="radio"
            :id="inputId"
            :name="props.group"
            :value="props.value"
            :checked="props.checked"
            :disabled="props.disabled"
            @change="emit('select', props.value)"
        />
        <label class="c-method-card__label" :for="inputId">
            <img v-if="props.imageUrl" class="c-method-card__image" :src="props.imageUrl" :alt="''" />
            <span v-else class="c-method-card__icon" aria-hidden="true"><IconCard /></span>
            <span class="c-method-card__body">
                <span class="c-method-card__title">{{ props.title }}</span>
                <span v-if="props.description" class="c-method-card__description">{{ props.description }}</span>
                <span v-if="props.meta" class="c-method-card__meta">{{ props.meta }}</span>
            </span>
            <span
                v-if="props.price"
                class="c-method-card__price"
                :class="{ 'c-method-card__price--free': isFree }"
                >{{ props.price }}</span
            >
        </label>
    </div>
</template>
