import { join } from 'path'
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, ipcMain, screen } from 'electron'
import { isE2ETesting } from './env'

const MINI_WINDOW_WIDTH = 420
const MINI_WINDOW_HEIGHT = 52
const DISPLAY_METRICS_SETTLE_DELAY_MS = 180
const PROJECT_TASK_PICKER_HEIGHT = 520
const PROJECT_TASK_PICKER_GAP = 8
const DESCRIPTION_HISTORY_ITEM_HEIGHT = 48
const DESCRIPTION_HISTORY_VERTICAL_PADDING = 12
const DESCRIPTION_HISTORY_MAX_HEIGHT = 348
const DESCRIPTION_HISTORY_GAP = 6

interface ProjectTaskPickerProject {
    id: string
    name: string
    color: string | null
}

interface ProjectTaskPickerTask {
    id: string
    name: string
    project_id: string
}

interface ProjectTaskPickerData {
    projects: ProjectTaskPickerProject[]
    tasks: ProjectTaskPickerTask[]
    currentProjectId: string | null
    currentTaskId: string | null
}

interface ProjectTaskPickerSelection {
    projectId: string | null
    taskId: string | null
}

type DescriptionHistoryPlacement = 'above' | 'below'

let projectTaskPickerWindow: BrowserWindow | null = null
let miniDescriptionHistoryHeight = 0
let miniDescriptionHistorySuggestionCount = 0
let miniDescriptionHistoryPlacement: DescriptionHistoryPlacement = 'below'

function closeProjectTaskPicker() {
    if (projectTaskPickerWindow && !projectTaskPickerWindow.isDestroyed()) {
        projectTaskPickerWindow.close()
    }
    projectTaskPickerWindow = null
}

function applyMiniWindowShape(miniWindow: BrowserWindow) {
    if (process.platform !== 'win32' || miniWindow.isDestroyed()) return

    const bounds = miniWindow.getBounds()
    miniWindow.setShape([{ x: 0, y: 0, width: MINI_WINDOW_WIDTH, height: bounds.height }])
}

function getMiniWidgetBaseBounds(miniWindow: BrowserWindow) {
    const bounds = miniWindow.getBounds()
    const y =
        miniDescriptionHistoryHeight > 0 && miniDescriptionHistoryPlacement === 'above'
            ? bounds.y + bounds.height - MINI_WINDOW_HEIGHT
            : bounds.y

    return {
        x: bounds.x,
        y,
        width: MINI_WINDOW_WIDTH,
        height: MINI_WINDOW_HEIGHT,
    }
}

function resizeMiniWindowForDescriptionHistory(miniWindow: BrowserWindow, suggestionCount: number) {
    if (miniWindow.isDestroyed()) return

    const baseBounds = getMiniWidgetBaseBounds(miniWindow)
    miniDescriptionHistorySuggestionCount = Math.max(0, Math.min(12, Math.floor(suggestionCount)))

    if (miniDescriptionHistorySuggestionCount === 0) {
        miniDescriptionHistoryHeight = 0
        miniDescriptionHistoryPlacement = 'below'
        miniWindow.setBounds(baseBounds, false)
        applyMiniWindowShape(miniWindow)
        miniWindow.webContents.send('miniDescriptionHistoryPlacement', 'below')
        return
    }

    const display = screen.getDisplayMatching(baseBounds)
    const workArea = display.workArea
    const desiredHistoryHeight = Math.min(
        DESCRIPTION_HISTORY_MAX_HEIGHT,
        DESCRIPTION_HISTORY_VERTICAL_PADDING +
            miniDescriptionHistorySuggestionCount * DESCRIPTION_HISTORY_ITEM_HEIGHT
    )
    const belowSpace = Math.max(
        0,
        workArea.y +
            workArea.height -
            (baseBounds.y + MINI_WINDOW_HEIGHT + DESCRIPTION_HISTORY_GAP)
    )
    const aboveSpace = Math.max(0, baseBounds.y - workArea.y - DESCRIPTION_HISTORY_GAP)

    miniDescriptionHistoryPlacement =
        belowSpace >= desiredHistoryHeight || belowSpace >= aboveSpace ? 'below' : 'above'
    const availableHistoryHeight =
        miniDescriptionHistoryPlacement === 'below' ? belowSpace : aboveSpace
    miniDescriptionHistoryHeight = Math.min(desiredHistoryHeight, availableHistoryHeight)

    if (miniDescriptionHistoryHeight <= 0) {
        miniDescriptionHistorySuggestionCount = 0
        miniDescriptionHistoryPlacement = 'below'
        miniWindow.setBounds(baseBounds, false)
        applyMiniWindowShape(miniWindow)
        miniWindow.webContents.send('miniDescriptionHistoryPlacement', 'below')
        return
    }

    const totalHeight =
        MINI_WINDOW_HEIGHT + DESCRIPTION_HISTORY_GAP + miniDescriptionHistoryHeight
    const y =
        miniDescriptionHistoryPlacement === 'above'
            ? baseBounds.y - DESCRIPTION_HISTORY_GAP - miniDescriptionHistoryHeight
            : baseBounds.y

    miniWindow.setBounds(
        {
            x: baseBounds.x,
            y,
            width: MINI_WINDOW_WIDTH,
            height: totalHeight,
        },
        false
    )
    applyMiniWindowShape(miniWindow)
    miniWindow.webContents.send(
        'miniDescriptionHistoryPlacement',
        miniDescriptionHistoryPlacement
    )
}

