<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        variant?: 'info' | 'success' | 'warning' | 'error';
        message?: string;
        title?: string;
    }>(),
    { variant: 'info' },
);
</script>

<template>
    <div
        class="c-alert"
        :class="`c-alert--${props.variant}`"
        :role="props.variant === 'error' ? 'alert' : 'status'"
    >
        <p v-if="props.title" class="c-alert__title">{{ props.title }}</p>
        <p v-if="props.message" class="c-alert__message">{{ props.message }}</p>
        <slot />
    </div>
</template>
