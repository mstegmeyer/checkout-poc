<script setup lang="ts">
import { t } from '@/i18n';

/**
 * Label + control + hint/error wrapper. Every form control in the checkout is
 * wrapped in this so labels, `aria-describedby` and error copy stay consistent.
 */
const props = withDefaults(
    defineProps<{
        id: string;
        label: string;
        error?: string;
        hint?: string;
        required?: boolean;
        markOptional?: boolean;
    }>(),
    { required: true, markOptional: true },
);
</script>

<template>
    <div class="c-field" :class="{ 'c-field--invalid': Boolean(props.error) }">
        <label class="c-field__label" :for="props.id">
            {{ props.label }}
            <span v-if="!props.required && props.markOptional" class="c-field__optional">({{ t('common.optional') }})</span>
        </label>

        <div class="c-field__control">
            <slot />
        </div>

        <p v-if="props.hint && !props.error" class="c-field__hint" :id="`${props.id}-hint`">{{ props.hint }}</p>
        <p v-if="props.error" class="c-field__error" :id="`${props.id}-error`" role="alert">{{ props.error }}</p>
    </div>
</template>
