<script setup lang="ts">
import { computed } from 'vue';
import { useMoney } from '@/composables/useMoney';
import { t } from '@/i18n';
import type { LineItem } from '@/api/types';

const props = defineProps<{ item: LineItem }>();

const { format } = useMoney();

/** Prefer a small thumbnail; fall back to the original media url. */
const imageUrl = computed(() => {
    const thumbnails = props.item.cover?.thumbnails ?? [];
    const sorted = [...thumbnails].sort((a, b) => a.width - b.width);
    const preferred = sorted.find((thumbnail) => thumbnail.width >= 100) ?? sorted[0];
    return preferred?.url ?? props.item.cover?.url ?? null;
});

const options = computed(() => props.item.payload?.options ?? []);
</script>

<template>
    <article class="c-line-item">
        <img v-if="imageUrl" class="c-line-item__image" :src="imageUrl" :alt="props.item.cover?.alt ?? ''" />
        <div class="c-line-item__body">
            <h4 class="c-line-item__label">{{ props.item.label }}</h4>
            <p v-if="options.length > 0" class="c-line-item__options">
                <span v-for="option in options" :key="`${option.group}-${option.option}`" class="c-line-item__option">
                    {{ option.group }}: {{ option.option }}
                </span>
            </p>
            <p class="c-line-item__quantity">{{ t('summary.quantity', { quantity: props.item.quantity }) }}</p>
        </div>
        <p class="c-line-item__price">{{ format(props.item.price.totalPrice) }}</p>
    </article>
</template>