function getProjectTaskPickerBounds(miniWindow: BrowserWindow) {
    const miniBounds = getMiniWidgetBaseBounds(miniWindow)
    const display = screen.getDisplayMatching(miniBounds)
    const workArea = display.workArea
    const width = Math.min(miniBounds.width, workArea.width)
    const height = Math.min(PROJECT_TASK_PICKER_HEIGHT, Math.max(260, workArea.height - 24))

    let x = miniBounds.x
    if (x + width > workArea.x + workArea.width) {
        x = workArea.x + workArea.width - width
    }
    x = Math.max(workArea.x, x)

    const belowY = miniBounds.y + miniBounds.height + PROJECT_TASK_PICKER_GAP
    const aboveY = miniBounds.y - height - PROJECT_TASK_PICKER_GAP
    const fitsBelow = belowY + height <= workArea.y + workArea.height
    const y = fitsBelow ? belowY : Math.max(workArea.y, aboveY)

    return { x, y, width, height }
}

function showPopupWithCurrentDisplayBounds(
    popupWindow: BrowserWindow,
    getBounds: () => Electron.Rectangle,
    show: () => void
) {
    if (popupWindow.isDestroyed()) return

    popupWindow.setBounds(getBounds(), false)
    show()

    if (process.platform === 'win32') {
        // A newly shown frameless child window can keep the primary display's
        // scale context after the widget moved to a monitor with a different DPI.
        // Re-apply the widget-relative DIP bounds once the window is visible so
        // Windows/Electron recalculates its native pixel size on the target display.
        setImmediate(() => {
            if (!popupWindow.isDestroyed()) {
                popupWindow.setBounds(getBounds(), false)
            }
        })
    }
}

