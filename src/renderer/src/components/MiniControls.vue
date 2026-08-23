<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/16/solid'
import { Coffee, Play } from '@lucide/vue'
import { time, TimeTrackerStartStop } from '@solidtime/ui'
import { useLiveTimer } from '../utils/liveTimer'
import { useMyMemberships } from '../utils/myMemberships'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useStorage } from '@vueuse/core'
import {
    emptyTimeEntry,
    getCurrentTimeEntry,
    getTimeEntriesPage,
    useCurrentTimeEntryUpdateMutation,
} from '../utils/timeEntries'
import { useIsMutating, useQuery } from '@tanstack/vue-query'
import { getAllProjects } from '../utils/projects'
import { getAllTasks } from '../utils/tasks'
import { sendEventToWindow } from '../utils/events'
import { showMainWindow } from '../utils/window'
import { dayjs } from '../utils/dayjs'
import { useBreaksEnabled } from '../utils/organization'
import { projectSortOrder, sortNamedItems, taskSortOrder } from '../utils/listSorting'
import type { TimeEntry } from '@solidtime/api'
const { liveTimer, startLiveTimer, stopLiveTimer } = useLiveTimer()

interface DescriptionSuggestion {
    description: string | null
    projectId: string | null
    taskId: string | null
    projectName: string | null
    projectColor: string | null
    taskName: string | null
}

const { currentOrganizationId, memberships } = useMyMemberships()
const currentTimeEntry = useStorage('currentTimeEntry', { ...emptyTimeEntry })
const lastTimeEntry = useStorage('lastTimeEntry', { ...emptyTimeEntry })
const currentTimeEntryUpdateMutation = useCurrentTimeEntryUpdateMutation()
const pendingTimeEntryMutations = useIsMutating({
    predicate: (mutation) => mutation.options.scope?.id === 'timeEntry',
})

const {
    data: currentTimeEntryResponse,
    isError: currentTimeEntryResponseIsError,
    dataUpdatedAt: currentTimeEntryUpdatedAt,
    errorUpdatedAt: currentTimeEntryErrorUpdatedAt,
} = useQuery({
    queryKey: ['currentTimeEntry'],
    queryFn: () => getCurrentTimeEntry(),
    staleTime: 0,
    enabled: computed(() => pendingTimeEntryMutations.value === 0),
})

function reconcileCurrentTimeEntry() {
    if (currentTimeEntryResponseIsError.value) {
        if (currentTimeEntry.value.id !== '') {
            currentTimeEntry.value = { ...emptyTimeEntry }
        }
        return
    }

    if (currentTimeEntryResponse.value?.data) {
        currentTimeEntry.value = { ...currentTimeEntryResponse.value.data }
    } else if (currentTimeEntry.value.id !== '') {
        currentTimeEntry.value = { ...emptyTimeEntry }
    }
}

watch([currentTimeEntryUpdatedAt, currentTimeEntryErrorUpdatedAt], reconcileCurrentTimeEntry)

const organizationIdToLoad = computed(() => {
    if (currentTimeEntry.value.organization_id && currentTimeEntry.value.organization_id !== '') {
        return currentTimeEntry.value.organization_id
    }
    return currentOrganizationId.value
})

const currentOrganizationLoaded = computed(() => !!organizationIdToLoad.value)
const breaksEnabled = useBreaksEnabled(organizationIdToLoad)

const isRunning = computed(
    () => currentTimeEntry.value.start !== '' && currentTimeEntry.value.start !== null
)

const isOnBreak = computed(() => isRunning.value && currentTimeEntry.value.type === 'break')
const canEditEntry = computed(() => isRunning.value && !isOnBreak.value)

// Guard: a stale stored break entry must never be offered for resume
const canResumeAfterBreak = computed(
    () =>
        isOnBreak.value && lastTimeEntry.value.start !== '' && lastTimeEntry.value.type !== 'break'
)

const resumeDescription = computed(() => lastTimeEntry.value.description || null)

function startBreak() {
    sendEventToWindow('main', 'startBreak')
}

