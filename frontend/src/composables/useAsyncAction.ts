import { ref, type Ref } from 'vue';
import { globalMessage } from '@/i18n/violations';

/**
 * Wraps an async action with `pending` / `error` state so views never have to
 * hand-roll try/catch. Store actions stay the source of truth; this is purely
 * about local UI state (button spinners, inline alerts).
 */
export interface AsyncAction<TArgs extends unknown[], TResult> {
    run: (...args: TArgs) => Promise<TResult | undefined>;
    pending: Ref<boolean>;
    error: Ref<string | null>;
    reset: () => void;
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
    action: (...args: TArgs) => Promise<TResult>,
): AsyncAction<TArgs, TResult> {
    const pending = ref(false);
    const error = ref<string | null>(null);

    const run = async (...args: TArgs): Promise<TResult | undefined> => {
        pending.value = true;
        error.value = null;
        try {
            return await action(...args);
        } catch (caught) {
            error.value = globalMessage(caught);
            return undefined;
        } finally {
            pending.value = false;
        }
    };

    const reset = (): void => {
        error.value = null;
        pending.value = false;
    };

    return { run, pending, error, reset };
}
