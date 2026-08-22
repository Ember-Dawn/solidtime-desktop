<script setup lang="ts">
import { ClockIcon } from '@heroicons/vue/16/solid'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useTheme } from '../utils/theme'

interface DescriptionSuggestionsData {
    suggestions: string[]
    activeIndex: number
}

const suggestions = ref<string[]>([])
const activeIndex = ref(-1)
let removeDataListener: (() => void) | null = null

onMounted(() => {
    useTheme()
    removeDataListener = window.electronAPI.onDescriptionSuggestionsData(
        (data: DescriptionSuggestionsData) => {
            suggestions.value = data.suggestions
            activeIndex.value = data.activeIndex
        }
    )
})

function chooseSuggestion(description: string) {
    window.electronAPI.selectDescriptionSuggestion(description)
}

onBeforeUnmount(() => {
    removeDataListener?.()
})
</script>

<template>
    <div class="h-screen w-screen p-1.5 bg-transparent">
        <div
            class="h-full overflow-hidden rounded-xl border border-border-primary bg-background shadow-xl flex flex-col text-text-primary">
            <div class="px-3 py-2 border-b border-border-primary text-xs text-text-tertiary shrink-0">
                Recent descriptions
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto p-1.5">
                <button
                    v-for="(suggestion, index) in suggestions"
                    :key="suggestion"
                    type="button"
                    class="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    :class="index === activeIndex ? 'bg-black/[0.07] dark:bg-white/[0.07]' : ''"
                    @mousedown.prevent
                    @click="chooseSuggestion(suggestion)">
                    <ClockIcon class="w-4 h-4 shrink-0 text-text-tertiary" />
                    <span class="truncate">{{ suggestion }}</span>
                </button>
            </div>
        </div>
    </div>
</template>
