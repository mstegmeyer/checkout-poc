import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { fetchOrderSubscriptions, handlePayment, placeOrder } from '@/api/endpoints/order';
import { useBootstrap } from '@/bootstrap';
import type { Order, Subscription } from '@/api/types';

/** Places the order and hands it over to the payment handler. */
export const useOrderStore = defineStore('order', () => {
    const config = useBootstrap();

    const order = ref<Order | null>(null);
    const redirectUrl = ref<string | null>(null);
    const placing = ref(false);
    /** Subscriptions created from the recurring bundles of the ordered cart. */
    const subscriptions = ref<Subscription[]>([]);

    const orderNumber = computed(() => order.value?.orderNumber ?? null);
    const isPlaced = computed(() => order.value !== null);

    function finishUrl(orderId: string): string {
        return `${config.storefrontUrl}/checkout/finish?orderId=${encodeURIComponent(orderId)}`;
    }

    function errorUrl(orderId: string): string {
        return `${config.storefrontUrl}/checkout/finish?orderId=${encodeURIComponent(orderId)}&paymentFailed=1`;
    }

    /** `POST /store-api/checkout/order` with the current cart hash. */
    async function create(hash: string, customerComment?: string): Promise<Order> {
        placing.value = true;
        subscriptions.value = [];
        try {
            const created = await placeOrder(customerComment ? { hash, customerComment } : { hash });
            order.value = created;
            return created;
        } finally {
            placing.value = false;
        }
    }

    /**
     * `POST /store-api/handle-payment` — always called, also for synchronous
     * handlers. A non-null `redirectUrl` means the browser has to leave the SPA.
     */
    async function pay(orderId: string): Promise<string | null> {
        const result = await handlePayment({
            orderId,
            finishUrl: finishUrl(orderId),
            errorUrl: errorUrl(orderId),
        });

        redirectUrl.value = result?.redirectUrl ?? null;

        if (redirectUrl.value && typeof window !== 'undefined') {
            window.location.assign(redirectUrl.value);
        }

        return redirectUrl.value;
    }

    /**
     * Follow-up read of the subscriptions the order created. Purely informative
     * for the success view, so a failure here never fails the checkout.
     */
    async function loadSubscriptions(orderId: string): Promise<Subscription[]> {
        try {
            subscriptions.value = await fetchOrderSubscriptions(orderId);
        } catch {
            subscriptions.value = [];
        }
        return subscriptions.value;
    }

    /** Order + payment in one go. */
    async function submit(hash: string, customerComment?: string): Promise<Order> {
        const created = await create(hash, customerComment);
        await pay(created.id);
        return created;
    }

    return { order, redirectUrl, placing, subscriptions, orderNumber, isPlaced, create, pay, submit, loadSubscriptions, finishUrl, errorUrl };
});
