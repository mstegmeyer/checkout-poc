<script setup lang="ts">
import { computed } from 'vue';
import SelectInput from '@/components/form/SelectInput.vue';
import { t } from '@/i18n';
import type { Country } from '@/api/types';

/**
 * Country picker. Changing the country is a *context change* (it drives taxes,
 * shipping availability and cart totals), so the parent PATCHes the context —
 * this component only reports the new id.
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        countries: Country[];
        error?: string;
        disabled?: boolean;
        /** Overridable so a second (billing) fieldset gets its own control id. */
        id?: string;
    }>(),
    { id: 'checkout-country' },
);

const emit = defineEmits<{ 'update:modelValue': [string]; change: [string] }>();

const options = computed(() =>
    props.countries.map((country) => ({ value: country.id, label: country.translated?.name ?? country.name })),
);
</script>

<template>
    <SelectInput
        :id="props.id"
        class="c-country-select"
        :label="t('address.country')"
        :model-value="props.modelValue"
        :options="options"
        :placeholder="t('address.countryPlaceholder')"
        :error="props.error"
        :disabled="props.disabled"
        @update:model-value="emit('update:modelValue', $event)"
        @change="emit('change', $event)"
    />
</template>
