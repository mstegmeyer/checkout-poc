<script setup lang="ts">
import { t } from '@/i18n';

const props = withDefaults(defineProps<{ active: boolean; label?: string }>(), { active: false });
</script>

<template>
    <div v-if="props.active" class="c-loading" role="status" aria-live="polite">
        <span class="c-loading__spinner" aria-hidden="true"></span>
        <span class="c-loading__label">{{ props.label ?? t('common.loading') }}</span>
    </div>
</template>
