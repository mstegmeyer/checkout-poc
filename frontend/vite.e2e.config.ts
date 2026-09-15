import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Node-side build used by scripts/e2e-api.mjs: bundles the *real* API client,
 * endpoints and Pinia stores into a single ES module that plain Node can import,
 * so the e2e test drives production code instead of a re-implementation.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    define: {
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    build: {
        target: 'node22',
        ssr: true,
        outDir: '.e2e-build',
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            input: fileURLToPath(new URL('./src/e2e-entry.ts', import.meta.url)),
            output: {
                format: 'es',
                entryFileNames: 'e2e-entry.mjs',
                inlineDynamicImports: true,
            },
        },
    },
});
