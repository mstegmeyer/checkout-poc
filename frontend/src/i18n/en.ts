/**
 * English message catalogue. This is the reference catalogue — every other
 * locale is typed against it, so a missing key is a type error.
 */
export const en = {
    'step.address.label': 'Shipping',
    'step.payment.label': 'Payment',
    'step.of': 'Step {current} of {total}',

    'common.continue': 'Continue to payment',
    'common.back': 'Back',
    'common.edit': 'Edit',
    'common.optional': 'optional',
    'common.loading': 'Loading…',
    'common.retry': 'Try again',
    'common.remove': 'Remove',
    'common.cancel': 'Cancel',

    'contact.title': 'Contact',
    'contact.email': 'Email address',
    'contact.emailHint': 'We send the order confirmation to this address.',
    'contact.loginQuestion': 'Already have an account?',
    'contact.login': 'Log in',

    'address.title': 'Delivery address',
    'address.firstName': 'First name',
    'address.lastName': 'Last name',
    'address.street': 'Street and house number',
    'address.zipcode': 'Postal code',
    'address.city': 'City',
    'address.country': 'Country',
    'address.countryPlaceholder': 'Please select a country',
    'address.state': 'State',
    'address.statePlaceholder': 'Please select a state',
    'address.phone': 'Phone number',
    'address.additional': 'Company, apartment, etc.',
    'address.billingTitle': 'Billing address',
    'address.billingSame': 'Billing information is the same as delivery.',

    'shipping.title': 'Shipping method',
    'shipping.free': 'Free',
    'shipping.none': 'No shipping method is available for this order.',
    'shipping.deliveryTime': 'Delivery time: {time}',
    'shipping.deliveryBetween': 'Estimated delivery {earliest} – {latest}',

    'payment.title': 'Payment',
    'payment.marks': 'Accepted payment methods',
    'payment.none': 'No payment method is available for this order.',
    'payment.redirecting': 'Redirecting to the payment provider…',

    'summary.title': 'Order summary',
    'summary.toggleShow': 'Show details',
    'summary.toggleHide': 'Hide details',
    'summary.itemCount': '{count} items',
    'summary.itemCountOne': '1 item',
    'summary.quantity': 'Qty {quantity}',
    'summary.subtotal': 'Subtotal',
    'summary.shipping': 'Shipping costs',
    'summary.shippingPending': 'Calculated at next step',
    'summary.vat': 'Including {rate}% VAT',
    'summary.net': 'Grand total exclusive of VAT',
    'summary.total': 'Grand total',
    'summary.taxFree': 'Tax free',
    'summary.promotionApplied': '{code} applied',
    'summary.promotion': 'Discount',

    'promo.title': 'Promotion code',
    'promo.placeholder': 'Enter code',
    'promo.apply': 'Apply',
    'promo.empty': 'Please enter a promotion code.',

    'review.title': 'Your details',
    'review.contact': 'Contact',
    'review.shipTo': 'Ship to',
    'review.method': 'Delivery',
    'review.saveAddress': 'Save address',
    'review.saveContact': 'Save',

    'tos.label': 'I have read and accept the terms and conditions.',
    'tos.required': 'Please accept the terms and conditions.',

    'order.place': 'Pay now',
    'order.placeWithAmount': 'Pay now {amount}',
    'order.placing': 'Placing your order…',

    'success.title': 'Thank you for your order!',
    'success.orderNumber': 'Your order number is {orderNumber}.',
    'success.email': 'We have sent a confirmation to {email}.',
    'success.continueShopping': 'Back to the shop',

    'empty.title': 'Your cart is empty',
    'empty.text': 'Add a product to your cart to continue with the checkout.',
    'empty.backToShop': 'Back to the shop',

    'doubleOptIn.title': 'Please confirm your email address',
    'doubleOptIn.text':
        'We have sent a confirmation link to {email}. Open the link to finish your guest order — your cart stays saved.',

    'errors.generic': 'Something went wrong. Please try again.',
    'errors.network': 'We could not reach the shop. Please check your connection and try again.',
    'errors.boot': 'The checkout could not be loaded.',
    'errors.cartChanged': 'Your cart has changed. We refreshed the totals — please confirm again.',
    'errors.cartInvalid': 'Your cart cannot be ordered right now. Please review the notices above.',
    'errors.orderFailed': 'Your order could not be placed.',
    'errors.paymentFailed': 'The payment could not be started. Your order was created — please contact us.',
    'errors.selectPayment': 'Please choose a payment method.',
    'errors.selectShipping': 'Please choose a shipping method.',
    'errors.sessionContext': 'Your shopping session has expired. Please return to the cart and start the checkout again.',

    // Customer account — only when the cart demands one (commercial subscriptions).
    'account.required':
        'Your cart contains a subscription. Subscriptions need a customer account — choose a password to create one, or log in.',
    'account.password': 'Password',
    'account.passwordHint': 'At least {min} characters. You manage your subscription in this account.',
    'account.loggedInAs': 'Logged in as {email}.',
    'account.emailLocked': 'The email address of your account cannot be changed here.',
    'account.loginTitle': 'Log in',
    'account.loginSubmit': 'Log in',
    'account.loginCancel': 'Cancel',
    'account.loginFailed': 'The email address or password is incorrect.',
    'account.loginThrottled': 'Too many login attempts. Please wait a moment and try again.',
    'account.loginOptIn': 'Please confirm your email address first — the activation link is in your inbox.',
    'account.loginInactive': 'This account is not active. Please contact us.',

    // Recurring bundles of a mixed cart (commercial subscriptions).
    'subscription.bubbleHint': 'You are in a separate subscription checkout. Your shopping cart is kept and waits for you afterwards.',
    'subscription.unnamedInterval': 'recurring delivery',
    'subscription.groupLabel': 'Subscription · {interval}',
    'subscription.firstDeliveryToday': 'First delivery today',
    'subscription.firstDelivery': 'First delivery {date}',
    'subscription.discountBadge': 'Save {percent}%',
    'subscription.minimumDeliveries': 'At least {count} deliveries',
    'subscription.shippingFree': 'Free shipping for the recurring deliveries',
    'subscription.shippingCosts': 'Shipping for the recurring deliveries: {amount}',
    'subscription.shippingMethod': 'Shipping for “{interval}”',
    'subscription.shippingMethodUnavailable': '{name} (not available)',
    'subscription.recurringTotal': 'Recurring total “{interval}”',
    'subscription.discount': 'Subscription discount',
    'subscription.disclaimer':
        'By placing this order you confirm that your subscription renews automatically and your payment method is charged at the subscription price shown for each interval. You can cancel at any time in your customer account; a minimum number of deliveries may apply.',
    'subscription.successTitle': 'Your subscriptions',
    'subscription.successItem': 'Subscription {number}: {interval}, next delivery on {date}.',
    'subscription.successManage': 'You can manage your subscriptions in your customer account.',

    // Cart notices (`cart.errors[*].messageKey`) — never show the raw snippet key.
    'cart.error.shipping-method-blocked': 'The shipping method “{name}” is not available for this order.',
    'cart.error.payment-method-blocked': 'The payment method “{name}” is not available for this order.',
    'cart.error.product-out-of-stock': '“{name}” is out of stock and was removed.',
    'cart.error.product-stock-reached': 'Only {quantity} × “{name}” are available.',
    'cart.error.product-not-found': 'A product in your cart is no longer available and was removed.',
    'cart.error.promotion-not-found': 'The promotion code “{code}” is unknown.',
    'cart.error.promotion-not-eligible': 'The promotion “{name}” cannot be applied to this cart.',
    'cart.error.min-order-value-not-reached': 'The minimum order value has not been reached.',
    // Commercial subscriptions. The wrapper key is expanded into the bundle's own
    // errors by the checkout store; `subscription-group-error` is that expansion.
    'cart.error.subscription-group-error': 'Subscription “{intervalName}”: {detail}',
    'cart.error.subscription-managed-cart': 'The subscription “{intervalName}” cannot be ordered yet.',
    'cart.error.guest-customer-not-allowed': 'Subscriptions are not available for guest orders. Please create an account or log in.',
    'cart.error.subscription-plan-blocked': 'This subscription plan is not available for your cart.',
    'cart.error.subscription-interval-blocked':
        'This delivery interval cannot be combined with other items. Please order it in its own checkout.',
    'cart.error.subscription-product-mapping-missing': 'A product is not available as a subscription and was removed from your cart.',
    'cart.error.fallback': 'Please review your cart.',

    // Field violations (`source.pointer` / `VIOLATION::*`).
    'violation.blank': 'Please fill in this field.',
    'violation.email': 'Please enter a valid email address.',
    'violation.emailBlank': 'Please enter your email address.',
    'violation.firstNameBlank': 'Please enter your first name.',
    'violation.lastNameBlank': 'Please enter your last name.',
    'violation.streetBlank': 'Please enter your street and house number.',
    'violation.zipcodeBlank': 'Please enter your postal code.',
    'violation.cityBlank': 'Please enter your city.',
    'violation.countryBlank': 'Please choose a country.',
    'violation.stateBlank': 'Please choose a state.',
    'violation.phoneBlank': 'Please enter your phone number.',
    'violation.dataProtection': 'Please accept the data protection terms.',
    'violation.tooLong': 'This value is too long.',
    'violation.tooShort': 'This value is too short.',
    'violation.passwordBlank': 'Please choose a password.',
    'violation.passwordTooShort': 'The password needs at least {min} characters.',
    'violation.emailNotUnique': 'An account with this email address already exists. Please log in.',
    'violation.invalid': 'Please check this value.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
