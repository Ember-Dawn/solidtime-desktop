import { join } from 'path'
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, ipcMain, screen } from 'electron'
import { isE2ETesting } from './env'

const MINI_WINDOW_WIDTH = 420
const MINI_WINDOW_HEIGHT = 52
const DISPLAY_METRICS_SETTLE_DELAY_MS = 180
const PROJECT_TASK_PICKER_WIDTH = 420
const PROJECT_TASK_PICKER_HEIGHT = 520
const PROJECT_TASK_PICKER_GAP = 8

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

let projectTaskPickerWindow: BrowserWindow | null = null

function closeProjectTaskPicker() {
    if (projectTaskPickerWindow && !projectTaskPickerWindow.isDestroyed()) {
        projectTaskPickerWindow.close()
    }
    projectTaskPickerWindow = null
}

function getProjectTaskPickerBounds(miniWindow: BrowserWindow) {
    const miniBounds = miniWindow.getBounds()
    const display = screen.getDisplayMatching(miniBounds)
    const workArea = display.workArea
    const height = Math.min(PROJECT_TASK_PICKER_HEIGHT, Math.max(260, workArea.height - 24))

    let x = miniBounds.x
    if (x + PROJECT_TASK_PICKER_WIDTH > workArea.x + workArea.width) {
        x = workArea.x + workArea.width - PROJECT_TASK_PICKER_WIDTH
    }
    x = Math.max(workArea.x, x)

    const belowY = miniBounds.y + miniBounds.height + PROJECT_TASK_PICKER_GAP
    const aboveY = miniBounds.y - height - PROJECT_TASK_PICKER_GAP
    const fitsBelow = belowY + height <= workArea.y + workArea.height
    const y = fitsBelow ? belowY : Math.max(workArea.y, aboveY)

    return { x, y, width: PROJECT_TASK_PICKER_WIDTH, height }
}

function openProjectTaskPicker(miniWindow: BrowserWindow, data: ProjectTaskPickerData) {
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
        pickerWindow.show()
        pickerWindow.focus()
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
        miniWindow.setBounds(
            {
                x: bounds.x,
                y: bounds.y,
                width: MINI_WINDOW_WIDTH,
                height: MINI_WINDOW_HEIGHT,
            },
            false
        )

        // Windows shaped frameless windows can keep the shape created for the
        // previous monitor. Re-apply it whenever the monitor/DPI changes so the
        // renderer is not clipped after moving between mixed-DPI displays.
        if (process.platform === 'win32') {
            miniWindow.setShape([
                { x: 0, y: 0, width: MINI_WINDOW_WIDTH, height: MINI_WINDOW_HEIGHT },
            ])
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
