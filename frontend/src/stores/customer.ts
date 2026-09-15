import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import {
    listAddresses,
    login as loginRequest,
    registerCustomer,
    setDefaultBillingAddress,
    updateProfile,
    upsertAddress,
    type GuestAddressPayload,
} from '@/api/endpoints/customer';
import { useBootstrap } from '@/bootstrap';
import { fieldMessages } from '@/i18n/violations';
import { t } from '@/i18n';
import { useCartStore } from '@/stores/cart';
import { useCatalogStore } from '@/stores/catalog';
import type { Customer, CustomerAddress } from '@/api/types';

/** The address half of the guest form — used for delivery *and* billing. */
export interface AddressFields {
    firstName: string;
    lastName: string;
    street: string;
    zipcode: string;
    city: string;
    countryId: string;
    countryStateId: string;
    phoneNumber: string;
    additionalAddressLine1: string;
}

/** Contact + delivery address. Kept flat for backwards compatibility. */
export interface GuestForm extends AddressFields {
    email: string;
    /**
     * Only rendered and validated while an *account* has to be created
     * (`needsAccountRegistration`). Cleared as soon as the registration went
     * through — it is never part of a snapshot.
     */
    password: string;
}

export type AddressScope = 'delivery' | 'billing';

export type AddressPointers = Record<keyof AddressFields, string>;

function emptyAddress(): AddressFields {
    return {
        firstName: '',
        lastName: '',
        street: '',
        zipcode: '',
        city: '',
        countryId: '',
        countryStateId: '',
        phoneNumber: '',
        additionalAddressLine1: '',
    };
}

/**
 * JSON pointers of `POST /store-api/account/register`.
 *
 * The register route copies the *top-level* `firstName`/`lastName` into
 * `billingAddress` (`RegisterRoute::validateRegistrationData()`), so the billing
 * name fields are reported at `/firstName` and `/lastName`, while a separate
 * `shippingAddress` keeps its own `/shippingAddress/firstName` pointers.
 */
const BILLING_POINTERS: AddressPointers = {
    firstName: '/firstName',
    lastName: '/lastName',
    street: '/billingAddress/street',
    zipcode: '/billingAddress/zipcode',
    city: '/billingAddress/city',
    countryId: '/billingAddress/countryId',
    countryStateId: '/billingAddress/countryStateId',
    phoneNumber: '/billingAddress/phoneNumber',
    additionalAddressLine1: '/billingAddress/additionalAddressLine1',
};

const SHIPPING_POINTERS: AddressPointers = {
    firstName: '/shippingAddress/firstName',
    lastName: '/shippingAddress/lastName',
    street: '/shippingAddress/street',
    zipcode: '/shippingAddress/zipcode',
    city: '/shippingAddress/city',
    countryId: '/shippingAddress/countryId',
    countryStateId: '/shippingAddress/countryStateId',
    phoneNumber: '/shippingAddress/phoneNumber',
    additionalAddressLine1: '/shippingAddress/additionalAddressLine1',
};

/**
 * Default pointer map — what the server reports while billing mirrors delivery
 * (the historical, and still most common, shape). Exported for the views.
 */
export const POINTERS = {
    email: '/email',
    password: '/password',
    ...BILLING_POINTERS,
} as const;

/** `firstName` → `/firstName`, as returned by the address / profile routes. */
const FLAT_POINTERS = Object.fromEntries(
    (Object.keys(emptyAddress()) as (keyof AddressFields)[]).map((key) => [key, `/${key}`]),
) as AddressPointers;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ADDRESS_KEYS = Object.keys(emptyAddress()) as (keyof AddressFields)[];

function trimAddress(source: AddressFields): AddressFields {
    return {
        firstName: source.firstName.trim(),
        lastName: source.lastName.trim(),
        street: source.street.trim(),
        zipcode: source.zipcode.trim(),
        city: source.city.trim(),
        countryId: source.countryId,
        countryStateId: source.countryStateId,
        phoneNumber: source.phoneNumber.trim(),
        additionalAddressLine1: source.additionalAddressLine1.trim(),
    };
}

function sameAddress(a: AddressFields, b: AddressFields): boolean {
    return ADDRESS_KEYS.every((key) => a[key] === b[key]);
}

