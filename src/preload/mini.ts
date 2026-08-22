import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
        contextBridge.exposeInMainWorld('electronAPI', {
            startTimer: (startBlank: boolean = false) =>
                ipcRenderer.send('startTimer', startBlank),
            stopTimer: () => ipcRenderer.send('stopTimer'),
            startBreak: () => ipcRenderer.send('startBreak'),
            resumeAfterBreak: () => ipcRenderer.send('resumeAfterBreak'),
            showMainWindow: () => ipcRenderer.send('showMainWindow'),
            getSettings: () => ipcRenderer.invoke('getSettings'),
            openProjectTaskPicker: (data: unknown) =>
                ipcRenderer.send('openProjectTaskPicker', data),
            onProjectTaskPickerSelection: (callback: (selection: unknown) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, selection: unknown) =>
                    callback(selection)
                ipcRenderer.on('projectTaskPickerSelection', listener)
                return () => ipcRenderer.removeListener('projectTaskPickerSelection', listener)
            },
            onProjectTaskPickerData: (callback: (data: unknown) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
                ipcRenderer.on('projectTaskPickerData', listener)
                return () => ipcRenderer.removeListener('projectTaskPickerData', listener)
            },
            selectProjectTask: (selection: unknown) =>
                ipcRenderer.send('projectTaskPickerSelect', selection),
            closeProjectTaskPicker: () => ipcRenderer.send('closeProjectTaskPicker'),
            openDescriptionSuggestions: (data: unknown) =>
                ipcRenderer.send('openDescriptionSuggestions', data),
            updateDescriptionSuggestions: (data: unknown) =>
                ipcRenderer.send('updateDescriptionSuggestions', data),
            onDescriptionSuggestionSelection: (callback: (suggestion: unknown) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, suggestion: unknown) =>
                    callback(suggestion)
                ipcRenderer.on('descriptionSuggestionSelection', listener)
                return () =>
                    ipcRenderer.removeListener('descriptionSuggestionSelection', listener)
            },
            onDescriptionSuggestionsData: (callback: (data: unknown) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
                ipcRenderer.on('descriptionSuggestionsData', listener)
                return () => ipcRenderer.removeListener('descriptionSuggestionsData', listener)
            },
            selectDescriptionSuggestion: (suggestion: unknown) =>
                ipcRenderer.send('descriptionSuggestionSelect', suggestion),
            closeDescriptionSuggestions: () => ipcRenderer.send('closeDescriptionSuggestions'),
        })
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}
