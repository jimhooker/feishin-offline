import { ipcRenderer, IpcRendererEvent } from 'electron';

import {
    OfflineDownloadRequest,
    OfflineProgress,
    OfflineSettings,
    OfflineSongRecord,
    OfflineStats,
} from '/@/shared/types/offline-types';

const enqueue = (requests: OfflineDownloadRequest[]): Promise<void> =>
    ipcRenderer.invoke('offline-enqueue', requests);

const cancel = (keys: string[]): Promise<void> => ipcRenderer.invoke('offline-cancel', keys);

const remove = (keys: string[]): Promise<string[]> => ipcRenderer.invoke('offline-remove', keys);

const getManifest = (): Promise<OfflineSongRecord[]> => ipcRenderer.invoke('offline-get-manifest');

const getStats = (): Promise<OfflineStats> => ipcRenderer.invoke('offline-get-stats');

const getSettings = (): Promise<OfflineSettings> => ipcRenderer.invoke('offline-get-settings');

const chooseDownloadPath = (): Promise<null | string> =>
    ipcRenderer.invoke('offline-choose-download-path');

const openDownloadFolder = (): Promise<void> => ipcRenderer.invoke('offline-open-download-folder');

const onProgress = (callback: (progress: OfflineProgress) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, progress: OfflineProgress) => callback(progress);
    ipcRenderer.on('offline-progress', handler);
    return () => {
        ipcRenderer.removeListener('offline-progress', handler);
    };
};

export const offline = {
    cancel,
    chooseDownloadPath,
    enqueue,
    getManifest,
    getSettings,
    getStats,
    onProgress,
    openDownloadFolder,
    remove,
};

export type Offline = typeof offline;
