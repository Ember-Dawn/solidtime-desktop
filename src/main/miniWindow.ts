import { join } from 'path'
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, ipcMain, screen } from 'electron'
import { isE2ETesting } from './env'

const MINI_WINDOW_WIDTH = 420
const MINI_WINDOW_HEIGHT = 36
const DISPLAY_METRICS_SETTLE_DELAY_MS = 180

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
        scheduleDisplayMetricsApply()
    })

    const handleDisplayMetricsChanged = () => {
        scheduleDisplayMetricsApply()
    }
    screen.on('display-metrics-changed', handleDisplayMetricsChanged)
    miniWindow.on('closed', () => {
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
        miniWindow.hide()
    })
    let forcequit = false
    miniWindow.on('close', (event) => {
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
