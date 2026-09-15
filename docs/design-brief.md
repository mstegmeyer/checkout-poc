# Design brief — Figma "Shopware Checkout 2026"

File key: `QS2q4ZX41RL0mUM3JWDX1D` — section `444:1253` "Checkout" (all frames 376 px wide → mobile-first; scale up gracefully on desktop with a centered, max-width column).

## Screen frames (use Figma MCP `get_design_context` per node)

| Node | Name | Meaning |
|---|---|---|
| `388:8652` | Shipping. Cart hidden | Step 1 initial: header + step indicator, collapsed order summary bar (items count, total, "SAVE15 applied", Show details), payment icon row, Contact (email + Log in link), Delivery address (country select, first/last name, address, postal code + city), Shipping method radio cards (Standard free / Express 5,00 €), primary CTA "Continue to payment" (disabled until valid) |
| `444:1493` | Shipping. Cart hidden, details filled | Step 1 with filled inputs (visual states of filled fields) |
| `444:1795` | image 10 | Address field autocomplete dropdown (suggestion list under Address input) |
| `425:9335` | Cart details shown | Expanded order summary: product rows (thumbnail, name, price), Discount −€21.45 with "SAVE15 15% Discount" chip, Shipping costs Free, Grand total excl. VAT, Including 19% VAT, Grand total €108.19, "Hide details" |
| `391:9050` | Cart details hidden | Step 2 Payment: summary rows Contact / Ship to / Delivery with Edit links, Payment radio list (Credit or debit card + brand icons, PayPal, Klarna, Apple Pay), "Safe this card…" checkbox, disabled "Pay now" CTA, terms line |
| `444:1262` | Filled | Step 2 with selection made, active "Pay now €108.19" |
| `443:10698` | Delivery address to edit | Step 2 with delivery address expanded for inline editing (Cancel link, country select, fields, Save address CTA) |
| `443:11107` | Express checkout… | Variant with express wallet buttons — **out of scope** (reference only) |

## Scope decisions (already made — do not deviate)

- No payment input forms: the card-number/expiry/CVC fields in the design are NOT built. Payment methods render as radio cards (icon + label) from `/store-api/checkout/gateway`, styled like the design's method rows.
- No express-checkout wallet buttons.
- "Log in" link renders but is a no-op stub.
- Order summary bar + expandable details exactly per design (collapsed by default on mobile).
- Step indicator "1. Shipping / 2. Payment" per design; success screen may be designed freely in the same visual language (no Figma frame exists for it).
- Promo code: design only shows an applied chip; include a small "add code" affordance consistent with the design language.

## Deliverable

Design tokens (colors, radii, spacing, type scale — extract from the frames' variables/styles) as CSS custom properties in one tokens file; component styles scoped per component. System font stack unless the design context names a hosted font (do not load external fonts from third-party CDNs at runtime — bundle or system fallback).
