<script setup lang="ts">
import { ref } from 'vue';
import TextInput from '@/components/form/TextInput.vue';
import Alert from '@/components/feedback/Alert.vue';
import { t } from '@/i18n';
import { useCheckoutStore } from '@/stores/checkout';

/**
 * Inline login for an existing account. Not a `<form>` of its own — it sits
 * inside the step-1 form, and nested forms are invalid HTML — so Enter is
 * handled on the group and both buttons are plain buttons.
 *
 * Login exists because subscriptions force an account: a returning customer
 * would otherwise dead-end on "e-mail already registered".
 */
const props = withDefaults(defineProps<{ initialEmail?: string }>(), { initialEmail: '' });
const emit = defineEmits<{ done: []; cancel: [] }>();

const checkout = useCheckoutStore();

const email = ref(props.initialEmail);
const password = ref('');
const pending = ref(false);

async function submit(): Promise<void> {
    if (pending.value) return;
    pending.value = true;
    try {
        const ok = await checkout.login(email.value, password.value);
        if (ok) {
            password.value = '';
            emit('done');
        }
    } finally {
        pending.value = false;
    }
}
</script>

<template>
    <div class="c-login" role="group" :aria-label="t('account.loginTitle')" @keydown.enter.prevent="submit">
        <h3 class="c-login__heading">{{ t('account.loginTitle') }}</h3>

        <TextInput
            id="checkout-login-email"
            type="email"
            inputmode="email"
            :label="t('contact.email')"
            :placeholder="t('contact.email')"
            v-model="email"
            autocomplete="username"
        />
        <TextInput
            id="checkout-login-password"
            type="password"
            :label="t('account.password')"
            :placeholder="t('account.password')"
            v-model="password"
            autocomplete="current-password"
        />

        <Alert v-if="checkout.loginError" variant="error" :message="checkout.loginError" />

        <div class="c-login__actions">
            <button class="c-login__submit" type="button" :disabled="pending || checkout.busy" @click="submit">
                {{ t('account.loginSubmit') }}
            </button>
            <button class="c-login__cancel" type="button" :disabled="pending" @click="emit('cancel')">
                {{ t('account.loginCancel') }}
            </button>
        </div>
    </div>
</template>
