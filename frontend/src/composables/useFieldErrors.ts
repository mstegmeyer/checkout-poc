import { computed, type Ref } from 'vue';

/**
 * Reads field messages out of a pointer-keyed error record
 * (`{"/billingAddress/street": "Please enter …"}`) as produced by
 * `fieldMessages()` in `i18n/violations.ts`.
 */
export function useFieldErrors(errors: Readonly<Ref<Record<string, string>>>) {
    const has = computed(() => Object.keys(errors.value).length > 0);

    const messageFor = (pointer: string): string | undefined => errors.value[pointer];

    const hasError = (pointer: string): boolean => Boolean(errors.value[pointer]);

    /** Errors whose pointer is not bound to a rendered field. */
    const unmatched = (knownPointers: string[]): string[] =>
        Object.entries(errors.value)
            .filter(([pointer]) => !knownPointers.includes(pointer))
            .map(([, message]) => message);

    return { has, messageFor, hasError, unmatched };
}