function addressPayload(fields: AddressFields): GuestAddressPayload {
    return {
        firstName: fields.firstName,
        lastName: fields.lastName,
        street: fields.street,
        zipcode: fields.zipcode || undefined,
        city: fields.city,
        countryId: fields.countryId,
        countryStateId: fields.countryStateId || undefined,
        phoneNumber: fields.phoneNumber || undefined,
        additionalAddressLine1: fields.additionalAddressLine1 || undefined,
    };
}

/** A stored customer address, as the form fields. */
function fieldsFromAddress(address: CustomerAddress | null | undefined, fallback: { firstName: string; lastName: string }): AddressFields {
    return {
        firstName: address?.firstName ?? fallback.firstName,
        lastName: address?.lastName ?? fallback.lastName,
        street: address?.street ?? '',
        zipcode: address?.zipcode ?? '',
        city: address?.city ?? '',
        countryId: address?.countryId ?? '',
        countryStateId: address?.countryStateId ?? '',
        phoneNumber: address?.phoneNumber ?? '',
        additionalAddressLine1: address?.additionalAddressLine1 ?? '',
    };
}

/** Everything that was last handed to the server — the diff base of `submit()`. */
interface Snapshot {
    email: string;
    delivery: AddressFields;
    /** Equals `delivery` while the billing toggle is on. */
    billing: AddressFields;
    billingSame: boolean;
}

/**
 * Contact + delivery/billing address, their validation, and the single
 * `submit()` that decides between *registering* and *updating* the customer.
 *
 * The customer is a guest — the checkout's whole premise — with one exception:
 * a cart with recurring bundles. The commercial subscription plugin refuses
 * guests (`guest-customer-not-allowed`), so such a cart creates a real account
 * (password) instead, or the shopper logs into an existing one.
 */
