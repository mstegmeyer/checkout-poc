# Shopware Checkout SPA — Concept

A standalone, CDN-hosted Vue.js guest checkout that plugs into any Shopware 6.7 shop as an **App** — no PHP, no core changes, store-api only.

## Goals

- **Standalone Vue 3 application** implementing the "Shopware Checkout 2026" Figma design (two-step guest checkout).
- **Installable as a Shopware App**: a `manifest.xml`-only app (no app server, no `<setup>`).
- **Separate storefront page** renders the SPA; the JS/CSS bundle is loaded from a configurable URL (CDN) with **stable filenames**, so publishing a new bundle instantly updates every shop that has the app installed.
- **Opt-in via system config** (`config.xml` toggle). Disabled ⇒ the shop behaves exactly as before.
- **Guest checkout** by default. Two exceptions grew out of the commercial Subscriptions evaluation ([subscriptions.md](subscriptions.md)): a cart with a recurring bundle registers a customer *account* (the plugin refuses guests), and the "Log in" link works so a returning customer is not dead-ended on "e-mail already registered".

## How it plugs in

```
┌─────────────── Shopware shop ───────────────┐        ┌──── CDN ────┐
│ Storefront                                   │        │ checkout.js │
│  offcanvas cart ──┐   app template overrides │   ┌───▶│ checkout.css│
│  cart page ───────┴─▶ "Go to checkout" href  │   │    └─────────────┘
│                       /storefront/script/checkout │
│                                              │   │
│ App script endpoint (storefront-checkout)    │   │
│  └─ renders Twig page (theme base)           │───┘  <script module src=bundleUrl>
│     └─ <div id="checkout-app" data-bootstrap>│      bootstrap: accessKey, apiBase,
│                                              │      storefrontUrl, shop name,
│ store-api  ◀── cookie + sw-context-source ───│      currency, locale (no token)
└──────────────────────────────────────────────┘
```

1. **Entry point** — Shopware app scripts can serve full storefront pages without PHP: `Resources/scripts/storefront-checkout/script.twig` answers `GET /storefront/script/checkout` and renders a Twig view that extends the theme's base template. If the toggle is off, it redirects to the normal cart.
2. **Link rewiring** — the app overrides the two "Go to checkout" blocks (offcanvas cart + cart page) with a `config()` guard: enabled ⇒ href points at the SPA page, disabled ⇒ `parent()` (core behavior).
3. **Session sharing (no token handoff)** — the SPA never sees a context token. Every store-api call goes out same-origin with the storefront **session cookie** (`credentials: 'same-origin'`) and *declares* the session as its context source via **`sw-context-source: session`**; the store-api then resolves the context token from the PHP session and writes rotations (guest registration, login, logout) back into it. One source of truth: page refreshes, the storefront mini-cart and other tabs all stay consistent, and no credential ever appears in HTML or JS — 6.7's Twig token guard is respected rather than worked around.

   The contract is deliberately strict (see [shopware/shopware#19634](https://github.com/shopware/shopware/pull/19634)): the declaration is explicit (omitting the token is *not* enough — an undeclared request gets a fresh, empty context), `sw-context-source` and `sw-context-token` are mutually exclusive, and an unusable session fails the request with `FRAMEWORK__ROUTING_SESSION_CONTEXT_NOT_RESOLVABLE` instead of silently handing out an empty cart. Session-sourced clients are never given a token, so the client ignores response tokens in this mode. Eligibility is gated on an existing session cookie, the mandatory `sw-access-key` header and a same-origin/same-site fetch; such requests bypass the HTTP cache and `sw-context-source` is part of the `Vary` set.

   The client keeps a header-token mode for non-session use (dev harness, cross-origin), selected by the presence of a bootstrap `contextToken`.
4. **Checkout flow** — the SPA talks exclusively to store-api: cart read, `/checkout/gateway` for available payment/shipping methods, `PATCH /context` for selections, guest `POST /account/register` (token rotates; the cart follows), `POST /checkout/order`, `POST /handle-payment` (follows `redirectUrl` if a PSP needs one), success view in-SPA.
5. **Dynamic updates** — the Vite build emits `checkout.js` / `checkout.css` without content hashes. The app config field `bundleUrl` points at where they're hosted (local server in dev, CDN in production). Replacing the files on the CDN updates every installed shop on the next checkout load.

## System config (config.xml)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `SwagCheckoutSpa.config.enabled` | bool | `false` | Master toggle; per sales channel |
| `SwagCheckoutSpa.config.bundleUrl` | text | `http://localhost:8080` | Base URL serving `checkout.js` / `checkout.css` |

## Scope decisions

- Payment/shipping methods are rendered **dynamically** from `/store-api/checkout/gateway`; no card input forms or wallet buttons (those come later with PSP apps — the method list already reflects whatever apps the shop has).
- Promotions: applied codes show as discount rows; codes can be added/removed via cart line-item routes.
- Commercial Subscriptions, mixed carts: recurring bundles are read from `cart.extensions.subscriptionManagedCarts`, shown as their own boxes with recurring totals, and get a per-bundle shipping method via `PATCH /store-api/subscription/context` (addressed with `sw-subscription-plan` / `sw-subscription-interval`; the client never handles the bundle's derived token and must *not* adopt the token that route answers with).
- Commercial Subscriptions, dedicated checkout: the app overrides the plugin's `/subscription/checkout/*` pages in the `subscription` Twig scope and mounts the SPA with the bundle in the bootstrap; the SPA then runs against the subscription cart through the `/store-api/subscription/*` twins (`frontend/src/api/checkoutRoutes.ts`). The cart/offcanvas overrides declare `scopes: ['default', 'mixed-subscription']` — without that, core skips app templates on pages the plugin renders in its own scope. Details and store-api gaps: [subscriptions.md](subscriptions.md).
- Known limitation: the page URL is `/storefront/script/checkout` (pretty URLs would need PHP or SEO-URL setup).
- The storefront session *does* follow what the SPA does — registration and login rotations are written back — so a page refresh mid-checkout and the storefront mini-cart stay in sync. This is the core change's whole purpose and the reason the SPA depends on it.
