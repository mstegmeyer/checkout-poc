<script setup lang="ts">
import { onMounted } from 'vue';
import CheckoutView from '@/views/CheckoutView.vue';
import { useCheckoutStore } from '@/stores/checkout';

const checkout = useCheckoutStore();

onMounted(() => {
    void checkout.boot();
});
</script>

<template>
    <CheckoutView />
</template>
