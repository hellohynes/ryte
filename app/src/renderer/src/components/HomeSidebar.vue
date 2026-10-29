<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useDocumentTitles } from '../composables/useDocumentTitles'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useTasksStore } from '../stores/tasks'
import { useWorkspaceStore } from '../stores/workspace'
import {
  buildHomeSidebarModel,
  homeSmartGroupItemTitle,
  type HomeSmartGroupId,
  type HomeSmartGroupItem
} from './home-sidebar-model'
import StIcon from '../stencil/icons/StIcon.vue'
import StNotice from '../stencil/components/StNotice.vue'
import SidebarSearchButton from './SidebarSearchButton.vue'

const emit = defineEmits<{
  openSearch: []
}>()

const workspace = useWorkspaceStore()
const catalog = useFileCatalogStore()
const tasks = useTasksStore()
const activeTaskFingerprint = ref<string | null>(null)
const model = computed(() =>
  buildHomeSidebarModel({
    catalogFiles: catalog.files,
    recents: workspace.recents,
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId,
    taskFacts: tasks.openTasks,
    activeTaskFingerprint: activeTaskFingerprint.value
  })
)
const collapsedGroupIds = ref<Set<HomeSmartGroupId>>(new Set())
const catalogSourcePaths = computed(() => new Set(catalog.files.map((file) => file.sourcePath)))
const showInitialLoadingState = computed(() => catalog.loading && catalog.files.length === 0)
const showBlockingErrorState = computed(() => catalog.error !== null && catalog.files.length === 0)
const showRefreshErrorState = computed(() => catalog.error !== null && catalog.files.length > 0)
const showTaskRefreshErrorState = computed(() => tasks.error !== null && tasks.tasks.length === 0)

function isGroupExpanded(groupId: HomeSmartGroupId): boolean {
  return !collapsedGroupIds.value.has(groupId)
}

function toggleGroup(groupId: HomeSmartGroupId): void {
  const nextGroupIds = new Set(collapsedGroupIds.value)
  if (nextGroupIds.has(groupId)) {
    nextGroupIds.delete(groupId)
  } else {
    nextGroupIds.add(groupId)
  }
  collapsedGroupIds.value = nextGroupIds
}

const visibleSourcePaths = computed(() => {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const group of model.value.groups) {
    if (!isGroupExpanded(group.id)) continue
    for (const item of group.items) {
      if (seen.has(item.sourcePath)) continue
      seen.add(item.sourcePath)
      paths.push(item.sourcePath)
    }
  }

  return paths
})

const uncatalogedVisibleSourcePaths = computed(() =>
  visibleSourcePaths.value.filter((sourcePath) => !catalogSourcePaths.value.has(sourcePath))
)
const documentTitles = useDocumentTitles(
  uncatalogedVisibleSourcePaths,
  computed(() => catalog.revision)
)

onMounted(() => {
  void catalog.hydrate()
  void tasks.hydrate()
})

onUnmounted(() => {
  catalog.unbind()
  tasks.unbind()
})

function itemTitle(item: HomeSmartGroupItem): string {
  return homeSmartGroupItemTitle(item, documentTitles.value[item.sourcePath])
}

function activateItem(item: HomeSmartGroupItem): void {
  activeTaskFingerprint.value = item.taskFingerprint ?? null
  void workspace.openExplicitFile({ sourcePath: item.action.sourcePath })
}
</script>

<template>
  <nav class="home-sidebar ryte-scrollbar ryte-scrollbar--y" aria-label="Home sidebar">
    <div class="home-search">
      <SidebarSearchButton @search="emit('openSearch')" />
    </div>

    <p v-if="showInitialLoadingState" class="home-state">Loading files...</p>
    <StNotice v-else-if="showBlockingErrorState" tone="danger" class="home-notice"
      >Could not load file list.</StNotice
    >
    <StNotice v-else-if="showRefreshErrorState" tone="danger" class="home-notice"
      >Could not refresh file list.</StNotice
    >
    <StNotice v-else-if="showTaskRefreshErrorState" tone="danger" class="home-notice"
      >Could not load tasks.</StNotice
    >

    <template v-if="!showInitialLoadingState && !showBlockingErrorState">
      <section
        v-for="group in model.groups"
        :key="group.id"
        class="home-section"
        :class="{ expanded: isGroupExpanded(group.id) && group.items.length > 0 }"
        :aria-labelledby="group.headingId"
      >
        <h2 :id="group.headingId" class="home-heading">
          <button
            type="button"
            class="home-group-toggle"
            :aria-expanded="isGroupExpanded(group.id)"
            :aria-controls="`${group.id}-home-list`"
            @click="toggleGroup(group.id)"
          >
            <span class="group-chevron" :class="{ open: isGroupExpanded(group.id) }">
              <StIcon name="chevron-right" :size="14" />
            </span>
            <span>{{ group.title }}</span>
          </button>
        </h2>
        <p v-if="isGroupExpanded(group.id) && group.items.length === 0" class="home-empty">
          {{ group.emptyLabel }}
        </p>
        <ul v-else-if="isGroupExpanded(group.id)" :id="`${group.id}-home-list`" class="home-list">
          <li v-for="item in group.items" :key="item.id">
            <div class="home-row-frame">
              <button
                type="button"
                class="home-row"
                :class="{ active: item.active }"
                :title="item.sourcePath"
                :aria-current="item.active && !item.taskFingerprint ? 'page' : undefined"
                :aria-label="item.ariaLabel"
                @click="activateItem(item)"
              >
                <span class="row-copy">
                  <span class="row-title">{{ itemTitle(item) }}</span>
                  <span class="row-path">{{ item.detail ?? item.sourcePath }}</span>
                </span>
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </nav>
</template>

