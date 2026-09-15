import type { ApiErrorItem } from '@/api/errors';
import { ShopwareApiError } from '@/api/errors';
import type { CartError } from '@/api/types';
import { useBootstrap } from '@/bootstrap';
import { t, tryTranslate, type MessageKey } from '@/i18n';

/**
 * Turns machine-readable Shopware errors into human strings.
 *
 * Two different error worlds are handled here:
 *  1. store-api envelope violations — `code: VIOLATION::IS_BLANK_ERROR`,
 *     `detail: VIOLATION::PHONE_NUMBER_IS_BLANK_ERROR`, `source.pointer: /billingAddress/phoneNumber`
 *  2. in-cart notices — `cart.errors[key] = {messageKey: 'shipping-method-blocked', parameters:{name}}`
 *
 * API `detail` strings are snippet keys, never user-facing copy — so they are
 * only used to *pick* a message, never rendered raw.
 */

/** `VIOLATION::*` (from `code` or `detail`) → message key. */
const VIOLATION_MESSAGES: Record<string, MessageKey> = {
    'VIOLATION::IS_BLANK_ERROR': 'violation.blank',
    'VIOLATION::NOT_BLANK': 'violation.blank',
    'VIOLATION::IS_NULL_ERROR': 'violation.blank',
    'VIOLATION::EMAIL_IS_BLANK_ERROR': 'violation.emailBlank',
    'VIOLATION::PHONE_NUMBER_IS_BLANK_ERROR': 'violation.phoneBlank',
    'VIOLATION::FIRST_NAME_IS_BLANK_ERROR': 'violation.firstNameBlank',
    'VIOLATION::LAST_NAME_IS_BLANK_ERROR': 'violation.lastNameBlank',
    'VIOLATION::STREET_IS_BLANK_ERROR': 'violation.streetBlank',
    'VIOLATION::ZIPCODE_IS_BLANK_ERROR': 'violation.zipcodeBlank',
    'VIOLATION::CITY_IS_BLANK_ERROR': 'violation.cityBlank',
    'VIOLATION::COUNTRY_IS_BLANK_ERROR': 'violation.countryBlank',
    'VIOLATION::EMAIL_INVALID': 'violation.email',
    'VIOLATION::INVALID_EMAIL_FORMAT_ERROR': 'violation.email',
    'VIOLATION::TOO_LONG_ERROR': 'violation.tooLong',
    'VIOLATION::TOO_SHORT_ERROR': 'violation.tooShort',
    'VIOLATION::CUSTOMER_EMAIL_NOT_UNIQUE': 'violation.emailNotUnique',
    'VIOLATION::DATA_PROTECTION_NOT_ACCEPTED': 'violation.dataProtection',
};

/**
 * `source.pointer` → message key, used when the code is unspecific.
 *
 * Three pointer shapes reach us: nested ones from `account/register`
 * (`/billingAddress/street`, and `/shippingAddress/street` once a separate
 * billing address is sent) and flat ones from `account/address` /
 * `account/change-profile` (`/street`).
 */
const FIELD_MESSAGES: Record<string, MessageKey> = {
    firstName: 'violation.firstNameBlank',
    lastName: 'violation.lastNameBlank',
    street: 'violation.streetBlank',
    zipcode: 'violation.zipcodeBlank',
    city: 'violation.cityBlank',
    countryId: 'violation.countryBlank',
    countryStateId: 'violation.stateBlank',
    phoneNumber: 'violation.phoneBlank',
};

const POINTER_MESSAGES: Record<string, MessageKey> = {
    '/email': 'violation.emailBlank',
    '/password': 'violation.passwordBlank',
    '/acceptedDataProtection': 'violation.dataProtection',
};

for (const [field, key] of Object.entries(FIELD_MESSAGES)) {
    POINTER_MESSAGES[`/${field}`] = key;
    POINTER_MESSAGES[`/billingAddress/${field}`] = key;
    POINTER_MESSAGES[`/shippingAddress/${field}`] = key;
}

