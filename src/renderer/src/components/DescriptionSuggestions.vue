<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/16/solid'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useTheme } from '../utils/theme'

interface DescriptionSuggestion {
    description: string | null
    projectId: string | null
    taskId: string | null
    projectName: string | null
    projectColor: string | null
    taskName: string | null
}

interface DescriptionSuggestionsData {
    suggestions: DescriptionSuggestion[]
    activeIndex: number
}

const suggestions = ref<DescriptionSuggestion[]>([])
const activeIndex = ref(-1)
let removeDataListener: (() => void) | null = null
let selectionSent = false

onMounted(() => {
    useTheme()
    removeDataListener = window.electronAPI.onDescriptionSuggestionsData(
        (data: DescriptionSuggestionsData) => {
            suggestions.value = data.suggestions
            activeIndex.value = data.activeIndex
            selectionSent = false
        }
    )
})

function chooseSuggestion(suggestion: DescriptionSuggestion) {
    if (selectionSent) return
    selectionSent = true
    window.electronAPI.selectDescriptionSuggestion(suggestion)
}

onBeforeUnmount(() => {
    removeDataListener?.()
})
</script>

<template>
    <div
        class="h-screen w-screen overflow-hidden border border-border-primary bg-background shadow-xl text-text-primary">
        <div class="h-full overflow-y-auto p-1.5">
                <button
                    v-for="(suggestion, index) in suggestions"
                    :key="`${suggestion.description ?? ''}:${suggestion.projectId ?? ''}:${suggestion.taskId ?? ''}`"
                    type="button"
                    class="w-full min-w-0 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    :class="index === activeIndex ? 'bg-black/[0.07] dark:bg-white/[0.07]' : ''"
                    @mousedown.left.prevent="chooseSuggestion(suggestion)"
                    @click.prevent="chooseSuggestion(suggestion)">
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
    </div>
</template>