<style scoped>
.home-sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  font-size: var(--st-type-body-compact-size);
}

.home-sidebar:focus-within {
  outline: none;
}

.home-search {
  padding: var(--st-space-125) var(--st-space-150) var(--st-space-150);
}

.home-section {
  position: relative;
  padding: var(--st-space-100) var(--st-space-150);
}

.home-state {
  margin: 0 var(--st-space-150) var(--st-space-100);
  border-radius: var(--st-space-100);
  padding: var(--st-space-100) var(--st-space-125);
  color: var(--st-color-text-muted);
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
}

.home-notice {
  margin: 0 var(--st-space-150) var(--st-space-100);
}

.home-section.expanded::before {
  content: '';
  position: absolute;
  top: var(--st-space-400);
  bottom: var(--st-space-75);
  left: var(--st-space-300);
  z-index: 2;
  width: var(--st-block-1);
  pointer-events: none;
  background: var(--st-color-surface-active);
}

.home-heading {
  margin: 0;
  text-transform: uppercase;
}

.home-group-toggle {
  position: relative;
  width: 100%;
  height: 2.167em;
  display: flex;
  align-items: center;
  gap: var(--st-space-125);
  border: 0;
  border-radius: 0.5em;
  box-sizing: border-box;
  padding-block: 0.583em;
  padding-right: 0.25em;
  padding-left: 0.25em;
  background: transparent;
  color: var(--st-color-text-primary);
  font: inherit;
  font-size: var(--st-type-label-md-size);
  font-weight: var(--st-type-label-md-weight);
  line-height: var(--st-type-label-md-leading);
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.home-group-toggle:hover,
.home-group-toggle:focus-visible {
  background: var(--st-color-surface-hover);
  outline: 0;
}

.group-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--st-block-175);
  height: var(--st-block-175);
  color: var(--st-color-text-strong);
  transition: transform 120ms;
}

.group-chevron.open {
  transform: rotate(90deg);
}

.home-empty {
  margin: 0;
  padding: var(--st-space-100) var(--st-space-350) var(--st-space-125);
  color: var(--st-color-text-muted);
  font-size: var(--st-type-body-sm-size);
  line-height: var(--st-type-body-sm-leading);
}

.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.home-row-frame {
  position: relative;
}

.home-row {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: var(--st-block-525);
  display: flex;
  align-items: center;
  gap: var(--st-space-100);
  border: 0;
  border-radius: var(--st-space-100);
  padding: var(--st-space-75) var(--st-space-350);
  background: transparent;
  color: var(--st-color-text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.home-row:hover,
.home-row:focus-visible {
  background: var(--st-color-surface-hover);
  color: var(--st-color-text-strong);
  outline: 0;
}

.home-row.active {
  background: var(--st-color-surface-selected);
  box-shadow: inset 0 0 0 var(--st-border-100) var(--st-color-accent);
  color: var(--st-color-text-strong);
}

.row-copy {
  min-width: 0;
  display: grid;
  gap: var(--st-space-50);
}

.row-title,
.row-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title {
  color: inherit;
  font-size: var(--st-type-body-compact-size);
  line-height: var(--st-type-body-compact-leading);
}

.row-path {
  color: var(--st-color-text-muted);
  font-family: var(--st-type-code-sm-family);
  font-size: var(--st-type-code-sm-size);
  line-height: var(--st-type-code-sm-leading);
}

.home-row:hover .row-path,
.home-row:focus-visible .row-path,
.home-row.active .row-path {
  color: var(--st-color-text-tertiary);
}
</style>