export const useCustomerStore = defineStore('customer', () => {
    const config = useBootstrap();
    const catalog = useCatalogStore();
    const cart = useCartStore();

    const form = reactive<GuestForm>({ email: '', password: '', ...emptyAddress() });
    /** Separate billing address; only used while `billingSameAsDelivery` is off. */
    const billing = reactive<AddressFields>(emptyAddress());
    const billingSameAsDelivery = ref(true);

    /** Pointer → human message, filled by client-side and server-side checks. */
    const fieldErrors = ref<Record<string, string>>({});
    const customer = ref<Customer | null>(null);
    const doubleOptInPending = ref(false);
    const registering = ref(false);
    const updating = ref(false);
    const loggingIn = ref(false);

    /**
     * True once a customer is attached — registered here, logged in here, or
     * brought along from the storefront session. Never register twice.
     * (Historical name from the guest-only days; the value covers accounts too.)
     */
    const hasGuestAccount = ref(false);
    const lastSubmitted = ref<Snapshot | null>(null);
    const addressIds = ref<{ billingId: string; shippingId: string } | null>(null);
    /**
     * Whether the last `submit()` actually changed anything server-side. The
     * checkout store uses it to skip the cart + gateway refetch on a no-op.
     */
    const lastSubmitMutated = ref(false);

    const selectedCountry = computed(() => catalog.countryById(form.countryId));
    const billingCountry = computed(() => catalog.countryById(billing.countryId));
    const zipcodeRequired = computed(() => selectedCountry.value?.postalCodeRequired !== false);
    const stateRequired = computed(() => selectedCountry.value?.forceStateInRegistration === true);
    const billingZipcodeRequired = computed(() => billingCountry.value?.postalCodeRequired !== false);
    const billingStateRequired = computed(() => billingCountry.value?.forceStateInRegistration === true);
    const showPhoneNumber = computed(() => config.registration.showPhoneNumber);
    const phoneRequired = computed(() => config.registration.phoneNumberRequired);
    const passwordMinLength = computed(() => config.registration.passwordMinLength);
    const isRegistered = computed(() => customer.value !== null && doubleOptInPending.value === false);

    /** The attached customer is a full account (logged in, or created here). */
    const isAccount = computed(() => customer.value !== null && customer.value.guest === false);
    const isGuest = computed(() => customer.value?.guest === true);

    /** Recurring bundles in the cart: the plugin refuses guests for those. */
    const accountRequired = computed(() => cart.hasSubscriptions);
    /**
     * The next `submit()` has to create an account: the cart needs one and the
     * attached customer (if any) is only a guest. Drives the password field.
     */
    const needsAccountRegistration = computed(() => accountRequired.value && !isAccount.value);

    /**
     * Pointer maps per fieldset. They follow the toggle: with a separate billing
     * address the register payload sends the *delivery* address as
     * `shippingAddress`, so the delivery fields move to `/shippingAddress/*`.
     */
    const billingPointers = computed<AddressPointers>(() => BILLING_POINTERS);
    const deliveryPointers = computed<AddressPointers>(() =>
        billingSameAsDelivery.value ? BILLING_POINTERS : SHIPPING_POINTERS,
    );

    function pointersFor(scope: AddressScope): AddressPointers {
        return scope === 'billing' ? billingPointers.value : deliveryPointers.value;
    }

    function fieldsFor(scope: AddressScope): AddressFields {
        return scope === 'billing' ? billing : form;
    }

    function clearFieldError(pointer: string): void {
        if (!(pointer in fieldErrors.value)) return;
        const next = { ...fieldErrors.value };
        delete next[pointer];
        fieldErrors.value = next;
    }

    function resetFieldErrors(): void {
        fieldErrors.value = {};
    }

    /** Client-side pre-flight so the obvious mistakes never hit the server. */
    function validate(): boolean {
        const errors: Record<string, string> = {};

        if (form.email.trim() === '') {
            errors[POINTERS.email] = t('violation.emailBlank');
        } else if (!EMAIL_PATTERN.test(form.email.trim())) {
            errors[POINTERS.email] = t('violation.email');
        }

        if (needsAccountRegistration.value) {
            if (form.password === '') {
                errors[POINTERS.password] = t('violation.passwordBlank');
            } else if (form.password.length < passwordMinLength.value) {
                errors[POINTERS.password] = t('violation.passwordTooShort', { min: passwordMinLength.value });
            }
        }

        const delivery = deliveryPointers.value;
        if (form.firstName.trim() === '') errors[delivery.firstName] = t('violation.firstNameBlank');
        if (form.lastName.trim() === '') errors[delivery.lastName] = t('violation.lastNameBlank');
        if (form.street.trim() === '') errors[delivery.street] = t('violation.streetBlank');
        if (form.city.trim() === '') errors[delivery.city] = t('violation.cityBlank');
        if (form.countryId === '') errors[delivery.countryId] = t('violation.countryBlank');
        if (zipcodeRequired.value && form.zipcode.trim() === '') errors[delivery.zipcode] = t('violation.zipcodeBlank');
        if (stateRequired.value && form.countryStateId === '') errors[delivery.countryStateId] = t('violation.stateBlank');
        if (phoneRequired.value && form.phoneNumber.trim() === '') errors[delivery.phoneNumber] = t('violation.phoneBlank');

        if (!billingSameAsDelivery.value) {
            const target = billingPointers.value;
            if (billing.firstName.trim() === '') errors[target.firstName] = t('violation.firstNameBlank');
            if (billing.lastName.trim() === '') errors[target.lastName] = t('violation.lastNameBlank');
            if (billing.street.trim() === '') errors[target.street] = t('violation.streetBlank');
            if (billing.city.trim() === '') errors[target.city] = t('violation.cityBlank');
            if (billing.countryId === '') errors[target.countryId] = t('violation.countryBlank');
            if (billingZipcodeRequired.value && billing.zipcode.trim() === '') {
                errors[target.zipcode] = t('violation.zipcodeBlank');
            }
            if (billingStateRequired.value && billing.countryStateId === '') {
                errors[target.countryStateId] = t('violation.stateBlank');
            }
        }

        fieldErrors.value = errors;
        return Object.keys(errors).length === 0;
    }

    function snapshot(): Snapshot {
        const delivery = trimAddress(form);
        return {
            email: form.email.trim(),
            delivery,
            billing: billingSameAsDelivery.value ? { ...delivery } : trimAddress(billing),
            billingSame: billingSameAsDelivery.value,
        };
    }

    /**
     * Translates the field violations of a request into the pointers the form
     * actually renders. The register route reports nested pointers, the address
     * and profile routes flat ones (`/street`) — both end up on the right field.
     */
    function applyViolations(error: unknown, target?: AddressPointers): boolean {
        const messages = fieldMessages(error);
        if (Object.keys(messages).length === 0) return false;

        const mapped: Record<string, string> = {};
        for (const [pointer, message] of Object.entries(messages)) {
            mapped[remapPointer(pointer, target)] = message;
        }
        fieldErrors.value = mapped;
        return true;
    }

    function remapPointer(pointer: string, target?: AddressPointers): string {
        if (target) {
            const key = ADDRESS_KEYS.find((candidate) => FLAT_POINTERS[candidate] === pointer);
            if (key) return target[key];
            return pointer;
        }
        // Register route: the copied billing names are reported twice — keep the
        // message on the field the shopper can actually see.
        if (pointer === '/billingAddress/firstName') return billingPointers.value.firstName;
        if (pointer === '/billingAddress/lastName') return billingPointers.value.lastName;
        return pointer;
    }

    function adoptCustomer(result: Customer): void {
        customer.value = result;
        doubleOptInPending.value = result.doubleOptInRegistration === true;
        const shippingId = result.defaultShippingAddressId ?? result.activeShippingAddress?.id ?? null;
        const billingId = result.defaultBillingAddressId ?? result.activeBillingAddress?.id ?? shippingId;
        addressIds.value = shippingId && billingId ? { billingId, shippingId } : null;
    }

    /**
     * Takes over a customer that already exists on the context — the shopper
     * logged in here, or arrived from the storefront with a customer attached.
     * Prefills the form from the active addresses and records it as the last
     * submitted state, so the next `submit()` diffs against it instead of
     * registering a second customer.
     */
    function adoptExisting(existing: Customer): void {
        adoptCustomer(existing);
        hasGuestAccount.value = true;

        const shipping = existing.activeShippingAddress ?? existing.activeBillingAddress ?? null;
        const billingAddress = existing.activeBillingAddress ?? shipping;
        const names = { firstName: existing.firstName, lastName: existing.lastName };

        form.email = existing.email;
        form.password = '';
        Object.assign(form, fieldsFromAddress(shipping, names));

        const mirrored = !shipping || !billingAddress || (shipping.id !== undefined && shipping.id === billingAddress.id);
        billingSameAsDelivery.value = mirrored;
        Object.assign(billing, mirrored ? emptyAddress() : fieldsFromAddress(billingAddress, names));

        fieldErrors.value = {};
        lastSubmitted.value = snapshot();
        lastSubmitMutated.value = false;
    }

    /**
     * `POST /store-api/account/register` — as a guest, or as an account when the
     * cart demands one. Token rotation is handled by the client; the cart
     * follows the new token server-side.
     */
    async function doRegister(next: Snapshot): Promise<boolean> {
        const asAccount = needsAccountRegistration.value;
        registering.value = true;
        try {
            const result = await registerCustomer({
                email: next.email,
                // The account name is the *billing* name — that is what the
                // register route copies into the billing address.
                firstName: next.billing.firstName,
                lastName: next.billing.lastName,
                storefrontUrl: config.storefrontUrl,
                acceptedDataProtection: true,
                billingAddress: addressPayload(next.billing),
                ...(next.billingSame ? {} : { shippingAddress: addressPayload(next.delivery) }),
                guest: !asAccount,
                ...(asAccount ? { password: form.password } : {}),
            });

            adoptCustomer(result);
            form.password = '';
            hasGuestAccount.value = true;
            lastSubmitted.value = next;
            lastSubmitMutated.value = true;
            return true;
        } catch (error) {
            applyViolations(error);
            throw error;
        } finally {
            registering.value = false;
        }
    }

    /** Last resort when a register response carried no address ids. */
    async function ensureAddressIds(): Promise<{ billingId: string; shippingId: string } | null> {
        if (addressIds.value) return { ...addressIds.value };
        const addresses = await listAddresses();
        const first = addresses[0]?.id;
        if (!first) return null;
        addressIds.value = { billingId: first, shippingId: first };
        return { ...addressIds.value };
    }

    /**
     * Updates the existing customer through the routes that allow guest
     * sessions: `change-profile` for the names, `account/address`
     * (+ `default-billing`) for the addresses. `change-email` is *not*
     * guest-allowed, so a changed e-mail is handled by `doRegister()` instead.
     */
    async function doUpdate(
        next: Snapshot,
        previous: Snapshot,
        flags: { namesChanged: boolean; deliveryChanged: boolean; billingChanged: boolean },
    ): Promise<boolean> {
        updating.value = true;
        try {
            if (flags.namesChanged) {
                try {
                    await updateProfile({ firstName: next.billing.firstName, lastName: next.billing.lastName });
                } catch (error) {
                    applyViolations(error, billingPointers.value);
                    throw error;
                }
            }

            const ids = await ensureAddressIds();
            if (!ids) {
                // No address to update — fall back to a fresh registration.
                return await doRegister(next);
            }

            let addressesChanged = false;
            const mirroredBefore = ids.billingId === ids.shippingId;

            if (flags.deliveryChanged || (previous.billingSame && !next.billingSame && mirroredBefore)) {
                try {
                    await upsertAddress(addressPayload(next.delivery), ids.shippingId);
                } catch (error) {
                    applyViolations(error, deliveryPointers.value);
                    throw error;
                }
                addressesChanged = true;
            }

            if (!next.billingSame) {
                if (mirroredBefore) {
                    // Billing used to mirror delivery — it needs its own record.
                    let created;
                    try {
                        created = await upsertAddress(addressPayload(next.billing), null);
                    } catch (error) {
                        applyViolations(error, billingPointers.value);
                        throw error;
                    }
                    if (created?.id) {
                        await setDefaultBillingAddress(created.id);
                        ids.billingId = created.id;
                    }
                    addressesChanged = true;
                } else if (flags.billingChanged) {
                    try {
                        await upsertAddress(addressPayload(next.billing), ids.billingId);
                    } catch (error) {
                        applyViolations(error, billingPointers.value);
                        throw error;
                    }
                    addressesChanged = true;
                }
            } else if (!mirroredBefore) {
                // Toggled back on: point the billing default at the delivery address.
                await setDefaultBillingAddress(ids.shippingId);
                ids.billingId = ids.shippingId;
                addressesChanged = true;
            }

            addressIds.value = { ...ids };
            lastSubmitted.value = next;
            lastSubmitMutated.value = flags.namesChanged || addressesChanged;
            return true;
        } finally {
            updating.value = false;
        }
    }

    /**
     * Persists the contact + address data.
     *
     * First call registers the customer. Every later call *diffs* against the
     * last submitted values so re-entering step 1 never creates a second
     * customer:
     *  - nothing changed → no request at all
     *  - names / addresses changed → `change-profile` + the address routes
     *  - e-mail changed → re-register (guests cannot use `change-email`); an
     *    account keeps its e-mail — re-registering would create a second account
     *  - the cart started to need an account while only a guest is attached →
     *    register again, as an account (a guest cannot be upgraded in place)
     *
     * Returns `false` when client-side validation failed, throws on API errors
     * (field violations are additionally exposed via `fieldErrors`).
     */
    async function submit(): Promise<boolean> {
        if (!validate()) return false;

        const next = snapshot();
        const previous = lastSubmitted.value;
        lastSubmitMutated.value = false;

        if (!hasGuestAccount.value || previous === null) {
            return await doRegister(next);
        }

        if (needsAccountRegistration.value) {
            return await doRegister(next);
        }

        if (previous.email !== next.email) {
            if (isAccount.value) {
                fieldErrors.value = { ...fieldErrors.value, [POINTERS.email]: t('account.emailLocked') };
                return false;
            }
            return await doRegister(next);
        }

        const flags = {
            namesChanged:
                previous.billing.firstName !== next.billing.firstName ||
                previous.billing.lastName !== next.billing.lastName,
            deliveryChanged: !sameAddress(previous.delivery, next.delivery),
            billingChanged: !sameAddress(previous.billing, next.billing) || previous.billingSame !== next.billingSame,
        };

        if (!flags.namesChanged && !flags.deliveryChanged && !flags.billingChanged) {
            return true;
        }

        return await doUpdate(next, previous, flags);
    }

    /**
     * `POST /store-api/account/login`. Only the request — the caller reloads the
     * context and hands the resulting customer to `adoptExisting()`, because the
     * login response carries nothing but the new token.
     */
    async function login(email: string, password: string): Promise<void> {
        loggingIn.value = true;
        try {
            await loginRequest(email.trim(), password);
        } finally {
            loggingIn.value = false;
        }
    }

    return {
        form,
        billing,
        billingSameAsDelivery,
        fieldErrors,
        customer,
        doubleOptInPending,
        registering,
        updating,
        loggingIn,
        hasGuestAccount,
        addressIds,
        lastSubmitMutated,
        selectedCountry,
        billingCountry,
        zipcodeRequired,
        stateRequired,
        billingZipcodeRequired,
        billingStateRequired,
        showPhoneNumber,
        phoneRequired,
        passwordMinLength,
        isRegistered,
        isAccount,
        isGuest,
        accountRequired,
        needsAccountRegistration,
        deliveryPointers,
        billingPointers,
        pointersFor,
        fieldsFor,
        clearFieldError,
        resetFieldErrors,
        validate,
        submit,
        login,
        adoptExisting,
        /** Historical name of `submit()` — kept so callers stay untouched. */
        register: submit,
    };
});
