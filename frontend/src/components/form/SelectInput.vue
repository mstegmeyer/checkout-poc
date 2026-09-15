<script setup lang="ts">
import { computed } from 'vue';
import FormField from '@/components/form/FormField.vue';

export interface SelectOption {
    value: string;
    label: string;
}

const props = withDefaults(
    defineProps<{
        id: string;
        label: string;
        modelValue: string;
        options: SelectOption[];
        placeholder?: string;
        required?: boolean;
        error?: string;
        hint?: string;
        disabled?: boolean;
    }>(),
    { required: true, disabled: false },
);

const emit = defineEmits<{ 'update:modelValue': [string]; change: [string] }>();

const describedBy = computed(() => {
    if (props.error) return `${props.id}-error`;
    if (props.hint) return `${props.id}-hint`;
    return undefined;
});

function onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    emit('update:modelValue', value);
    emit('change', value);
}
</script>

<template>
    <FormField :id="props.id" :label="props.label" :error="props.error" :hint="props.hint" :required="props.required">
        <select
            class="c-select"
            :id="props.id"
            :value="props.modelValue"
            :required="props.required"
            :disabled="props.disabled"
            :aria-invalid="Boolean(props.error)"
            :aria-describedby="describedBy"
            @change="onChange"
        >
            <option v-if="props.placeholder" value="" disabled>{{ props.placeholder }}</option>
            <option v-for="option in props.options" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
    </FormField>
</template>
