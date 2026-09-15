<script setup lang="ts">
/**
 * Address autocomplete suggestion list (Figma 444:1795).
 *
 * PRESENTATIONAL ONLY — there is no autocomplete service in this checkout yet.
 * The component renders nothing unless it is explicitly opened *and* handed
 * suggestions, so it is inert in production while the styling for the eventual
 * integration already exists. Whoever wires a provider up later only has to
 * feed `open` / `suggestions` and listen for `select`.
 */
export interface AddressSuggestion {
    /** Full suggestion text. */
    label: string;
    /** Leading part of `label` that matched the query — rendered bold. */
    match?: string;
}

const props = withDefaults(
    defineProps<{
        open?: boolean;
        suggestions?: AddressSuggestion[];
        listId?: string;
    }>(),
    { open: false, suggestions: () => [], listId: 'checkout-street-suggestions' },
);

const emit = defineEmits<{ select: [AddressSuggestion] }>();

/** Everything after the highlighted prefix. */
function rest(suggestion: AddressSuggestion): string {
    const match = suggestion.match;
    if (!match || !suggestion.label.startsWith(match)) return suggestion.label;
    return suggestion.label.slice(match.length);
}
</script>

<template>
    <div v-if="props.open && props.suggestions.length > 0" class="c-autocomplete">
        <ul class="c-autocomplete__list" :id="props.listId" role="listbox">
            <li v-for="suggestion in props.suggestions" :key="suggestion.label" class="c-autocomplete__item">
                <button class="c-autocomplete__option" type="button" role="option" @click="emit('select', suggestion)">
                    <b v-if="suggestion.match" class="c-autocomplete__match">{{ suggestion.match }}</b>{{ rest(suggestion) }}
                </button>
            </li>
        </ul>
    </div>
</template>