function resumeAfterBreak() {
    sendEventToWindow('main', 'resumeAfterBreak')
}
const { data: projectsResponse } = useQuery({
    queryKey: ['projects', organizationIdToLoad],
    queryFn: () => getAllProjects(organizationIdToLoad.value),
    enabled: currentOrganizationLoaded,
})

const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', organizationIdToLoad],
    queryFn: () => getAllTasks(organizationIdToLoad.value),
    enabled: currentOrganizationLoaded,
})

const { data: currentTimeEntryTasksResponse } = useQuery({
    queryKey: ['tasks', currentTimeEntry.value.organization_id],
    queryFn: () => getAllTasks(currentTimeEntry.value.organization_id),
    enabled: currentOrganizationLoaded,
})

const organizationMembershipIdToLoad = computed(
    () =>
        memberships.value.find(
            (membership) => membership.organization.id === organizationIdToLoad.value
        )?.id ?? null
)
const descriptionHistoryEnabled = computed(
    () => currentOrganizationLoaded.value && organizationMembershipIdToLoad.value !== null
)
const { data: descriptionHistoryResponse, refetch: refetchDescriptionHistory } = useQuery({
    queryKey: ['miniDescriptionHistory', organizationIdToLoad, organizationMembershipIdToLoad],
    queryFn: () =>
        getTimeEntriesPage(
            organizationIdToLoad.value,
            organizationMembershipIdToLoad.value,
            undefined
        ),
    enabled: descriptionHistoryEnabled,
})

const tasks = computed(() => {
    const taskList = isRunning.value
        ? currentTimeEntryTasksResponse.value?.data
        : tasksResponse.value?.data
    return sortNamedItems(taskList, taskSortOrder.value)
})
const projects = computed(() => {
    return sortNamedItems(projectsResponse.value?.data, projectSortOrder.value)
})

const shownDescription = computed(() => {
    if (!isRunning.value) return null
    return currentTimeEntry.value.description || null
})
const currentTask = computed(() => {
    if (!isRunning.value) return undefined
    return tasks.value?.find((task) => task.id === currentTimeEntry.value.task_id)
})
const shownProject = computed(() => {
    if (!isRunning.value) return undefined
    return projects.value?.find((project) => project.id === currentTimeEntry.value.project_id)
})

watchEffect(() => {
    if (isRunning.value) {
        startLiveTimer()
    } else {
        stopLiveTimer()
    }
})

function focusMainWindow() {
    showMainWindow()
}

function onToggleButtonPress(newState: boolean) {
    if (newState) {
        window.electronAPI.startTimer(true)
    } else {
        sendEventToWindow('main', 'stopTimer')
    }
}

const currentTimer = computed(() => {
    if (liveTimer.value && currentTimeEntry.value.start) {
        const startTime = dayjs(currentTimeEntry.value.start)
        const diff = liveTimer.value.diff(startTime, 'seconds')
        return time.formatDuration(diff)
    }
    return '00:00:00'
})

const isEditingDescription = ref(false)
const descriptionDraft = ref('')
const descriptionInput = ref<HTMLInputElement | null>(null)
const activeDescriptionSuggestionIndex = ref(-1)
const descriptionSuggestionsOpen = ref(false)
const descriptionHasUserInput = ref(false)
const descriptionHistoryPlacement = ref<'above' | 'below'>('below')
let descriptionBlurTimer: ReturnType<typeof setTimeout> | null = null

const recentDescriptionSuggestions = computed<DescriptionSuggestion[]>(() => {
    const entries = descriptionHistoryResponse.value?.data ?? []
    const unique = new Set<string>()
    const suggestions: DescriptionSuggestion[] = []

    for (const entry of entries) {
        const description = entry.description?.trim() || null
        const historicalTask = entry.task_id
            ? tasks.value?.find((task) => task.id === entry.task_id)
            : undefined
        const projectId = historicalTask?.project_id ?? entry.project_id ?? null
        const historicalProject = projectId
            ? projects.value?.find((project) => project.id === projectId)
            : undefined
        const resolvedProjectId = historicalProject?.id ?? null
        const taskId =
            historicalTask && resolvedProjectId && historicalTask.project_id === resolvedProjectId
                ? historicalTask.id
                : null
        const key = `${description ?? ''}\u0000${resolvedProjectId ?? ''}\u0000${taskId ?? ''}`

        if (unique.has(key)) continue
        unique.add(key)
        suggestions.push({
            description,
            projectId: resolvedProjectId,
            taskId,
            projectName: historicalProject?.name ?? null,
            projectColor: historicalProject?.color ?? null,
            taskName: taskId ? (historicalTask?.name ?? null) : null,
        })
    }

    return suggestions
})

