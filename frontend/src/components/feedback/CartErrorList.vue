<script setup lang="ts">
import { computed } from 'vue';
import Alert from '@/components/feedback/Alert.vue';
import type { CartError } from '@/api/types';
import { cartErrorMessage } from '@/i18n/violations';

/**
 * Renders in-cart notices (`cart.errors`) and gateway errors. Blocking entries
 * become errors, level 10 warnings, everything else an info notice.
 */
const props = defineProps<{ errors: CartError[] }>();

const items = computed(() =>
    props.errors.map((error, index) => ({
        key: error.key ?? `cart-error-${index}`,
        message: cartErrorMessage(error),
        variant: error.block === true ? ('error' as const) : (error.level ?? 0) >= 10 ? ('warning' as const) : ('info' as const),
    })),
);
</script>

<template>
    <ul v-if="items.length > 0" class="c-cart-errors">
        <li v-for="item in items" :key="item.key" class="c-cart-errors__item">
            <Alert :variant="item.variant" :message="item.message" />
        </li>
    </ul>
</template>
