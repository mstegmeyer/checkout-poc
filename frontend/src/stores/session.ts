import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { connectTokenSink } from '@/api/client';
import { fetchContext } from '@/api/endpoints/context';
import { useBootstrap } from '@/bootstrap';
import type { SalesChannelContext } from '@/api/types';

/**
 * Owns the session-level state: the context token (header mode only) and the
 * last known sales channel context.
 *
 * In session mode there is no token here at all — the storefront PHP session
 * holds it and the store-api reads it from the session cookie. In header mode
 * the token rotates and is *written* exclusively by `api/client.ts` through the
 * sink installed in `install()`.
 */
export const useSessionStore = defineStore('session', () => {
    const config = useBootstrap();

    const contextToken = ref(config.contextToken);
    const context = ref<SalesChannelContext | null>(null);

    /**
     * Called once during boot: makes the client push rotated tokens in here.
     *
     * `headerMode` defaults to "a bootstrap token was provided". The Node e2e
     * harness overrides it to true because it manages tokens itself while
     * starting from none.
     */
    function install(options: { headerMode?: boolean } = {}): void {
        connectTokenSink(
            (token) => {
                contextToken.value = token;
            },
            contextToken.value,
            options.headerMode ?? contextToken.value !== '',
        );
    }

    /**
     * `GET /store-api/context`. In header mode without a token this is also what
     * *mints* one — it must happen before any parallel requests, otherwise every
     * concurrent call would create its own cart.
     */
    async function loadContext(): Promise<SalesChannelContext> {
        const loaded = await fetchContext();
        context.value = loaded;
        return loaded;
    }

    const hasToken = computed(() => contextToken.value !== '');
    const shopName = computed(() => config.shopName);
    const storefrontUrl = computed(() => config.storefrontUrl);
    const currencyIso = computed(() => context.value?.currency?.isoCode ?? config.currencyIso);
    const countryId = computed(() => context.value?.shippingLocation?.country?.id ?? null);
    const contextShippingMethodId = computed(() => context.value?.shippingMethod?.id ?? null);
    const contextPaymentMethodId = computed(() => context.value?.paymentMethod?.id ?? null);
    const customer = computed(() => context.value?.customer ?? null);
    /** A customer is attached to the context (guest or account). */
    const isLoggedIn = computed(() => customer.value !== null);
    const isGuest = computed(() => customer.value?.guest === true);

    return {
        contextToken,
        context,
        install,
        loadContext,
        hasToken,
        shopName,
        storefrontUrl,
        currencyIso,
        countryId,
        contextShippingMethodId,
        contextPaymentMethodId,
        customer,
        isLoggedIn,
        isGuest,
    };
});