const filteredDescriptionSuggestions = computed(() => {
    if (!descriptionHasUserInput.value) return []

    const term = descriptionDraft.value.trim().toLocaleLowerCase()
    if (!term) return []

    return recentDescriptionSuggestions.value
        .filter((suggestion) =>
            (suggestion.description ?? 'No Description').toLocaleLowerCase().includes(term)
        )
        .slice(0, 12)
})

function closeDescriptionSuggestions() {
    if (descriptionSuggestionsOpen.value) {
        window.electronAPI.setMiniDescriptionHistory(0)
        descriptionSuggestionsOpen.value = false
    }
    activeDescriptionSuggestionIndex.value = -1
}

function syncDescriptionSuggestions() {
    if (!isEditingDescription.value || filteredDescriptionSuggestions.value.length === 0) {
        closeDescriptionSuggestions()
        return
    }

    if (activeDescriptionSuggestionIndex.value >= filteredDescriptionSuggestions.value.length) {
        activeDescriptionSuggestionIndex.value = -1
    }

    descriptionSuggestionsOpen.value = true
    window.electronAPI.setMiniDescriptionHistory(filteredDescriptionSuggestions.value.length)
}

async function startDescriptionEdit() {
    if (!canEditEntry.value) return
    descriptionDraft.value = currentTimeEntry.value.description ?? ''
    descriptionHasUserInput.value = false
    activeDescriptionSuggestionIndex.value = -1
    isEditingDescription.value = true
    await nextTick()
    descriptionInput.value?.focus()
    descriptionInput.value?.select()
}

function cancelDescriptionEdit() {
    if (descriptionBlurTimer) {
        clearTimeout(descriptionBlurTimer)
        descriptionBlurTimer = null
    }
    closeDescriptionSuggestions()
    isEditingDescription.value = false
    descriptionHasUserInput.value = false
    descriptionDraft.value = ''
}

async function updateCurrentEntry(changes: Partial<TimeEntry>) {
    if (!canEditEntry.value || !currentTimeEntry.value.id) return

    const previousEntry = { ...currentTimeEntry.value }
    const updatedEntry = {
        ...currentTimeEntry.value,
        ...changes,
    }
    currentTimeEntry.value = updatedEntry

    try {
        await currentTimeEntryUpdateMutation.mutateAsync(updatedEntry)
    } catch {
        currentTimeEntry.value = previousEntry
    }
}

async function commitDescription(value: string) {
    if (!isEditingDescription.value) return
    if (descriptionBlurTimer) {
        clearTimeout(descriptionBlurTimer)
        descriptionBlurTimer = null
    }
    closeDescriptionSuggestions()
    isEditingDescription.value = false
    descriptionHasUserInput.value = false
    const description = value.trim()
    descriptionDraft.value = ''
    await updateCurrentEntry({ description: description || null })
    void refetchDescriptionHistory()
}

async function saveDescription() {
    await commitDescription(descriptionDraft.value)
}

async function applyDescriptionSuggestion(suggestion: DescriptionSuggestion) {
    if (!canEditEntry.value) return
    if (descriptionBlurTimer) {
        clearTimeout(descriptionBlurTimer)
        descriptionBlurTimer = null
    }
    closeDescriptionSuggestions()
    isEditingDescription.value = false
    descriptionHasUserInput.value = false
    descriptionDraft.value = ''
    await updateCurrentEntry({
        description: suggestion.description,
        project_id: suggestion.projectId,
        task_id: suggestion.taskId,
    })
    void refetchDescriptionHistory()
}