/** Global (non-field) checkout error codes. */
const GLOBAL_MESSAGES: Record<string, MessageKey> = {
    'CHECKOUT__CART_HASH_MISMATCH': 'errors.cartChanged',
    'CHECKOUT__CART_INVALID': 'errors.cartInvalid',
    'CHECKOUT__CART_EMPTY': 'empty.title',
    'CHECKOUT__CUSTOMER_NOT_LOGGED_IN': 'errors.orderFailed',
    'CHECKOUT__PAYMENT_METHOD_UNAVAILABLE': 'errors.selectPayment',
    'CHECKOUT__SHIPPING_METHOD_UNAVAILABLE': 'errors.selectShipping',
    // Session mode fails closed rather than serving a fresh, empty context.
    'FRAMEWORK__ROUTING_SESSION_CONTEXT_NOT_RESOLVABLE': 'errors.sessionContext',
    // `POST /store-api/account/login`
    'CHECKOUT__CUSTOMER_AUTH_BAD_CREDENTIALS': 'account.loginFailed',
    'CHECKOUT__CUSTOMER_AUTH_THROTTLED': 'account.loginThrottled',
    'CHECKOUT__CUSTOMER_OPTIN_NOT_COMPLETED': 'account.loginOptIn',
    'CHECKOUT__CUSTOMER_IS_INACTIVE': 'account.loginInactive',
    // Commercial subscriptions: the bundle headers named an unknown plan/interval.
    'CHECKOUT__PLAN_NOT_FOUND': 'errors.cartInvalid',
    'CHECKOUT__INTERVAL_NOT_FOUND': 'errors.cartInvalid',
};

/** Message for a single field violation. */
export function violationMessage(error: ApiErrorItem): string {
    const byCode = VIOLATION_MESSAGES[error.detail ?? ''] ?? VIOLATION_MESSAGES[error.code];
    if (byCode) {
        // The password is the only field with a minimum length.
        if (byCode === 'violation.tooShort' && error.source?.pointer === '/password') {
            return t('violation.passwordTooShort', { min: useBootstrap().registration.passwordMinLength });
        }
        // A blank error is generic; a pointer-specific message reads better.
        if (byCode === 'violation.blank') {
            const byPointer = POINTER_MESSAGES[error.source?.pointer ?? ''];
            if (byPointer) return t(byPointer);
        }
        return t(byCode);
    }

    const byPointer = POINTER_MESSAGES[error.source?.pointer ?? ''];
    if (byPointer) return t(byPointer);

    return t('violation.invalid');
}

/** Field messages of a failed request, keyed by JSON pointer. */
export function fieldMessages(error: unknown): Record<string, string> {
    if (!(error instanceof ShopwareApiError)) return {};

    const result: Record<string, string> = {};
    for (const [pointer, items] of error.byPointer()) {
        const first = items[0];
        if (first) result[pointer] = violationMessage(first);
    }
    return result;
}

/** Global message for any thrown error — always safe to render. */
export function globalMessage(error: unknown): string {
    if (error instanceof ShopwareApiError) {
        for (const item of error.errors) {
            const key = GLOBAL_MESSAGES[item.code] ?? GLOBAL_MESSAGES[item.detail ?? ''];
            if (key) return t(key);
        }
        if (error.isValidationError) return t('violation.invalid');
        return t('errors.generic');
    }

    if (error instanceof Error && error.name === 'NetworkError') {
        return t('errors.network');
    }

    return t('errors.generic');
}

/**
 * Promotion-related in-cart notices. All of them belong next to the promotion
 * input, never in the general error list:
 * `promotion-not-found`, `promotion-not-eligible`, `promotion-excluded`,
 * `promotion-discount-added`, `promotion-discount-deleted`,
 * `promotion-discount-unknown-condition`, `promotions-on-cart-price-zero-error`
 * and `auto-promotion-not-found` (Core/Checkout/Promotion/Cart/**).
 */
export function isPromotionCartError(error: CartError): boolean {
    const key = error.messageKey ?? error.key ?? '';
    return key.startsWith('promotion') || key.startsWith('auto-promotion');
}

/** Human message for an in-cart notice (`cart.errors` / gateway `errors`). */
export function cartErrorMessage(error: CartError): string {
    const key = error.messageKey ?? error.key ?? '';
    const params = (error.parameters ?? {}) as Record<string, string | number>;

    const translated = tryTranslate(`cart.error.${key}`, params);
    if (translated) return translated;

    // Unknown key: prefer the server-rendered message (already localised by
    // Shopware for cart errors) and fall back to a neutral sentence.
    if (error.message && !error.message.startsWith('VIOLATION::')) return error.message;

    return t('cart.error.fallback');
}
