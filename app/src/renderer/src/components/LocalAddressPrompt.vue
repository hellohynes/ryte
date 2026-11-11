<script setup lang="ts">
import { computed } from 'vue'

import { describeOrigin } from '../../../shared/local-address'
import { useLocalAddressStore } from '../stores/local-address'
import StButton from '../stencil/components/StButton.vue'
import StDialog from '../stencil/components/StDialog.vue'
import StStack from '../stencil/components/StStack.vue'
import StText from '../stencil/components/StText.vue'

const local = useLocalAddressStore()
const name = computed(() => (local.pending ? describeOrigin(local.pending.origin) : ''))
</script>

<template>
  <StDialog v-if="local.pending" labelledby="local-address-title" @dismiss="local.cancel()">
    <section class="local-prompt" data-local-prompt>
      <StStack :gap="200">
        <StText id="local-address-title" as="h2" kind="headline" size="sm">
          Open {{ name }} in Ryte?
        </StText>
        <StText tone="secondary">
          This page can reach only {{ name }} on your Mac. It can't reach the internet or your
          notes.
        </StText>
        <StStack direction="row" :gap="100" justify="end" wrap>
          <StButton variant="ghost" data-local-prompt-cancel @click="local.cancel()">
            Cancel
          </StButton>
          <StButton data-local-prompt-once @click="local.choose('once')">Open once</StButton>
          <StButton variant="primary" data-local-prompt-always @click="local.choose('always')">
            Always allow
          </StButton>
        </StStack>
      </StStack>
    </section>
  </StDialog>
</template>

<style scoped>
.local-prompt {
  width: min(var(--st-layout-700), calc(100vw - var(--st-block-600)));
  box-sizing: border-box;
  padding: var(--st-space-300);
  border: var(--st-border-100) solid var(--st-color-border-base);
  border-radius: var(--st-space-125);
  background: var(--st-color-surface-base);
  box-shadow: var(--st-shadow-xl);
}
</style>