function handleDescriptionInput() {
    if (!isEditingDescription.value) return
    descriptionHasUserInput.value = true
    activeDescriptionSuggestionIndex.value = -1
    syncDescriptionSuggestions()
}

function handleDescriptionKeydown(event: KeyboardEvent) {
    const suggestions = filteredDescriptionSuggestions.value

    if (event.key === 'ArrowDown' && suggestions.length > 0) {
        event.preventDefault()
        activeDescriptionSuggestionIndex.value =
            activeDescriptionSuggestionIndex.value < suggestions.length - 1
                ? activeDescriptionSuggestionIndex.value + 1
                : 0
        syncDescriptionSuggestions()
        return
    }

    if (event.key === 'ArrowUp' && suggestions.length > 0) {
        event.preventDefault()
        activeDescriptionSuggestionIndex.value =
            activeDescriptionSuggestionIndex.value > 0
                ? activeDescriptionSuggestionIndex.value - 1
                : suggestions.length - 1
        syncDescriptionSuggestions()
        return
    }

    if (event.key === 'Enter') {
        event.preventDefault()
        const selected = suggestions[activeDescriptionSuggestionIndex.value]
        if (selected) {
            void applyDescriptionSuggestion(selected)
        } else {
            void commitDescription(descriptionDraft.value)
        }
        return
    }

    if (event.key === 'Escape') {
        event.preventDefault()
        cancelDescriptionEdit()
    }
}

function handleDescriptionBlur() {
    if (descriptionBlurTimer) {
        clearTimeout(descriptionBlurTimer)
    }
    descriptionBlurTimer = setTimeout(() => {
        descriptionBlurTimer = null
        if (isEditingDescription.value) {
            void saveDescription()
        }
    }, 120)
}

function openProjectTaskPicker() {
    if (!canEditEntry.value) return

    if (isEditingDescription.value) {
        void saveDescription()
    } else {
        closeDescriptionSuggestions()
    }

    window.electronAPI.openProjectTaskPicker({
        projects: (projects.value ?? []).map((project) => ({
            id: project.id,
            name: project.name,
            color: project.color ?? null,
        })),
        tasks: (tasks.value ?? []).map((task) => ({
            id: task.id,
            name: task.name,
            project_id: task.project_id,
        })),
        currentProjectId: currentTimeEntry.value.project_id ?? null,
        currentTaskId: currentTimeEntry.value.task_id ?? null,
    })
}

let removeProjectTaskPickerSelectionListener: (() => void) | null = null
let removeDescriptionHistoryPlacementListener: (() => void) | null = null

onMounted(() => {
    removeProjectTaskPickerSelectionListener = window.electronAPI.onProjectTaskPickerSelection(
        (selection) => {
            if (!canEditEntry.value) return

            if (selection.taskId) {
                const selectedTask = tasks.value?.find((task) => task.id === selection.taskId)
                if (!selectedTask) return
                void updateCurrentEntry({
                    project_id: selectedTask.project_id,
                    task_id: selectedTask.id,
                })
                return
            }

            if (selection.projectId) {
                const selectedProject = projects.value?.find(
                    (project) => project.id === selection.projectId
                )
                if (!selectedProject) return
            }

            // Selecting a project by itself always clears the old task. This
            // prevents an invalid project/task combination from reaching the API.
            void updateCurrentEntry({
                project_id: selection.projectId,
                task_id: null,
            })
        }
    )

    removeDescriptionHistoryPlacementListener =
        window.electronAPI.onMiniDescriptionHistoryPlacement((placement) => {
            descriptionHistoryPlacement.value = placement
        })
})

watch(isRunning, (running) => {
    if (!running) {
        cancelDescriptionEdit()
    }
})

onBeforeUnmount(() => {
    if (descriptionBlurTimer) {
        clearTimeout(descriptionBlurTimer)
        descriptionBlurTimer = null
    }
    closeDescriptionSuggestions()
    removeProjectTaskPickerSelectionListener?.()
    removeDescriptionHistoryPlacementListener?.()
})
</script>

