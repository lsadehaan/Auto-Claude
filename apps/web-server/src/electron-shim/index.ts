/**
 * Electron Shim Index
 *
 * Re-exports all shims for convenient importing.
 * These shims allow Electron IPC handler code to work in the web server context.
 */

export { projectStore, type Project } from './project-store.js';
export { app, shell, ipcMain } from './electron.js';
export type { BrowserWindow, IpcMainInvokeEvent, IpcMainEvent } from './electron.js';
