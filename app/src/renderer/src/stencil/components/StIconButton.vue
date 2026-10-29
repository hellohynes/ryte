<script setup lang="ts">
/** A square button with one icon. Requires `label`, which is its accessible name and tooltip. The default slot overlays content on the icon, such as a shortcut badge. */
import { computed } from 'vue'

import StIcon from '../icons/StIcon.vue'
import type { IconName } from '../icons/icons.generated'
import { ICON_BUTTON_SIZES, iconButtonAttributes, type IconButtonProps } from './button-props'

const props = withDefaults(
  defineProps<
    IconButtonProps & {
      icon: IconName
      /** The accessible name. An icon button has no visible text, so this is required. */
      label: string
      type?: 'button' | 'submit' | 'reset'
    }
  >(),
  { type: 'button' }
)
const attrs = computed(() => iconButtonAttributes(props))
const iconSize = computed(() => ICON_BUTTON_SIZES[props.size ?? 'md'].icon)
</script>

<template>
  <button
    class="st-button st-icon-button"
    :type="type"
    :aria-label="label"
    :title="label"
    v-bind="attrs"
  >
    <StIcon :name="icon" :size="iconSize" />
    <!-- Anything overlaid on the icon, such as a shortcut badge. -->
    <slot />
  </button>
</template>
