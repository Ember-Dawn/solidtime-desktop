import { useStorage } from '@vueuse/core'

const STOPPING_TIME_ENTRY_ID_KEY = 'stoppingTimeEntryId'
const STOPPING_TIME_ENTRY_STARTED_AT_KEY = 'stoppingTimeEntryStartedAt'
const STOPPING_TIME_ENTRY_GUARD_MAX_AGE_MS = 60_000

export function useStoppingTimeEntryGuard() {
    const storage = typeof window !== 'undefined' ? localStorage : undefined
    const stoppingTimeEntryId = useStorage<string>(STOPPING_TIME_ENTRY_ID_KEY, '', storage)
    const stoppingTimeEntryStartedAt = useStorage<number>(
        STOPPING_TIME_ENTRY_STARTED_AT_KEY,
        0,
        storage
    )

    function markStoppingTimeEntry(id: string) {
        if (!id) return
        stoppingTimeEntryStartedAt.value = Date.now()
        stoppingTimeEntryId.value = id
    }

    function clearStoppingTimeEntry(id?: string) {
        if (id && stoppingTimeEntryId.value !== id) return
        stoppingTimeEntryId.value = ''
        stoppingTimeEntryStartedAt.value = 0
    }

    function isStoppingTimeEntry(id: string) {
        if (!id || stoppingTimeEntryId.value !== id) return false

        const age = Date.now() - stoppingTimeEntryStartedAt.value
        if (stoppingTimeEntryStartedAt.value <= 0 || age > STOPPING_TIME_ENTRY_GUARD_MAX_AGE_MS) {
            clearStoppingTimeEntry(id)
            return false
        }

        return true
    }

    return {
        stoppingTimeEntryId,
        markStoppingTimeEntry,
        clearStoppingTimeEntry,
        isStoppingTimeEntry,
    }
}
