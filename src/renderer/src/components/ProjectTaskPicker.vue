<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/vue/16/solid'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTheme } from '../utils/theme'

interface PickerProject {
    id: string
    name: string
    color: string | null
}

interface PickerTask {
    id: string
    name: string
    project_id: string
}

interface PickerData {
    projects: PickerProject[]
    tasks: PickerTask[]
    currentProjectId: string | null
    currentTaskId: string | null
}

const projects = ref<PickerProject[]>([])
const tasks = ref<PickerTask[]>([])
const currentProjectId = ref<string | null>(null)
const currentTaskId = ref<string | null>(null)
const search = ref('')
const expandedProjectIds = ref<Set<string>>(new Set())
let removeDataListener: (() => void) | null = null

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase())

function tasksForProject(projectId: string) {
    return tasks.value.filter((task) => task.project_id === projectId)
}

const visibleProjects = computed(() => {
    const term = normalizedSearch.value
    if (!term) return projects.value

    return projects.value.filter((project) => {
        if (project.name.toLocaleLowerCase().includes(term)) return true
        return tasksForProject(project.id).some((task) =>
            task.name.toLocaleLowerCase().includes(term)
        )
    })
})

function visibleTasksForProject(project: PickerProject) {
    const projectTasks = tasksForProject(project.id)
    const term = normalizedSearch.value
    if (!term || project.name.toLocaleLowerCase().includes(term)) return projectTasks
    return projectTasks.filter((task) => task.name.toLocaleLowerCase().includes(term))
}

function isExpanded(projectId: string) {
    return expandedProjectIds.value.has(projectId) || normalizedSearch.value.length > 0
}

function toggleProject(projectId: string) {
    const next = new Set(expandedProjectIds.value)
    if (next.has(projectId)) {
        next.delete(projectId)
    } else {
        next.add(projectId)
    }
    expandedProjectIds.value = next
}

function chooseProject(projectId: string | null) {
    window.electronAPI.selectProjectTask({ projectId, taskId: null })
}

function chooseTask(task: PickerTask) {
    window.electronAPI.selectProjectTask({ projectId: task.project_id, taskId: task.id })
}

function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        window.electronAPI.closeProjectTaskPicker()
    }
}

onMounted(() => {
    useTheme()
    window.addEventListener('keydown', handleEscape)
    removeDataListener = window.electronAPI.onProjectTaskPickerData((data: PickerData) => {
        projects.value = data.projects
        tasks.value = data.tasks
        currentProjectId.value = data.currentProjectId
        currentTaskId.value = data.currentTaskId
        if (data.currentProjectId) {
            expandedProjectIds.value = new Set([data.currentProjectId])
        }
    })
})

onBeforeUnmount(() => {
    removeDataListener?.()
    window.removeEventListener('keydown', handleEscape)
})
</script>

<template>
    <div class="h-screen w-screen p-1.5 bg-transparent">
        <div
            class="h-full overflow-hidden rounded-xl border border-border-primary bg-background shadow-xl flex flex-col text-text-primary">
            <div class="p-2 border-b border-border-primary shrink-0">
                <div class="relative">
                    <MagnifyingGlassIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                        v-model="search"
                        autofocus
                        type="text"
                        placeholder="Search for a project or task..."
                        class="w-full h-9 rounded-lg border border-border-primary bg-background pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-tertiary" />
                </div>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto p-1.5">
                <button
                    type="button"
                    class="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    :class="currentProjectId === null ? 'bg-black/5 dark:bg-white/5' : ''"
                    @click="chooseProject(null)">
                    <span class="w-4 h-4 rounded-full bg-zinc-300 shrink-0"></span>
                    <span class="font-medium">No Project</span>
                </button>

                <div v-for="project in visibleProjects" :key="project.id" class="mt-0.5">
                    <div
                        class="flex items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                        :class="
                            currentProjectId === project.id && currentTaskId === null
                                ? 'bg-black/5 dark:bg-white/5'
                                : ''
                        ">
                        <button
                            type="button"
                            class="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left"
                            @click="chooseProject(project.id)">
                            <span
                                class="w-4 h-4 rounded-full shrink-0"
                                :style="{ backgroundColor: project.color ?? '#a1a1aa' }"></span>
                            <span class="font-medium text-sm truncate">{{ project.name }}</span>
                        </button>
                        <button
                            v-if="tasksForProject(project.id).length > 0"
                            type="button"
                            class="shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm text-text-tertiary hover:text-text-primary"
                            :aria-label="`${isExpanded(project.id) ? 'Collapse' : 'Expand'} ${project.name} tasks`"
                            @click.stop="toggleProject(project.id)">
                            <span>{{ tasksForProject(project.id).length }} Tasks</span>
                            <ChevronDownIcon
                                v-if="isExpanded(project.id)"
                                class="w-4 h-4"></ChevronDownIcon>
                            <ChevronRightIcon v-else class="w-4 h-4"></ChevronRightIcon>
                        </button>
                    </div>

                    <div
                        v-if="tasksForProject(project.id).length > 0 && isExpanded(project.id)"
                        class="ml-8 mr-1 mb-1 border-l border-border-primary pl-2">
                        <button
                            v-for="task in visibleTasksForProject(project)"
                            :key="task.id"
                            type="button"
                            class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2"
                            :class="currentTaskId === task.id ? 'bg-black/5 dark:bg-white/5' : ''"
                            @click="chooseTask(task)">
                            <span class="w-1.5 h-1.5 rounded-full bg-text-tertiary shrink-0"></span>
                            <span class="truncate">{{ task.name }}</span>
                        </button>
                    </div>
                </div>

                <div
                    v-if="visibleProjects.length === 0"
                    class="px-4 py-10 text-center text-sm text-text-tertiary">
                    No matching projects or tasks
                </div>
            </div>
        </div>
    </div>
</template>
