export interface AppSettings {
    widgetActivated: boolean
    trayTimerActivated: boolean
    idleDetectionEnabled: boolean
    idleThresholdMinutes: number
    activityTrackingEnabled: boolean
    errorReportingEnabled: boolean
}

export interface WindowActivityStats {
    appName: string
    url: string | null
    windowTitle: string | null
    count: number
}

export interface XWinExtensionStatus {
    applicable: boolean
    currentDesktop: string
    sessionType: string
    installed: boolean
    enabled: boolean
    ready: boolean
    error?: string
}

export interface XWinExtensionActionResult {
    success: boolean
    status: XWinExtensionStatus
    error?: string
}

export interface ProjectTaskPickerProject {
    id: string
    name: string
    color: string | null
}

export interface ProjectTaskPickerTask {
    id: string
    name: string
    project_id: string
}

export interface ProjectTaskPickerData {
    projects: ProjectTaskPickerProject[]
    tasks: ProjectTaskPickerTask[]
    currentProjectId: string | null
    currentTaskId: string | null
}

export interface ProjectTaskPickerSelection {
    projectId: string | null
    taskId: string | null
}

export interface DescriptionSuggestion {
    description: string | null
    projectId: string | null
    taskId: string | null
    projectName: string | null
    projectColor: string | null
    taskName: string | null
}

export interface DescriptionSuggestionsData {
    suggestions: DescriptionSuggestion[]
    activeIndex: number
}

export interface IElectronAPI {
    loadPreferences: () => Promise<void>
    showMainWindow: () => void
    hideMainWindow: () => void
    showMiniWindow: () => void
    hideMiniWindow: () => void
    onUpdateAvailable: (callback: () => void) => void
    onUpdateDownloaded: (callback: () => void) => void
    onUpdateNotAvailable: (callback: () => void) => void
    installUpdate: () => void
    startTimer: (startBlank?: boolean) => void
    stopTimer: () => void
    startBreak: () => void
    resumeAfterBreak: () => void
    onOpenDeeplink: (callback: (url: string) => Promise<void>) => void
    onAutoUpdaterError: (callback: (error: string | undefined) => Promise<void>) => void
    onStartTimer: (callback: (startBlank?: boolean) => void) => void
    onStopTimer: (callback: () => void) => void
    onStartBreak: (callback: () => void) => void
    onResumeAfterBreak: (callback: () => void) => void
    updateTrayState: (timeEntry: string, showTimer: boolean) => void
    updateAutoUpdater: () => void
    updateIdleThreshold: (thresholdMinutes: number) => void
    updateIdleDetectionEnabled: (enabled: boolean) => void
    updateActivityTrackingEnabled: (enabled: boolean) => void
    timerStateChanged: (running: boolean) => void
    onIdleDialogResponse: (
        callback: (data: { choice: number; idleStartTime: string; idleEndTime: string }) => void
    ) => () => void // Returns cleanup function to remove listener
    getActivityTrackingSupport: () => Promise<{ supported: boolean; reason?: string }>
    getSettings: () => Promise<{ success: boolean; data?: AppSettings; error?: string }>
    updateSettings: (
        settings: Partial<AppSettings>
    ) => Promise<{ success: boolean; data?: AppSettings; error?: string }>
    getWindowActivityStats: (startDate: string, endDate: string) => Promise<WindowActivityStats[]>
    getAppIcon: (appName: string) => Promise<string | null>
    getIcons: (names: string[]) => Promise<Record<string, string | null>>
    clearIconCache: () => Promise<{ success: boolean }>
    checkScreenRecordingPermission: () => Promise<boolean>
    requestScreenRecordingPermission: () => Promise<boolean>
    deleteAllWindowActivities: () => Promise<{ success: boolean; error?: string }>
    deleteAllActivityPeriods: () => Promise<{ success: boolean; error?: string }>
    deleteWindowActivitiesInRange: (
        startDate: string,
        endDate: string
    ) => Promise<{ success: boolean; error?: string }>
    deleteActivityPeriodsInRange: (
        startDate: string,
        endDate: string
    ) => Promise<{ success: boolean; error?: string }>
    setTitleBarOverlay: (theme: 'dark' | 'light') => void
    getAppVersion: () => Promise<string>
    getXWinExtensionStatus: () => Promise<XWinExtensionStatus>
    installXWinExtension: () => Promise<XWinExtensionActionResult>
    enableXWinExtension: () => Promise<XWinExtensionActionResult>
    openProjectTaskPicker: (data: ProjectTaskPickerData) => void
    onProjectTaskPickerSelection: (
        callback: (selection: ProjectTaskPickerSelection) => void
    ) => () => void
    onProjectTaskPickerData: (callback: (data: ProjectTaskPickerData) => void) => () => void
    selectProjectTask: (selection: ProjectTaskPickerSelection) => void
    closeProjectTaskPicker: () => void
    openDescriptionSuggestions: (data: DescriptionSuggestionsData) => void
    updateDescriptionSuggestions: (data: DescriptionSuggestionsData) => void
    onDescriptionSuggestionSelection: (
        callback: (suggestion: DescriptionSuggestion) => void
    ) => () => void
    onDescriptionSuggestionsData: (
        callback: (data: DescriptionSuggestionsData) => void
    ) => () => void
    selectDescriptionSuggestion: (suggestion: DescriptionSuggestion) => void
    closeDescriptionSuggestions: () => void
    miniDiagnosticLog: (message: string, data?: unknown) => void
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
