import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Production build contract (the Shopware app template hardcodes these names):
 *   dist/checkout.js   – ES module, mounts onto #checkout-app
 *   dist/checkout.css  – single stylesheet (no code splitting)
 *
 * Fixed filenames (no hashes) keep the bundle URL stable for the CDN/app config.
 */
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        target: 'es2020',
        cssCodeSplit: false,
        assetsDir: '.',
        emptyOutDir: true,
        rollupOptions: {
            // Build the JS entry directly (not index.html) so nothing but the
            // bundle + stylesheet ends up in dist/.
            input: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
            output: {
                format: 'es',
                inlineDynamicImports: true,
                entryFileNames: 'checkout.js',
                assetFileNames: 'checkout.[ext]',
            },
        },
    },
    server: {
        port: 5173,
        /**
         * Dev harness only: with `?proxy=1` the harness sets `apiBase` to '' and
         * store-api calls go through this same-origin proxy. Needed because the
         * shop's CORS allow-list does not cover headers plugins add (the
         * commercial subscription headers), so a cross-origin harness cannot
         * exercise those routes directly. Production embedding is same-origin.
         */
        proxy: {
            '/store-api': {
                target: process.env.SW_API_BASE ?? 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },
});
