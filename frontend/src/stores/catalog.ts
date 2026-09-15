import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { fetchCountries, fetchCountryStates } from '@/api/endpoints/catalog';
import type { Country, CountryState } from '@/api/types';

/** Countries (and, when required, their states) for the address form. */
export const useCatalogStore = defineStore('catalog', () => {
    const countries = ref<Country[]>([]);
    const statesByCountry = ref<Record<string, CountryState[]>>({});
    const loading = ref(false);

    async function loadCountries(): Promise<Country[]> {
        loading.value = true;
        try {
            countries.value = await fetchCountries();
            return countries.value;
        } finally {
            loading.value = false;
        }
    }

    /** Lazily loads the states of a country — only called when they are forced. */
    async function loadStates(countryId: string): Promise<CountryState[]> {
        if (statesByCountry.value[countryId]) {
            return statesByCountry.value[countryId];
        }
        const states = await fetchCountryStates(countryId);
        statesByCountry.value = { ...statesByCountry.value, [countryId]: states };
        return states;
    }

    function countryById(countryId: string | null | undefined): Country | null {
        if (!countryId) return null;
        return countries.value.find((country) => country.id === countryId) ?? null;
    }

    function statesFor(countryId: string | null | undefined): CountryState[] {
        if (!countryId) return [];
        return statesByCountry.value[countryId] ?? [];
    }

    const hasCountries = computed(() => countries.value.length > 0);

    return { countries, statesByCountry, loading, loadCountries, loadStates, countryById, statesFor, hasCountries };
});
