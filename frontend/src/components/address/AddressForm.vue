<script setup lang="ts">
import { computed } from 'vue';
import AddressSuggestions from '@/components/address/AddressSuggestions.vue';
import CountrySelect from '@/components/address/CountrySelect.vue';
import SelectInput from '@/components/form/SelectInput.vue';
import TextInput from '@/components/form/TextInput.vue';
import { useFieldErrors } from '@/composables/useFieldErrors';
import { t } from '@/i18n';
import { useCatalogStore } from '@/stores/catalog';
import { useCheckoutStore } from '@/stores/checkout';
import { useCustomerStore, type AddressScope } from '@/stores/customer';

/**
 * Guest address fieldset. Renders either the *delivery* address (default — a
 * country change PATCHes the context because it drives taxes and shipping) or
 * the separate *billing* address (issue 5 — a plain form field, no phone).
 *
 * Field requirements follow the selected country (`postalCodeRequired`,
 * `forceStateInRegistration`) and the shop's phone number configuration.
 */
const props = withDefaults(
    defineProps<{
        scope?: AddressScope;
        /** Prefix of the control ids; keep the default so existing ids are stable. */
        idPrefix?: string;
        legend?: string;
        /** The inline editor on step 2 drops the legend (the row label carries it). */
        showLegend?: boolean;
    }>(),
    { scope: 'delivery', idPrefix: 'checkout', showLegend: true },
);

const customer = useCustomerStore();
const catalog = useCatalogStore();
const checkout = useCheckoutStore();

const errors = computed(() => customer.fieldErrors);
const { messageFor } = useFieldErrors(errors);

/** The scope never changes for a mounted instance, so this can stay a plain ref. */
const isBilling = props.scope === 'billing';
const fields = customer.fieldsFor(props.scope);
const pointers = computed(() => customer.pointersFor(props.scope));

const legendText = computed(() => props.legend ?? t(isBilling ? 'address.billingTitle' : 'address.title'));
const stateRequired = computed(() => (isBilling ? customer.billingStateRequired : customer.stateRequired));
const zipcodeRequired = computed(() => (isBilling ? customer.billingZipcodeRequired : customer.zipcodeRequired));
/** Only the delivery address carries a phone number. */
const showPhoneNumber = computed(() => !isBilling && customer.showPhoneNumber);

const id = (suffix: string) => `${props.idPrefix}-${suffix}`;

const stateOptions = computed(() =>
    catalog.statesFor(fields.countryId).map((state) => ({ value: state.id, label: state.name })),
);

function onCountryChange(countryId: string): void {
    if (isBilling) {
        void checkout.setBillingCountry(countryId, null);
        return;
    }
    void checkout.setCountry(countryId, null);
}

function onStateChange(countryStateId: string): void {
    if (isBilling) {
        void checkout.setBillingCountry(fields.countryId, countryStateId || null);
        return;
    }
    void checkout.setCountry(fields.countryId, countryStateId || null);
}
</script>

<template>
    <fieldset class="c-address-form" :class="`c-address-form--${props.scope}`">
        <legend class="c-address-form__legend" :class="{ 'c-address-form__legend--hidden': !props.showLegend }">
            {{ legendText }}
        </legend>

        <!-- Field order follows the design: country first (it drives taxes and
             the remaining requirements), then name, address, postal code + city. -->
        <div class="c-address-form__row">
            <CountrySelect
                :id="id('country')"
                :model-value="fields.countryId"
                :countries="catalog.countries"
                :error="messageFor(pointers.countryId)"
                :disabled="checkout.busy"
                @change="onCountryChange"
            />
        </div>

        <div v-if="stateRequired" class="c-address-form__row">
            <SelectInput
                :id="id('country-state')"
                :label="t('address.state')"
                :model-value="fields.countryStateId"
                :options="stateOptions"
                :placeholder="t('address.statePlaceholder')"
                :error="messageFor(pointers.countryStateId)"
                @change="onStateChange"
            />
        </div>

        <div class="c-address-form__row c-address-form__row--split">
            <TextInput
                :id="id('first-name')"
                :label="t('address.firstName')"
                :placeholder="t('address.firstName')"
                v-model="fields.firstName"
                autocomplete="given-name"
                :error="messageFor(pointers.firstName)"
                @blur="customer.clearFieldError(pointers.firstName)"
            />
            <TextInput
                :id="id('last-name')"
                :label="t('address.lastName')"
                :placeholder="t('address.lastName')"
                v-model="fields.lastName"
                autocomplete="family-name"
                :error="messageFor(pointers.lastName)"
                @blur="customer.clearFieldError(pointers.lastName)"
            />
        </div>

        <!-- The suggestion list is styled but inert: no autocomplete provider
             is wired up yet, so it never opens (Figma 444:1795). -->
        <div class="c-address-form__row c-address-form__row--autocomplete">
            <TextInput
                :id="id('street')"
                :label="t('address.street')"
                :placeholder="t('address.street')"
                v-model="fields.street"
                autocomplete="street-address"
                :error="messageFor(pointers.street)"
                @blur="customer.clearFieldError(pointers.street)"
            />
            <AddressSuggestions :list-id="id('street-suggestions')" />
        </div>

        <div class="c-address-form__row">
            <TextInput
                :id="id('additional-address')"
                :label="t('address.additional')"
                :placeholder="t('address.additional')"
                v-model="fields.additionalAddressLine1"
                autocomplete="address-line2"
                :required="false"
            />
        </div>

        <div class="c-address-form__row c-address-form__row--split">
            <TextInput
                :id="id('zipcode')"
                :label="t('address.zipcode')"
                :placeholder="t('address.zipcode')"
                v-model="fields.zipcode"
                autocomplete="postal-code"
                inputmode="text"
                :required="zipcodeRequired"
                :error="messageFor(pointers.zipcode)"
                @blur="customer.clearFieldError(pointers.zipcode)"
            />
            <TextInput
                :id="id('city')"
                :label="t('address.city')"
                :placeholder="t('address.city')"
                v-model="fields.city"
                autocomplete="address-level2"
                :error="messageFor(pointers.city)"
                @blur="customer.clearFieldError(pointers.city)"
            />
        </div>

        <div v-if="showPhoneNumber" class="c-address-form__row">
            <TextInput
                :id="id('phone')"
                type="tel"
                inputmode="tel"
                :label="t('address.phone')"
                :placeholder="t('address.phone')"
                v-model="fields.phoneNumber"
                autocomplete="tel"
                :required="customer.phoneRequired"
                :error="messageFor(pointers.phoneNumber)"
                @blur="customer.clearFieldError(pointers.phoneNumber)"
            />
        </div>
    </fieldset>
</template>
