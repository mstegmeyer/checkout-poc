import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { readBootstrapFromDom, setBootstrap } from '@/bootstrap';
import { setLocale } from '@/i18n';
import { useSessionStore } from '@/stores/session';
import '@/styles/base.css';

/**
 * Entry point of the bundle (built to `dist/checkout.js`).
 *
 * The Shopware app template renders
 *   <div id="checkout-app" data-bootstrap='{…}'></div>
 * and loads this module — everything else follows from that attribute.
 */
function mount(): void {
    const { element, config } = readBootstrapFromDom();

    setBootstrap(config);
    setLocale(config.locale);

    const app = createApp(App);
    app.use(createPinia());

    // Hand the (rotating) context token ownership to the API client.
    useSessionStore().install();

    app.mount(element);
}

try {
    mount();
} catch (error) {
    // Fail loudly: a broken bootstrap cannot be recovered from at runtime.
    console.error(error);
    const target = document.querySelector('#checkout-app');
    if (target) {
        target.setAttribute('data-checkout-error', 'bootstrap-failed');
    }
    throw error;
}
