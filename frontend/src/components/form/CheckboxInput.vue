<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        id: string;
        label: string;
        modelValue: boolean;
        error?: string;
        required?: boolean;
    }>(),
    { required: false },
);

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

function onChange(event: Event): void {
    emit('update:modelValue', (event.target as HTMLInputElement).checked);
}
</script>

<template>
    <div class="c-checkbox" :class="{ 'c-checkbox--invalid': Boolean(props.error) }">
        <input
            class="c-checkbox__input"
            type="checkbox"
            :id="props.id"
            :checked="props.modelValue"
            :required="props.required"
            :aria-invalid="Boolean(props.error)"
            :aria-describedby="props.error ? `${props.id}-error` : undefined"
            @change="onChange"
        />
        <label class="c-checkbox__label" :for="props.id">{{ props.label }}</label>
        <p v-if="props.error" class="c-checkbox__error" :id="`${props.id}-error`" role="alert">{{ props.error }}</p>
    </div>
</template>
