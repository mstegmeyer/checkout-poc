import { createPinia, setActivePinia } from 'pinia';
import { setBootstrap, type BootstrapConfig } from '@/bootstrap';
import { setLocale } from '@/i18n';
import { getContextToken } from '@/api/client';
import { addLineItems } from '@/api/endpoints/cart';
import { findSellableProducts } from '@/api/endpoints/catalog';
import { useCartStore } from '@/stores/cart';
import { useCatalogStore } from '@/stores/catalog';
import { useCheckoutStore } from '@/stores/checkout';
import { useCustomerStore } from '@/stores/customer';
import { useOrderStore } from '@/stores/order';
import { useSessionStore } from '@/stores/session';

/**
 * Node-side entry used by `scripts/e2e-api.mjs`: boots the real stores against a
 * live Shopware instance, without a DOM. Not part of the browser bundle.
 */
export function createHeadlessCheckout(config: Partial<BootstrapConfig> & { accessKey: string; storefrontUrl: string }) {
    const full: BootstrapConfig = {
        accessKey: config.accessKey,
        contextToken: config.contextToken ?? '',
        apiBase: (config.apiBase ?? '').replace(/\/+$/, ''),
        storefrontUrl: config.storefrontUrl.replace(/\/+$/, ''),
        shopName: config.shopName ?? 'E2E Shop',
        currencyIso: config.currencyIso ?? 'EUR',
        locale: config.locale ?? 'en-GB',
        cartPageUrl: config.cartPageUrl ?? `${config.storefrontUrl.replace(/\/+$/, '')}/checkout/cart`,
        homeUrl: config.homeUrl ?? config.storefrontUrl.replace(/\/+$/, ''),
        registration: {
            showPhoneNumber: config.registration?.showPhoneNumber ?? true,
            phoneNumberRequired: config.registration?.phoneNumberRequired ?? false,
            requireDataProtection: config.registration?.requireDataProtection ?? false,
            passwordMinLength: config.registration?.passwordMinLength ?? 8,
        },
        subscription: config.subscription ?? null,
    };

    setBootstrap(full);
    setLocale(full.locale);
    setActivePinia(createPinia());

    const session = useSessionStore();
    // No browser, no session cookie: this harness owns the token itself and
    // mints one on its first call.
    session.install({ headerMode: true });

    return {
        config: full,
        session,
        cart: useCartStore(),
        catalog: useCatalogStore(),
        checkout: useCheckoutStore(),
        customer: useCustomerStore(),
        order: useOrderStore(),
        getContextToken,
        addLineItems,
        findSellableProducts,
    };
}

export { ShopwareApiError } from '@/api/errors';
