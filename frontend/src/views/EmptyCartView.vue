<script setup lang="ts">
import { useBootstrap } from '@/bootstrap';
import { t } from '@/i18n';

const config = useBootstrap();
</script>

<template>
    <section class="v-empty" aria-labelledby="checkout-empty-heading">
        <h2 class="v-empty__heading" id="checkout-empty-heading">{{ t('empty.title') }}</h2>
        <p class="v-empty__text">{{ t('empty.text') }}</p>
        <p class="v-empty__actions">
            <a class="v-empty__link" :href="config.cartPageUrl">{{ t('empty.backToShop') }}</a>
        </p>
    </section>
</template>
