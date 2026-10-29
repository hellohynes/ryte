<script setup lang="ts">
import { ref } from 'vue'

import StBox from '../../components/StBox.vue'
import StButton from '../../components/StButton.vue'
import StDialog from '../../components/StDialog.vue'
import StDisclosure from '../../components/StDisclosure.vue'
import StIconButton from '../../components/StIconButton.vue'
import StInput from '../../components/StInput.vue'
import StMenu from '../../components/StMenu.vue'
import StMenuItem from '../../components/StMenuItem.vue'
import StMenuLabel from '../../components/StMenuLabel.vue'
import StMenuSeparator from '../../components/StMenuSeparator.vue'
import StPopover from '../../components/StPopover.vue'
import StStack from '../../components/StStack.vue'
import StText from '../../components/StText.vue'
import StToaster from '../../components/StToaster.vue'
import StTooltip from '../../components/StTooltip.vue'
import { toast } from '../../toast-store'

const dialogOpen = ref(false)
const mountedDialog = ref(false)
const dialogMenuOpen = ref(false)
const dialogMenuButton = ref<HTMLElement | null>(null)
const dialogName = ref('Untitled')
const popoverOpen = ref(false)
const popoverButton = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuButton = ref<HTMLElement | null>(null)
const chosen = ref('')
const sort = ref('name')
const contextOpen = ref(false)
const contextAnchor = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const disclosureOpen = ref(false)

function openContext(event: MouseEvent): void {
  event.preventDefault()
  contextAnchor.value = { x: event.clientX, y: event.clientY, width: 0, height: 0 }
  contextOpen.value = true
}

function choose(name: string): void {
  chosen.value = name
}
</script>

