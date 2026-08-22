import { join } from 'path'
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, ipcMain, screen } from 'electron'
import { isE2ETesting } from './env'

const MINI_WINDOW_WIDTH = 420
const MINI_WINDOW_HEIGHT = 36

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

    function applyDisplayMetrics(force = false) {
        if (miniWindow.isDestroyed()) return

        const bounds = miniWindow.getBounds()
        const display = screen.getDisplayMatching(bounds)
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

    miniWindow.on('ready-to-show', () => {
        miniWindow.setAlwaysOnTop(true, 'floating')
        applyDisplayMetrics(true)
    })

    miniWindow.on('move', () => {
        applyDisplayMetrics()
    })

    const handleDisplayMetricsChanged = () => {
        applyDisplayMetrics(true)
    }
    screen.on('display-metrics-changed', handleDisplayMetricsChanged)
    miniWindow.on('closed', () => {
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
