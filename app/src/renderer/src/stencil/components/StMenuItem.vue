<script setup lang="ts">
/** An item of StMenu. Role menuitem, or menuitemradio and menuitemcheckbox with `checked`. Tone danger for destructive actions. */
import StIcon from '../icons/StIcon.vue'

withDefaults(
  defineProps<{
    /** `menuitemradio` marks a single choice among several; pair it with `checked`. */
    role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox'
    checked?: boolean
    tone?: 'danger'
    disabled?: boolean
  }>(),
  { role: 'menuitem' }
)
</script>

<template>
  <button
    type="button"
    class="st-menu-item"
    :role="role"
    :aria-checked="role === 'menuitem' ? undefined : checked === true"
    :data-st-tone="tone"
    :disabled="disabled"
  >
    <span v-if="role !== 'menuitem'" class="st-menu-item-check" aria-hidden="true">
      <StIcon v-if="checked" name="check" :size="14" />
    </span>
    <slot />
  </button>
</template>
