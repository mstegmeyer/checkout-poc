# Commercial Subscriptions in the checkout SPA — evaluation and implementation

Evaluated 2026-09-09 against `~/Sites/sw67` (Shopware 6.7 trunk, SwagCommercial 7.13.0,
`subscriptions.mixedCartsEnabled = true`, one plan "Testplan" with three intervals), by reading the
plugin's `src/Subscription` module and probing the store-api with throwaway carts. The SPA changes
described at the end are verified by the extended e2e script (`npm run e2e` with the
`SW_SUBSCRIPTION_*` variables) — in **header mode only**, because the sw67 checkout currently runs a
branch without the session-context feature (shopware/shopware#19634). The session-mode assessment
below is by reading the PR branch, not by running it.

## 1. How the plugin works, and where the tokens are

The plugin has **two checkout modes**, and the token story differs between them.

### 1.1 Dedicated subscription checkout ("the bubble")

A product is bought *as* a subscription (buy widget → `frontend.subscription.checkout.line-item.add`)
and the shopper is moved into a separate checkout under `/subscription/checkout/*/{subscriptionToken}`.
Behind that URL the plugin keeps a **second sales channel context and a second cart** per
plan + interval:

- `subscriptionToken = md5(mainToken + intervalId + planId)`
  (`SubscriptionContextStruct::createSubscriptionToken`). Mappings live in the `subscription_cart`
  table (`subscription_token`, `main_token`, `plan_id`, `interval_id`, `managed`).
- `SalesChannelContextServiceDecorator` decorates the core context service. On a request whose route
  carries `_subscriptionContext`, it reads the headers `sw-subscription-plan`,
  `sw-subscription-interval` **and the raw `sw-context-token` request header**, derives the
  subscription token, adds the `subscription` permission for it and loads a *second* context with
  that token. Value resolvers then hand controllers the subscription context and cart instead of the
  shopper's.
- The storefront never sends those headers itself. `StorefrontSubscriber::propagateSubscriptionDetails`
  resolves `{subscriptionToken}` from the URL through the mapping table and injects the two headers
  into the request; every redirect is rewritten to the `frontend.subscription.*` twin route.
- Login and token rotation are propagated (`propagateLogin`, `propagateTokenChange`): the mapping row's
  `main_token` is rewritten, so the *old* md5 keeps working for the new main token.
- A separate service graph (`subscription.cart.service`, own processor/validator chain) calculates
  these carts. Validators: `GuestCustomerValidator` (guests refused), `SubscriptionAvailabilityValidator`,
  `SubscriptionPaymentMethodValidator` (payment handler must support `PaymentHandlerType::RECURRING`).

This mode is a storefront construct. Its store-api twins exist (`/store-api/subscription/checkout/*`,
`/store-api/subscription/context`) but every call needs the two bundle headers, and each answers for
a cart that is *not* the shopper's cart. The SPA supports it as a second **checkout mode** (section 6):
the plugin's own pages hand the bundle over, and the SPA talks to the twins for exactly that cart.

### 1.2 Mixed carts ("managed" carts) — what the SPA implements

With `subscriptions.mixedCartsEnabled`, a normal cart may contain recurring items: product line items
with `payload.subscriptionPlan` + `payload.subscriptionInterval`. On **every** cart calculation
(`CheckoutCartRuleLoaderExtension::onPost` → `SubscriptionManagedCartSubscriber::calculateManagedCarts`)
the plugin bundles those items per plan + interval and calculates each bundle in its own **managed
cart** with its own **managed context** (same md5 token, `managed = 1`). Results are attached as
extensions:

- `cart.extensions.subscriptionManagedCarts.elements["<planId>-<intervalId>"]` — a full cart per
  bundle (items, deliveries, price, errors) plus `extensions.subscription`
  (`SubscriptionContextStruct`: plan, interval, `nextSchedule`, `managed`, `mainToken`, `subscriptionToken`).
- `context.extensions.subscriptionManagedContexts.elements[...]` — the managed contexts, visible on
  `GET /store-api/context` too.
- Blocking errors of a managed cart are lifted into the main cart as **one** wrapper error
  `subscription-managed-cart-<planId>-<intervalId>` whose `parameters.errors` only carries the inner
  *message keys*. `PaymentMethodBlockedError`s are lifted as-is (all bundles and the order must share
  one recurring-capable payment method).
- On order (`CartConvertedEvent`) each managed cart is converted into a `subscription`; the order gets
  `extensions.initialSubscriptions`; the managed carts, contexts and mapping rows are deleted.

The managed context inherits the main context and follows its shipping method **until it gets its
own** (`SubscriptionManagedSalesChannelContextService`: persisted `shippingMethodId` of the
subscription token wins). The storefront sets it via `frontend.mixed-subscription.checkout.configure`;
the store-api equivalent is `PATCH /store-api/subscription/context` with the bundle headers.

## 2. What the probe showed (store-api, header mode)

| Call | Result |
|---|---|
| `POST /checkout/cart/line-item` with `subscriptionPlan` + `subscriptionInterval` on the item | Works. The plugin's line-item factory decorator writes the payload and, when `id === referencedId`, derives a stable id from product + plan + interval, so the same product can be in the cart once per bundle. |
| `POST /checkout/cart` | `extensions.subscriptionManagedCarts` present with the full managed cart per bundle, including plan, interval, `nextSchedule`, `delayed`, `discountPercentage`, `minimumExecutionCount`. |
| `GET /context` | `extensions.subscriptionManagedContexts` present (shipping/payment method per bundle). |
| `GET /checkout/gateway` | Payment methods already filtered to recurring-capable handlers (`SubscriptionPaymentMethodRoute` decorates the payment method route): Invoice, PayPal, Shopware Payments card — Cash on delivery gone. |
| Delayed interval ("every first of the month") in a mixed cart | `subscription-interval-blocked` (level 20, blocks) inside the wrapper — such intervals need the dedicated checkout. |
| `PATCH /store-api/subscription/context` `{shippingMethodId}` + bundle headers | 200. The managed context keeps the method, the main cart's method is untouched, the next cart read shows the bundle shipping with the new method. **The response carries the subscription token in `sw-context-token`** (see 3.1). Missing header → 400 `FRAMEWORK__MISSING_REQUEST_PARAMETER`; unknown plan/interval → 412 `CHECKOUT__PLAN_NOT_FOUND`. |
| Guest registration with a bundle in the cart | Main cart error `subscription-managed-cart` (level 20, block) wrapping `guest-customer-not-allowed`. |
| Account registration (`guest: false` + password) | Error gone; token rotated; the bundle's persisted shipping method survives the rotation (mapping row re-pointed). |
| `POST /checkout/order` | Order created, one `subscription` per bundle. The order response does **not** include `initialSubscriptions`; `POST /store-api/order` with the association does — and ships the subscription's complete `convertedOrder` JSON unless trimmed with `includes`. |
| `POST /handle-payment` | Works as for a normal order (`SubscriptionPaymentTransactionStructFactory` attaches the recurring struct server-side). |
| `POST /store-api/product` / `/product/{id}` | **No `subscriptionPlans` extension**, even with an explicit association; filtering on `subscriptionPlans.id` → `FRAMEWORK__ACCESSOR_NOT_ALLOWED`. The association is not `ApiAware`. |
| `POST /store-api/subscription/checkout/cart` (dedicated) on a mixed-cart token | Returns a separate cart with the bundle's items. Did not flip the `managed` flag of the mapping row in the observed run, but it is a different cart than the shopper's and easy to mistake for it. |

## 3. Findings — token level

### 3.1 Subscription routes answer with the *bundle's* token — a hijack for header-mode clients

`store-api.subscription.switch-context` is the core `ContextSwitchRoute` on a route with the
subscription defaults, so it returns a `ContextTokenResponse` whose `sw-context-token` header is the
**subscription** token. A store-api client following the documented rule "adopt the token from every
response" — the SPA's header mode did, and so did the first probe run — is silently moved into the
bubble: every later `POST /checkout/cart` reads the managed cart (one item, no managed carts, no
wrapper errors) as if it were the shopper's cart. Nothing signals the switch.

The storefront is not affected because its controller never returns that response to the browser.
Session mode is not affected because the store-api strips the header for session-sourced clients
(shopware/shopware#19634, `protectSessionResolvedResponse`). The SPA's API client now has an explicit
`adoptToken: false` for subscription-scoped routes.

Recommendation for the plugin: do not emit the subscription token on store-api subscription routes
(or emit the main token), and document the two bundle headers as the addressing scheme.

### 3.2 Session mode (`sw-context-source: session`) is compatible — by construction, not yet by test

The commercial decorator reads the token from the *request header*. On the PR branch, the core
resolver writes the session-resolved token into exactly that header before it calls the context
service (`resolveContextTokenFromSession` → `$request->headers->set(HEADER_CONTEXT_TOKEN, …)`), and
the commercial decorator is invoked from inside that call. So `sw-subscription-plan/interval` +
`sw-context-source: session` should resolve the right bundle. Likewise `propagateLogin` reads the old
token from the request header, which is populated. The PR's rotation write-back
(`onContextResolved`) fires only when the used token differs from the resolved context's token; the
commercial resolver dispatches the resolved event with the subscription context *and* the
subscription token, so it does not rotate the session into the bubble. Still unverified on a running
shop — the sw67 checkout is on another branch.

### 3.3 Tokens in response bodies

The managed cart's `extensions.subscription` serialises `mainToken` and `subscriptionToken`. In header
mode the client knows the main token anyway; in session mode the body would be the only place the
token shows up (the core `Cart.token` field is in the same situation — the PR explicitly leaves
response-body token fields alone). Not a new class of leak, but subscriptions add a second field to
watch when the "no token in the page" property matters.

### 3.4 Two tokens, one primary key

The mapping row's primary key is the subscription token and its unique key includes `managed`, yet
the dedicated (`managed = 0`) and managed (`managed = 1`) variants of the same bundle share the same
md5 token. The store-api subscription routes never set `_subscriptionManaged`, so a store-api client
touching a bundle addresses the *same* context row the managed cart uses. It works for the shipping
switch precisely because of that overlap, but it means the store-api cannot distinguish the two
modes at all, and the dedicated cart routes on a managed token return a cart the client must not treat
as the shopper's.

## 4. Findings — App System / store-api surface

1. **Product plans are not exposed.** `product.subscriptionPlans` lacks `ApiAware`, so a headless
   client cannot render the plan/interval chooser the storefront PDP has. The checkout gets away with it
   because the cart carries the structs, but any headless PDP (and this e2e suite) needs the ids handed
   in from outside.
2. **Guests are refused.** A guest-only checkout cannot sell subscriptions. There is also no route to
   upgrade a guest to an account; the only way is to register again with `guest: false`.
3. **No per-bundle shipping method list.** The storefront computes it server-side per managed context
   (`subscription_shipping_methods` extension on `CheckoutConfirmPageLoadedEvent`); the store-api has no
   equivalent. The SPA offers the order's methods and marks the ones the bundle's own calculation blocked.
   The new twins of #4046 do *not* close this for mixed carts, see finding 13.
4. **The wrapper error is not renderable on its own.** `subscription-managed-cart` carries interval and
   plan *names* plus inner message *keys*; the full inner errors have to be read from the managed cart.
5. **`checkout/order` omits `initialSubscriptions`**, and the follow-up `/store-api/order` read exposes
   the subscription's `convertedOrder` (the complete converted cart) unless trimmed. It is the
   customer's own data, but a large internal blob for a store-api response. (Trimming detail: an
   entity extension is listed by its own name in the parent's `includes` — `order: [..., 'initialSubscriptions']` —
   not via `extensions`; the latter silently drops it.)
6. **Payment filtering is silent.** The gateway list is filtered to recurring-capable handlers without
   an error explaining why methods vanished — fine for the UI, invisible for debugging.
7. **App scripts / manifest**: nothing subscription-specific is reachable for a manifest-only app
   beyond the store-api. The storefront integration relies on template scopes (`subscription`,
   `mixed-subscription`), Twig functions (`subscription_group_cart`, …) and redirect rewriting — none
   of which an app can hook into.
8. **Template scopes silently disable app overrides.** The plugin renders the cart, offcanvas and
   checkout pages of a cart with a recurring bundle in the Twig scope `mixed-subscription` *only* (the
   `default` scope is dropped for those routes), and core's `sw_extends` skips every extension whose
   scopes do not match (`ExtendsTokenParser::shouldEndFile`). An app template written the normal way —
   `{% sw_extends '@Storefront/…' %}` without scopes — therefore stops applying the moment a
   subscription enters the cart: the SPA's "proceed to checkout" overrides fell back to the core
   checkout without any error. The overrides now declare `scopes: ['default', 'mixed-subscription']`.
   Verified on the storefront: offcanvas and cart page of a mixed cart link to the SPA again.
9. **The dedicated subscription cart carries no plan/interval data over the store-api.** The
   `/store-api/subscription/checkout/*` twins return a plain cart (the only trace is the line-item
   payload's plan and interval ids); the `SubscriptionContextStruct` the storefront reads via Twig
   (`context.extension('subscription')`) is never serialised for that cart, and there is no
   `GET /store-api/subscription/context`. A headless client has to carry names, first delivery, discount
   and minimum term itself — the SPA gets them from the page that embeds it.
10. **No gateway twin.** `/store-api/checkout/gateway`, `/payment-method` and `/shipping-method` have
    no `/store-api/subscription/*` variant, so in the dedicated checkout the method lists come from the
    shopper's parked cart and the gateway's blocked-method notices are about the wrong cart. The
    subscription cart's own `errors` (`payment-method-blocked` "not recurring", shipping blocked) are the
    only reliable signal; the SPA uses the gateway lists but ignores its notices in that mode. The
    `add` twin (`POST /store-api/subscription/checkout/cart/line-item`) also answers with the bundle token
    in `sw-context-token` (the load twin does not) — same hazard as 3.1.
11. **CORS locks cross-origin clients out.** Core's `CorsListener` answers every store-api preflight with a
    fixed `Access-Control-Allow-Headers` list (`sw-context-token`, `sw-access-key`, `sw-language-id`, …).
    `sw-subscription-plan` / `sw-subscription-interval` are not on it and a plugin cannot add them, so a
    browser client on another origin cannot call any subscription route (the preflight passes, the actual
    request is refused by the browser). Same-origin embedding — the SPA's production case — is unaffected;
    the dev harness needed a same-origin proxy (`?proxy=1`, Vite `server.proxy`) to show the bubble at all.
    Core gap rather than a plugin one: the allow-list is not extensible.
12. **After resolution, the request points at the bundle.** `SalesChannelContextService::get()` writes the
    context object and the `sw-context-token` header onto the current request on every call, and the
    commercial decorator calls it twice (shopper, then bundle) — so on a subscription route
    `PlatformRequest::ATTRIBUTE_SALES_CHANNEL_CONTEXT_OBJECT` and the request header hold the *bundle*,
    while the resolver keeps the shopper's context object. Anything reading "the token" off the request
    there gets the derived one. Worse, `ContextSwitchRoute::switchContext` calls the context service
    again with the bundle context, the decorator re-enters and derives a **nested** token
    `md5(bundleToken + intervalId + planId)`, persists a context row for it and grants it the
    `subscription` permission — a throwaway row per `PATCH /store-api/subscription/context`. Found while
    fixing 3.1; not fixed, worth its own ticket.
13. **Subscription twins clobber a managed bundle's persisted context.** With `mixedCartsEnabled` on, any
    request to a `/store-api/subscription/*` twin addressed at a bundle of the shopper's *mixed* cart
    reduces that bundle token's `sales_channel_api_context` payload to `{"permissions":{"subscription":true}}`
    — the persisted `shippingMethodId` is gone and the managed cart falls back to the order's method
    (verified by dumping the table before/after; with mixed carts off the payload survives). The
    `PATCH …/context` used by the SPA writes the method *after* that happens and therefore works, but a
    follow-up `GET` twin (the new shipping-method route, say) undoes it. Exact writer not chased; until it
    is, a client must not read a managed bundle through the twins. The SPA does not.
14. **Filtered payment methods could not be encoded.** `SubscriptionPaymentMethodRoute` removed
    non-recurring methods from the inner collection only; the `EntitySearchResult` kept its copy, so a
    store-api response of that route failed with `SYSTEM__ENCODING_INVALID_STRUCT_EXCEPTION`. Never visible
    before because nothing consumed the filtered result over the store-api. Fixed in #4046.

## 5. What the SPA now does

- **Recognises bundles** from `cart.extensions.subscriptionManagedCarts` (`stores/cart.ts`:
  `subscriptionGroups`, `oneTimeLineItems`, `subscriptionDiscountTotal`). No plugin → nothing changes.
- **Order summary**: one-time items in the plain list, one box per bundle (interval, plan, first
  delivery, minimum deliveries, discount badge, recurring shipping), subscription discount row, and a
  "Recurring total “every week”" row per bundle after the grand total.
- **Shipping step**: the order's methods as before, plus one select per bundle that PATCHes the
  bundle's context (`api/endpoints/subscription.ts`, `adoptToken: false`). Blocked-for-the-bundle
  methods are labelled; a blocked bundle method is auto-reconciled like the main one.
- **Account instead of guest** when a bundle is in the cart: the contact section explains why, asks for
  a password (`core.loginRegistration.passwordMinLength` via the bootstrap) and registers with
  `guest: false`. A storefront guest arriving with a bundle is re-registered as an account.
- **Login** (`POST /store-api/account/login`) — the formerly stubbed link works, because a returning
  customer would otherwise dead-end on "e-mail already registered". After login the account's
  addresses prefill the form, the e-mail is locked, and step 1 never registers again. Boot also adopts
  a customer that is already on the context.
- **Errors**: the wrapper error is expanded into the bundle's real errors, prefixed with the interval
  (`stores/checkout.ts` → `expandGroupError`); new messages for the plugin's keys.
- **Payment step**: recurring-charge disclaimer above the terms checkbox; the delivery review row lists
  the bundle methods.
- **Success**: the created subscriptions (number, interval, next delivery) via `/store-api/order`.
- **e2e** (`scripts/e2e-api.mjs`, steps 13–14): bundle detection, gateway filtering, per-bundle shipping
  switch without token hijack, short-password rejection, account registration, order with one
  subscription whose shipping method matches the bundle, then login from a fresh checkout with cart
  merge and no re-registration.

Verified 2026-09-09: `npm run e2e` (orders 10219–10221, subscription 10008) and a manual run through
the dev harness at `frontend/index.html` in header mode (account creation, per-bundle shipping
select, recurring totals, disclaimer, success view with subscription 10009).

Not done, deliberately: a plan chooser (no data, finding 1) and changing a bundle's payment method
separately (the plugin does not allow it).

## Upstream

Fixes opened from these findings (draft PRs on shopware/SwagCommercial):

- finding 4, richer wrapper error: [#4041](https://github.com/shopware/SwagCommercial/pull/4041) —
  `SubscriptionManagedCartError` gains a `details` parameter with the inner errors (message key,
  message, level, block flag, parameters); `errors` unchanged.
- finding 1, `ApiAware` on `product.subscriptionPlans` (+ `subscriptionIntervals`):
  [#4042](https://github.com/shopware/SwagCommercial/pull/4042). Also fixes `discountPrice`, which was a
  *private* property of the sales-channel plan entity and therefore never serialised at all.
- finding 3.1, shopper's token on subscription store-api responses:
  [#4045](https://github.com/shopware/SwagCommercial/pull/4045) — the decorator records derived → shopper
  token per request and a response subscriber resolves `sw-context-token` back transitively (so the nested
  token of finding 12 is covered too, and a genuinely rotated token from a gateway login is kept).
- findings 9/10, store-api twins for the dedicated checkout — `GET /store-api/subscription/context`,
  `/store-api/subscription/checkout/gateway`, `/store-api/subscription/payment-method`,
  `/store-api/subscription/shipping-method`: [#4046](https://github.com/shopware/SwagCommercial/pull/4046)
  (also fixes finding 14; the twins need the `_entity` route default for criteria resolution). Once shipped,
  the SPA's bubble can read its context instead of deriving selections from the cart, and use the bundle's
  own gateway.
- finding 11, extensible CORS allow-list (core): [shopware/shopware#20323](https://github.com/shopware/shopware/pull/20323)
  — a tagged `CorsHeaderProviderInterface` lets bundles add allowed/exposed headers; core defaults unchanged.
  The subscription module still has to register its two headers once this ships (follow-up PR).
- finding 5, `initialSubscriptions` on the `POST /store-api/checkout/order` response:
  [#4044](https://github.com/shopware/SwagCommercial/pull/4044) — the order-placed criteria subscriber now
  also listens to the unprefixed event; the `convertedOrder` weight per subscription is the accepted cost.

## 6. The dedicated subscription checkout in the SPA ("bubble")

Entry is the storefront: "Subscribe now" on a product page posts to the plugin's
`frontend.subscription.checkout.line-item.add`, which fills the *subscription* cart and redirects to
`/subscription/checkout/register/{subscriptionToken}` (guests) or, for logged-in customers,
`/subscription/checkout/confirm/{subscriptionToken}`. Both pages render in the Twig scope
`subscription`, where `context` is the subscription context. The app overrides
`page/checkout/address/index.html.twig` and `page/checkout/confirm/index.html.twig` **in that scope**
(`app/SwagCheckoutSpa/Resources/views/storefront/page/checkout/*`) and mounts the SPA there, with the
bundle in the bootstrap: plan and interval ids plus the names, discount, minimum term and first
delivery read off `context.extension('subscription')` (finding 9). The shared mount partial is
`page/checkout-spa/bootstrap.html.twig`. Toggle off → the plugin's pages render unchanged.

In the SPA the bootstrap's `subscription` switches the **checkout mode** (`api/checkoutRoutes.ts`):
cart, line items, context patches and the order go to the `/store-api/subscription/*` twins with the
two bundle headers and `adoptToken: false`; registration, login, countries, the gateway and
`handle-payment` stay on the shopper's context. Consequences handled in the stores:

- the cart *is* the one bundle: it is presented as a single subscription group (from the bootstrap
  data), an account is required, the promotion input is hidden (`CHECKOUT__PROMOTION_NOT_IMPLEMENTED`),
  the per-method shipping preview is off (its route would price the parked cart), and the selected
  shipping/payment method is read back from the cart's delivery and transaction because the
  subscription context cannot be read;
- gateway notices are ignored (finding 10); the subscription cart's own errors drive blocking;
- the success view reads the order's `subscription` (de-duplicated against `initialSubscriptions`,
  which lists the same entity for the initial order);
- the shopper's own cart is left alone throughout (registration moves both carts to the new token:
  the plugin re-points the mapping row on `CustomerLoginEvent`).

Verified 2026-09-10: e2e step 16 (separate subscription cart, account, order through the subscription
order route, one subscription, parked shopper cart untouched) and, on the storefront, "Subscribe now"
landing on the SPA with the bundle in its bootstrap. The store-api part of the storefront flow could not
run there: the sw67 checkout is on a branch without the session-context feature, so the embedded SPA
sees an empty context. The dev harness (`?subscriptionPlan=…&subscriptionInterval=…`) covers the
bubble in header mode.
