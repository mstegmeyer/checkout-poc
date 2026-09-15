<script setup lang="ts">
import { t } from '@/i18n';

/** Two-step progress indicator: 1 Shipping → 2 Payment. */
const props = defineProps<{ current: number }>();

const steps = [
    { index: 1, label: 'step.address.label' },
    { index: 2, label: 'step.payment.label' },
] as const;
</script>

<template>
    <nav class="c-steps" :aria-label="t('step.of', { current: props.current, total: steps.length })">
        <ol class="c-steps__list">
            <li
                v-for="step in steps"
                :key="step.index"
                class="c-steps__item"
                :class="{
                    'c-steps__item--current': step.index === props.current,
                    'c-steps__item--done': step.index < props.current,
                }"
                :aria-current="step.index === props.current ? 'step' : undefined"
            >
                <span class="c-steps__number">{{ step.index }}</span>
                <span class="c-steps__label">{{ t(step.label) }}</span>
            </li>
        </ol>
    </nav>
</template>