function openProjectTaskPicker(miniWindow: BrowserWindow, data: ProjectTaskPickerData) {
    resizeMiniWindowForDescriptionHistory(miniWindow, 0)
    closeProjectTaskPicker()

    const pickerWindow = new BrowserWindow({
        ...getProjectTaskPickerBounds(miniWindow),
        show: false,
        frame: false,
        resizable: false,
        transparent: true,
        hasShadow: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        parent: miniWindow,
        webPreferences: {
            preload: join(__dirname, '../preload/mini.mjs'),
            sandbox: false,
        },
    })

    projectTaskPickerWindow = pickerWindow
    pickerWindow.setAutoHideMenuBar(true)

    pickerWindow.once('blur', () => {
        closeProjectTaskPicker()
    })
    pickerWindow.once('closed', () => {
        if (projectTaskPickerWindow === pickerWindow) {
            projectTaskPickerWindow = null
        }
    })

    pickerWindow.webContents.once('did-finish-load', () => {
        if (pickerWindow.isDestroyed()) return
        pickerWindow.webContents.send('projectTaskPickerData', data)
        showPopupWithCurrentDisplayBounds(
            pickerWindow,
            () => getProjectTaskPickerBounds(miniWindow),
            () => {
                pickerWindow.show()
                pickerWindow.focus()
            }
        )
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
        void pickerWindow.loadURL(
            `${process.env['ELECTRON_RENDERER_URL']}/index-project-task-picker.html`
        )
    } else {
        void pickerWindow.loadFile(join(__dirname, '../renderer/index-project-task-picker.html'))
    }
}

export function initializeMiniWindow(icon: string) {
    const miniWindow = new BrowserWindow({
        width: MINI_WINDOW_WIDTH,
        height: MINI_WINDOW_HEIGHT,
        show: false,
        autoHideMenuBar: true,
        frame: false,
        resizable: false,
        transparent: true,
        hasShadow: false,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/mini.mjs'),
            sandbox: false,
        },
    })
    miniWindow.setAutoHideMenuBar(true)

    let currentDisplayId: number | undefined
    let currentScaleFactor: number | undefined
    let displayMetricsSettleTimer: ReturnType<typeof setTimeout> | null = null

    function getCurrentDisplayMetrics() {
        const bounds = miniWindow.getBounds()
        const display = screen.getDisplayMatching(bounds)
        return { bounds, display }
    }

    function applyDisplayMetrics(force = false) {
        if (miniWindow.isDestroyed()) return

        const { bounds, display } = getCurrentDisplayMetrics()
        const displayChanged =
            display.id !== currentDisplayId || display.scaleFactor !== currentScaleFactor

        if (!force && !displayChanged) return

        currentDisplayId = display.id
        currentScaleFactor = display.scaleFactor

        // BrowserWindow bounds are expressed in DIP. Re-applying them after a
        // per-monitor DPI transition makes Electron recalculate the native
        // pixel bounds for the new display instead of keeping stale metrics.
        if (miniDescriptionHistorySuggestionCount > 0) {
            resizeMiniWindowForDescriptionHistory(
                miniWindow,
                miniDescriptionHistorySuggestionCount
            )
        } else {
            miniWindow.setBounds(
                {
                    x: bounds.x,
                    y: bounds.y,
                    width: MINI_WINDOW_WIDTH,
                    height: MINI_WINDOW_HEIGHT,
                },
                false
            )
            applyMiniWindowShape(miniWindow)
        }
    }

    function scheduleDisplayMetricsApply() {
        if (miniWindow.isDestroyed()) return

        const { display } = getCurrentDisplayMetrics()
        const displayChanged =
            display.id !== currentDisplayId || display.scaleFactor !== currentScaleFactor

        if (!displayChanged) {
            if (displayMetricsSettleTimer) {
                clearTimeout(displayMetricsSettleTimer)
                displayMetricsSettleTimer = null
            }
            return
        }

        if (displayMetricsSettleTimer) {
            clearTimeout(displayMetricsSettleTimer)
        }

        // Do not resize/reposition a frameless window while Windows is actively
        // dragging it across monitors. Changing bounds during the native drag
        // recalculates the mouse grab offset and makes the cursor appear to jump.
        // Wait until move events have settled, then apply the mixed-DPI fix.
        displayMetricsSettleTimer = setTimeout(() => {
            displayMetricsSettleTimer = null
            applyDisplayMetrics()
        }, DISPLAY_METRICS_SETTLE_DELAY_MS)
    }

    miniWindow.on('ready-to-show', () => {
        miniWindow.setAlwaysOnTop(true, 'floating')
        applyDisplayMetrics(true)
    })

    miniWindow.on('move', () => {
        closeProjectTaskPicker()
        scheduleDisplayMetricsApply()
    })

    const handleDisplayMetricsChanged = () => {
        closeProjectTaskPicker()
        scheduleDisplayMetricsApply()
    }
    screen.on('display-metrics-changed', handleDisplayMetricsChanged)
    miniWindow.on('closed', () => {
        closeProjectTaskPicker()
        if (displayMetricsSettleTimer) {
            clearTimeout(displayMetricsSettleTimer)
            displayMetricsSettleTimer = null
        }
        screen.removeListener('display-metrics-changed', handleDisplayMetricsChanged)
    })

    return miniWindow
}

export function registerMiniWindowListeners(miniWindow: BrowserWindow) {
    ipcMain.on('showMiniWindow', () => {
        if (!isE2ETesting()) {
            miniWindow.show()
            miniWindow.focus()
        }
    })
    ipcMain.on('hideMiniWindow', () => {
        closeProjectTaskPicker()
        resizeMiniWindowForDescriptionHistory(miniWindow, 0)
        miniWindow.hide()
    })
    ipcMain.on('openProjectTaskPicker', (event, data: ProjectTaskPickerData) => {
        if (event.sender !== miniWindow.webContents || isE2ETesting()) return
        openProjectTaskPicker(miniWindow, data)
    })
    ipcMain.on('projectTaskPickerSelect', (event, selection: ProjectTaskPickerSelection) => {
        if (!projectTaskPickerWindow || event.sender !== projectTaskPickerWindow.webContents) return
        miniWindow.webContents.send('projectTaskPickerSelection', selection)
        closeProjectTaskPicker()
    })
    ipcMain.on('closeProjectTaskPicker', (event) => {
        if (!projectTaskPickerWindow || event.sender !== projectTaskPickerWindow.webContents) return
        closeProjectTaskPicker()
    })
    ipcMain.on('setMiniDescriptionHistory', (event, suggestionCount: number) => {
        if (event.sender !== miniWindow.webContents || isE2ETesting()) return
        resizeMiniWindowForDescriptionHistory(
            miniWindow,
            Number.isFinite(suggestionCount) ? suggestionCount : 0
        )
    })

    let forcequit = false
    miniWindow.on('close', (event) => {
        closeProjectTaskPicker()
        if (process.platform === 'darwin') {
            if (forcequit === false) {
                event.preventDefault()
                miniWindow.hide()
            }
        } else {
            app.quit()
        }
    })
    app.on('before-quit', () => {
        forcequit = true
    })
    nativeAutoUpdater.on('before-quit-for-update', () => {
        forcequit = true
    })
}
