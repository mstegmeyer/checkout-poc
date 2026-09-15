# Shopware Checkout SPA

A standalone Vue 3 guest checkout for Shopware 6.7+, installable as a Shopware **App** (no PHP, store-api only), rendered on its own storefront page with the bundle served from a CDN.

See [docs/CONCEPT.md](docs/CONCEPT.md) for the architecture, [docs/design-brief.md](docs/design-brief.md) for the design source and [docs/subscriptions.md](docs/subscriptions.md) for the commercial Subscriptions evaluation (mixed carts and the dedicated subscription checkout are supported; the checkout creates an account or logs in when a recurring bundle is in the cart).

## Repository layout

- `app/SwagCheckoutSpa/` — the Shopware app (manifest, config, script endpoint, template overrides)
- `frontend/` — the Vue 3 + TypeScript + Vite application

## Quick start (dev, against a local shop)

```bash
# 1. Build the SPA (emits dist/checkout.js + dist/checkout.css with stable names)
cd frontend && npm install && npm run build

# 2. Serve the bundle locally (matches the app's default bundleUrl)
npx serve dist -l 8080 --cors

# 3. Install the app into your shop (example: devenv shop in ~/Sites/sw67)
SHOP=~/Sites/sw67
ln -s "$(pwd)/../app/SwagCheckoutSpa" "$SHOP/custom/apps/SwagCheckoutSpa"
direnv exec "$SHOP" php "$SHOP/bin/console" app:install --activate SwagCheckoutSpa
direnv exec "$SHOP" php "$SHOP/bin/console" cache:clear   # required: Twig paths are container-built

# 4. Enable it (per sales channel possible via admin > Extensions > Checkout SPA)
direnv exec "$SHOP" php "$SHOP/bin/console" system:config:set SwagCheckoutSpa.config.enabled true --json
```

With the toggle **on**, the storefront's "Go to checkout" buttons lead to `/storefront/script/checkout`, which renders the SPA against the shopper's existing cart. Toggle **off** → stock Shopware checkout, untouched.

## Production

Upload `frontend/dist/checkout.js` and `frontend/dist/checkout.css` to your CDN and set `SwagCheckoutSpa.config.bundleUrl` to the CDN base URL. Because the filenames are stable, replacing the files updates every shop immediately (mind CDN cache TTLs).
