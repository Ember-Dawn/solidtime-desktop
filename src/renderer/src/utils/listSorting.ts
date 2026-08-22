import { useStorage } from '@vueuse/core'

export type ListSortOrder = 'asc' | 'desc'

export const projectSortOrder = useStorage<ListSortOrder>('solidtime/project-sort-order', 'asc')
export const taskSortOrder = useStorage<ListSortOrder>('solidtime/task-sort-order', 'asc')

const mixedLanguageCollator = new Intl.Collator(['zh-CN', 'en-US'], {
    usage: 'sort',
    numeric: true,
    sensitivity: 'base',
})

export function sortNamedItems<T extends { name?: string | null }>(
    items: readonly T[] | undefined,
    order: ListSortOrder
): T[] | undefined {
    if (!items) {
        return undefined
    }

    const direction = order === 'asc' ? 1 : -1
    return [...items].sort(
        (left, right) =>
            direction * mixedLanguageCollator.compare(left.name ?? '', right.name ?? '')
    )
}
