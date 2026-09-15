<template>
    <!--
        Shopware "icons/regular/credit-card" (Figma 388:8709) — the *neutral*
        fallback for payment methods that ship no media. Brand marks are never
        hardcoded: they come from `method.media.url` when the shop provides them.
        Outer box 16×16, glyph 16×12 vertically centred per the design's insets.
    -->
    <svg
        class="c-icon c-icon--card"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        focusable="false"
    >
        <path
            transform="translate(0 2)"
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M14.6667 3.33333V2C14.6667 1.63181 14.3682 1.33333 14 1.33333H2C1.63181 1.33333 1.33333 1.63181 1.33333 2V3.33333H14.6667ZM14.6667 4.66667H1.33333V10C1.33333 10.3682 1.63181 10.6667 2 10.6667H14C14.3682 10.6667 14.6667 10.3682 14.6667 10V4.66667ZM2 0H14C15.1046 0 16 0.895431 16 2V10C16 11.1046 15.1046 12 14 12H2C0.895431 12 0 11.1046 0 10V2C0 0.895431 0.895431 0 2 0Z"
            fill="currentColor"
        />
    </svg>
</template>