<template>
    <div class="h-screen w-screen flex flex-col overflow-hidden bg-transparent select-none">
        <div
            v-if="descriptionSuggestionsOpen"
            class="min-h-0 flex-1 overflow-y-auto border border-border-primary bg-background shadow-xl text-text-primary p-1.5"
            :class="descriptionHistoryPlacement === 'above' ? 'order-1' : 'order-3'"
            style="-webkit-app-region: no-drag">
            <button
                v-for="(suggestion, index) in filteredDescriptionSuggestions"
                :key="`${suggestion.description ?? ''}:${suggestion.projectId ?? ''}:${suggestion.taskId ?? ''}`"
                type="button"
                class="w-full min-w-0 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                :class="index === activeDescriptionSuggestionIndex ? 'bg-black/[0.07] dark:bg-white/[0.07]' : ''"
                @mousedown.left.prevent="applyDescriptionSuggestion(suggestion)">
                <span
                    class="min-w-0 flex-1 truncate font-medium"
                    :class="suggestion.description ? 'text-text-primary' : 'text-text-tertiary'">
                    {{ suggestion.description ?? 'No Description' }}
                </span>
                <span
                    class="max-w-[52%] min-w-0 shrink-0 inline-flex items-center gap-1 rounded-md border border-border-primary bg-background px-2 py-1 text-xs">
                    <span
                        class="w-3 h-3 rounded-full shrink-0"
                        :style="{ backgroundColor: suggestion.projectColor ?? '#a1a1aa' }"></span>
                    <span class="truncate">{{ suggestion.projectName ?? 'No Project' }}</span>
                    <template v-if="suggestion.taskName">
                        <ChevronRightIcon class="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
                        <span class="truncate">{{ suggestion.taskName }}</span>
                    </template>
                </span>
            </button>
        </div>

        <div v-if="descriptionSuggestionsOpen" class="h-[6px] shrink-0 order-2"></div>

        <div
            class="h-[52px] shrink-0 relative w-full border-border-secondary border bg-primary rounded-none py-1 flex items-center cursor-default justify-between overflow-hidden"
            :class="descriptionHistoryPlacement === 'above' ? 'order-3' : 'order-1'">
            <div
                class="flex items-center relative min-w-0"
                :class="isOnBreak ? 'shrink-0' : 'flex-1'">
                <div class="pl-1 pr-1 z-20 relative block" style="-webkit-app-region: drag">
                    <svg
                        class="h-6"
                        viewBox="0 0 25 25"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        data-tauri-drag-region>
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M9.5 8C10.3284 8 11 7.32843 11 6.5C11 5.67157 10.3284 5 9.5 5C8.67157 5 8 5.67157 8 6.5C8 7.32843 8.67157 8 9.5 8ZM9.5 14C10.3284 14 11 13.3284 11 12.5C11 11.6716 10.3284 11 9.5 11C8.67157 11 8 11.6716 8 12.5C8 13.3284 8.67157 14 9.5 14ZM11 18.5C11 19.3284 10.3284 20 9.5 20C8.67157 20 8 19.3284 8 18.5C8 17.6716 8.67157 17 9.5 17C10.3284 17 11 17.6716 11 18.5ZM15.5 8C16.3284 8 17 7.32843 17 6.5C17 5.67157 16.3284 5 15.5 5C14.6716 5 14 5.67157 14 6.5C14 7.32843 14.6716 8 15.5 8ZM17 12.5C17 13.3284 16.3284 14 15.5 14C14.6716 14 14 13.3284 14 12.5C14 11.6716 14.6716 11 15.5 11C16.3284 11 17 11.6716 17 12.5ZM15.5 20C16.3284 20 17 19.3284 17 18.5C17 17.6716 16.3284 17 15.5 17C14.6716 17 14 17.6716 14 18.5C14 19.3284 14.6716 20 15.5 20Z"
                            fill="currentColor"
                            data-tauri-drag-region />
                    </svg>
                </div>
                <div class="rounded-lg flex items-center shrink min-w-0 flex-1">
                    <div
                        v-if="isOnBreak"
                        class="flex items-center shrink-0 space-x-1.5 text-sm font-medium whitespace-nowrap text-amber-600 dark:text-amber-400 cursor-pointer"
                        @click="focusMainWindow">
                        <Coffee class="w-4 h-4 shrink-0" />
                        <span>On break</span>
                    </div>
                    <div v-else class="flex flex-col flex-1 min-w-0 gap-[3px] leading-[1.05]">
                        <input
                            v-if="isEditingDescription"
                            ref="descriptionInput"
                            v-model="descriptionDraft"
                            type="text"
                            autocomplete="off"
                            class="h-[18px] w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium text-black outline-none ring-0 focus:ring-0"
                            style="-webkit-app-region: no-drag"
                            @input="handleDescriptionInput"
                            @keydown="handleDescriptionKeydown"
                            @blur="handleDescriptionBlur" />
                        <button
                            v-else
                            type="button"
                            class="truncate text-left text-sm font-medium disabled:cursor-default"
                            :class="[
                                shownDescription ? 'text-black' : 'text-black/20',
                                canEditEntry ? 'cursor-text hover:bg-black/5 rounded-sm' : '',
                            ]"
                            :disabled="!canEditEntry"
                            style="-webkit-app-region: no-drag"
                            @click="startDescriptionEdit">
                            {{ shownDescription ?? 'No Description' }}
                        </button>
                        <button
                            type="button"
                            class="flex items-center min-w-0 text-sm text-black text-left disabled:cursor-default"
                            :class="canEditEntry ? 'cursor-pointer hover:bg-black/5 rounded-sm' : ''"
                            :disabled="!canEditEntry"
                            style="-webkit-app-region: no-drag"
                            @click="openProjectTaskPicker">
                            <span
                                class="w-2.5 h-2.5 rounded-full shrink-0 mr-1.5"
                                :style="{ backgroundColor: shownProject?.color ?? '#a1a1aa' }"></span>
                            <span class="truncate shrink min-w-0">
                                {{ shownProject?.name ?? 'No Project' }}
                            </span>
                            <template v-if="currentTask">
                                <ChevronRightIcon
                                    class="w-4 shrink-0 mx-0.5 text-black"></ChevronRightIcon>
                                <span class="truncate shrink min-w-0">{{ currentTask.name }}</span>
                            </template>
                        </button>
                    </div>
                </div>
            </div>

            <div
                class="pr-2.5 flex items-center space-x-1 min-w-0"
                :class="isOnBreak ? 'flex-1 justify-end pl-2' : ''">
                <button
                    v-if="canResumeAfterBreak"
                    type="button"
                    class="flex min-w-0 shrink items-center gap-1 h-7 px-2 rounded-md bg-transparent border border-amber-500/40 hover:bg-amber-500/15 text-xs font-medium text-amber-600 dark:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition"
                    @click="resumeAfterBreak">
                    <Play class="w-3 h-3 shrink-0" />
                    <span class="truncate">{{
                        resumeDescription ? `Resume "${resumeDescription}"` : 'Resume'
                    }}</span>
                </button>
                <div
                    class="text-base font-semibold text-black px-2 w-[82px] shrink-0 text-left"
                    style="-webkit-app-region: drag">
                    {{ currentTimer }}
                </div>
                <button
                    v-if="breaksEnabled && !isOnBreak && isRunning"
                    type="button"
                    title="Take a break"
                    aria-label="Take a break"
                    class="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-quaternary text-text-tertiary hover:text-amber-500 focus:ring-2 focus:ring-border-tertiary transition"
                    @click="startBreak">
                    <Coffee class="w-[18px] h-[18px]" />
                </button>
                <TimeTrackerStartStop
                    class="shrink-0 scale-110 mx-0.5"
                    :active="isRunning"
                    :variant="isOnBreak ? 'break' : 'primary'"
                    size="small"
                    @changed="onToggleButtonPress"></TimeTrackerStartStop>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
