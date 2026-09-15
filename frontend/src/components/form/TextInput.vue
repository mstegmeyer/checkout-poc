<script setup lang="ts">
import { computed } from 'vue';
import FormField from '@/components/form/FormField.vue';

const props = withDefaults(
    defineProps<{
        id: string;
        label: string;
        modelValue: string;
        type?: 'text' | 'email' | 'tel' | 'password';
        autocomplete?: string;
        placeholder?: string;
        required?: boolean;
        error?: string;
        hint?: string;
        inputmode?: 'text' | 'email' | 'tel' | 'numeric';
        /** Shown but not editable — e.g. the e-mail of a logged-in account. */
        readonly?: boolean;
    }>(),
    { type: 'text', required: true, readonly: false },
);

const emit = defineEmits<{ 'update:modelValue': [string]; blur: [] }>();

const describedBy = computed(() => {
    if (props.error) return `${props.id}-error`;
    if (props.hint) return `${props.id}-hint`;
    return undefined;
});

function onInput(event: Event): void {
    emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
    <FormField :id="props.id" :label="props.label" :error="props.error" :hint="props.hint" :required="props.required">
        <input
            class="c-input"
            :id="props.id"
            :type="props.type"
            :value="props.modelValue"
            :autocomplete="props.autocomplete"
            :placeholder="props.placeholder"
            :inputmode="props.inputmode"
            :required="props.required"
            :readonly="props.readonly"
            :aria-invalid="Boolean(props.error)"
            :aria-describedby="describedBy"
            @input="onInput"
            @blur="emit('blur')"
        />
    </FormField>
</template>