<template>
  <section id="overlays">
    <header>
      <span class="g-mono">07.</span>
      <h2>Overlays</h2>
    </header>
    <p class="g-lede">
      Dialog, popover and tooltip use the browser's top layer. Escape closes the top layer only, and
      focus returns to what opened it.
    </p>

    <div class="g-sub">
      <h3>StDialog</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StButton id="demo-dialog-open" @click="dialogOpen = true">Open dialog</StButton>
          <span class="g-mono">native dialog · modal · Escape · scrim click</span>
        </div>
      </div>
      <StDialog
        id="demo-dialog"
        :open="dialogOpen"
        label="Rename note"
        @dismiss="dialogOpen = false"
      >
        <StBox surface="raised" border="subtle" :radius="200" shadow="lg" :padding="300">
          <StStack :gap="200">
            <StText as="h4" kind="headline" size="sm">Rename note</StText>
            <StInput v-model="dialogName" label="Name" />
            <StStack direction="row" align="center" justify="between" :gap="100">
              <StButton
                id="demo-dialog-menu-button"
                ref="dialogMenuButton"
                variant="ghost"
                aria-haspopup="menu"
                @click="dialogMenuOpen = !dialogMenuOpen"
              >
                More
              </StButton>
              <StStack direction="row" :gap="100">
                <StButton id="demo-dialog-cancel" @click="dialogOpen = false">Cancel</StButton>
                <StButton variant="primary" @click="dialogOpen = false">Rename</StButton>
              </StStack>
            </StStack>
          </StStack>
        </StBox>
        <StMenu
          id="demo-dialog-menu"
          :open="dialogMenuOpen"
          :anchor="(dialogMenuButton as unknown as { $el: HTMLElement } | null)?.$el"
          label="More"
          @dismiss="dialogMenuOpen = false"
        >
          <StMenuItem>Duplicate</StMenuItem>
          <StMenuItem>Move…</StMenuItem>
        </StMenu>
      </StDialog>
      <div class="g-cells">
        <div class="g-swatch">
          <StButton id="demo-mounted-open" @click="mountedDialog = true"
            >Open mounted dialog</StButton
          >
          <span class="g-mono">closed by v-if, as the app does</span>
        </div>
      </div>
      <StDialog
        v-if="mountedDialog"
        id="demo-mounted"
        label="Mounted dialog"
        @dismiss="mountedDialog = false"
      >
        <StBox surface="raised" border="subtle" :radius="200" shadow="lg" :padding="300">
          <StButton id="demo-mounted-close" @click="mountedDialog = false">Close</StButton>
        </StBox>
      </StDialog>
      <p class="g-mono">
        open · label · placement (center, top) · scrim (dim, clear) · dismissable · emits dismiss
      </p>
    </div>

    <div class="g-sub">
      <h3>StPopover</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StButton
            id="demo-popover-open"
            ref="popoverButton"
            aria-haspopup="dialog"
            @click="popoverOpen = !popoverOpen"
          >
            Open popover
          </StButton>
          <span class="g-mono">anchored · flips · Escape · outside press</span>
        </div>
      </div>
      <StPopover
        id="demo-popover"
        :open="popoverOpen"
        :anchor="(popoverButton as unknown as { $el: HTMLElement } | null)?.$el"
        label="Details"
        @dismiss="popoverOpen = false"
      >
        <StBox :padding="150">
          <StText as="p" kind="body" size="compact">Anchored to its button.</StText>
          <StInput label="Quick note" />
        </StBox>
      </StPopover>
      <p class="g-mono">open · anchor (element or rect) · side · align · offset · label · role</p>
    </div>

    <div class="g-sub">
      <h3>StMenu</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StButton
            id="demo-menu-open"
            ref="menuButton"
            aria-haspopup="menu"
            @click="menuOpen = !menuOpen"
          >
            Actions
          </StButton>
          <span class="g-mono"
            >arrows · Home/End · type to jump · Tab closes · chose: {{ chosen || '—' }}</span
          >
        </div>
        <div class="g-swatch">
          <div id="demo-context-area" class="g-context-area" @contextmenu="openContext">
            Right-click here
          </div>
          <span class="g-mono">opens at the pointer</span>
        </div>
      </div>
      <StMenu
        id="demo-menu"
        :open="menuOpen"
        :anchor="(menuButton as unknown as { $el: HTMLElement } | null)?.$el"
        label="Actions"
        @dismiss="menuOpen = false"
      >
        <StMenuLabel>File</StMenuLabel>
        <StMenuItem @click="choose('copy')">Copy file</StMenuItem>
        <StMenuItem @click="choose('rename')">Rename</StMenuItem>
        <StMenuSeparator />
        <StMenuItem role="menuitemradio" :checked="sort === 'name'" @click="sort = 'name'">
          Sort by name
        </StMenuItem>
        <StMenuItem role="menuitemradio" :checked="sort === 'date'" @click="sort = 'date'">
          Sort by date
        </StMenuItem>
        <StMenuItem disabled>Unavailable</StMenuItem>
        <StMenuSeparator />
        <StMenuItem tone="danger" @click="choose('trash')">Move to Trash</StMenuItem>
      </StMenu>
      <StMenu
        id="demo-context-menu"
        :open="contextOpen"
        :anchor="contextAnchor"
        label="Context actions"
        @dismiss="contextOpen = false"
      >
        <StMenuItem @click="choose('context-copy')">Copy</StMenuItem>
        <StMenuItem @click="choose('context-paste')">Paste</StMenuItem>
      </StMenu>
      <p class="g-mono">
        open · anchor · label · side · align · items: StMenuItem, StMenuSeparator
      </p>
    </div>

    <div class="g-sub">
      <h3>StTooltip</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StTooltip v-slot="{ describedby }" text="Refresh the list">
            <StIconButton
              id="demo-tooltip-trigger"
              icon="refresh"
              label="Refresh"
              :aria-describedby="describedby"
            />
          </StTooltip>
          <span class="g-mono">hover after a pause · shows on keyboard focus · Escape hides</span>
        </div>
      </div>
      <p class="g-mono">text · side · delay · slot { describedby }</p>
    </div>

    <div class="g-sub">
      <h3>StToaster</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StStack direction="row" :gap="100" wrap>
            <StButton id="demo-toast" @click="toast('Copied the file path')">Show toast</StButton>
            <StButton
              id="demo-toast-action"
              @click="
                toast({
                  message: 'Moved to Trash',
                  tone: 'success',
                  action: { label: 'Undo', onSelect: () => choose('undo') }
                })
              "
            >
              With action
            </StButton>
            <StButton
              id="demo-toast-danger"
              @click="toast({ message: 'Could not save that change', tone: 'danger' })"
            >
              Danger
            </StButton>
          </StStack>
          <span class="g-mono">pauses on hover · three at most · danger announces as alert</span>
        </div>
      </div>
      <StToaster />
      <p class="g-mono">toast(message | { message, tone, duration, action }) · dismissToast(id)</p>
    </div>

    <div class="g-sub">
      <h3>StDisclosure</h3>
      <div class="g-cells">
        <div class="g-swatch">
          <StDisclosure id="demo-disclosure" v-model:open="disclosureOpen">
            <template #summary>Details</template>
            <StText as="p" kind="body" size="md" tone="secondary">
              The body glides open. It is a native details element, so find-in-page and the keyboard
              work as expected.
            </StText>
          </StDisclosure>
          <span class="g-mono">native details · v-model:open · summary slot</span>
        </div>
      </div>
    </div>
  </section>
</template>
