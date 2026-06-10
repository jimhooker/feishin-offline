import axios from 'axios';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';

import {
    OFFLINE_PROTOCOL_HOST,
    OfflineDownloadRequest,
    OfflineProgress,
    OfflineSettings,
    OfflineSongRecord,
    OfflineStats,
} from '/@/shared/types/offline-types';

const isDevelopment = process.env.NODE_ENV === 'development';
const baseDataPath = isDevelopment
    ? path.normalize(`${app.getPath('userData')}-dev`)
    : path.normalize(app.getPath('userData'));

const DEFAULT_DOWNLOAD_PATH = path.join(baseDataPath, 'offline');
const MAX_CONCURRENT = 3;
const PROGRESS_THROTTLE_MS = 250;

interface OfflineStoreSchema {
    downloadPath: string;
    songs: Record<string, OfflineSongRecord>;
}

const store = new Store<OfflineStoreSchema>({
    cwd: baseDataPath,
    defaults: {
        downloadPath: DEFAULT_DOWNLOAD_PATH,
        songs: {},
    },
    name: 'offline',
});

const getRecords = (): Record<string, OfflineSongRecord> => store.get('songs', {});
const getRecord = (key: string): OfflineSongRecord | undefined => getRecords()[key];
const setRecord = (record: OfflineSongRecord): void => {
    const songs = getRecords();
    songs[record.key] = record;
    store.set('songs', songs);
};
const deleteRecord = (key: string): void => {
    const songs = getRecords();
    delete songs[key];
    store.set('songs', songs);
};
const getDownloadPath = (): string => store.get('downloadPath', DEFAULT_DOWNLOAD_PATH);

// ---------------------------------------------------------------------------
// MIME / extension helpers
// ---------------------------------------------------------------------------

const EXT_TO_MIME: Record<string, string> = {
    aac: 'audio/aac',
    aif: 'audio/aiff',
    aiff: 'audio/aiff',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    wma: 'audio/x-ms-wma',
    wv: 'audio/x-wavpack',
};

const MIME_TO_EXT: Record<string, string> = {
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/wav': 'wav',
    'audio/x-flac': 'flac',
    'audio/x-wav': 'wav',
};

const extToMime = (ext: string): string =>
    EXT_TO_MIME[ext.toLowerCase()] || 'application/octet-stream';

const resolveExtension = (container: null | string, mimeType: string): string => {
    if (container) {
        const cleaned = container.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleaned && cleaned.length <= 5) {
            return cleaned;
        }
    }

    const mime = mimeType.toLowerCase();
    if (MIME_TO_EXT[mime]) {
        return MIME_TO_EXT[mime];
    }

    return 'audio';
};

const sanitizeId = (id: string): string => id.replace(/[^A-Za-z0-9._-]/g, '_');

// ---------------------------------------------------------------------------
// Renderer notifications
// ---------------------------------------------------------------------------

const emitProgress = (progress: OfflineProgress): void => {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
            window.webContents.send('offline-progress', progress);
        }
    }
};

// ---------------------------------------------------------------------------
// Download queue
// ---------------------------------------------------------------------------

const queue: OfflineDownloadRequest[] = [];
const activeControllers = new Map<string, AbortController>();
let activeCount = 0;

const moveFile = async (from: string, to: string): Promise<void> => {
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
        await fs.rename(from, to);
    } catch (error: any) {
        // Cross-device move (e.g. moving to another disk) — fall back to copy.
        if (error?.code === 'EXDEV') {
            await fs.copyFile(from, to);
            await fs.unlink(from);
        } else {
            throw error;
        }
    }
};

const safeUnlink = async (filePath: string): Promise<void> => {
    try {
        await fs.unlink(filePath);
    } catch {
        // Ignore — file may not exist.
    }
};

const downloadOne = async (request: OfflineDownloadRequest): Promise<void> => {
    const { container, key, serverId, song, songId, url } = request;
    const controller = new AbortController();
    activeControllers.set(key, controller);

    const root = getDownloadPath();
    let received = 0;
    let total = 0;
    let lastEmit = 0;
    let partPath: null | string = null;

    try {
        await fs.mkdir(path.join(root, serverId), { recursive: true });

        const response = await axios.get<Readable>(url, {
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            responseType: 'stream',
            signal: controller.signal,
            timeout: 0,
        });

        const mimeType = String(response.headers['content-type'] || '')
            .split(';')[0]
            .trim();
        total = parseInt(String(response.headers['content-length'] || '0'), 10) || 0;

        const ext = resolveExtension(container, mimeType);
        const fileName = `${sanitizeId(songId)}.${ext}`;
        const relativePath = path.join(serverId, fileName);
        const finalPath = path.join(root, relativePath);
        partPath = `${finalPath}.part`;

        emitProgress({
            key,
            receivedBytes: 0,
            serverId,
            songId,
            status: 'downloading',
            totalBytes: total,
        });

        await new Promise<void>((resolve, reject) => {
            const writeStream = createWriteStream(partPath as string);
            const stream = response.data;

            stream.on('data', (chunk: Buffer) => {
                received += chunk.length;
                const now = Date.now();
                if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
                    lastEmit = now;
                    emitProgress({
                        key,
                        receivedBytes: received,
                        serverId,
                        songId,
                        status: 'downloading',
                        totalBytes: total,
                    });
                }
            });
            stream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', () => resolve());
            stream.pipe(writeStream);
        });

        await fs.rename(partPath, finalPath);
        const stat = await fs.stat(finalPath);

        const record: OfflineSongRecord = {
            absolutePath: finalPath,
            addedAt: Date.now(),
            container,
            key,
            mimeType: mimeType || extToMime(ext),
            relativePath,
            serverId,
            size: stat.size,
            song,
            songId,
        };
        setRecord(record);

        emitProgress({
            absolutePath: finalPath,
            container,
            key,
            receivedBytes: stat.size,
            serverId,
            songId,
            status: 'complete',
            totalBytes: stat.size,
        });
    } catch (error: any) {
        if (partPath) {
            await safeUnlink(partPath);
        }

        const aborted = controller.signal.aborted || error?.code === 'ERR_CANCELED';
        emitProgress({
            error: aborted ? 'cancelled' : String(error?.message || error),
            key,
            receivedBytes: received,
            serverId,
            songId,
            status: 'error',
            totalBytes: total,
        });
    } finally {
        activeControllers.delete(key);
    }
};

const pump = (): void => {
    while (activeCount < MAX_CONCURRENT && queue.length > 0) {
        const request = queue.shift();
        if (!request) {
            break;
        }
        activeCount += 1;
        void downloadOne(request).finally(() => {
            activeCount -= 1;
            pump();
        });
    }
};

const enqueue = (requests: OfflineDownloadRequest[]): void => {
    for (const request of requests) {
        const alreadyQueued = queue.some((item) => item.key === request.key);
        const inProgress = activeControllers.has(request.key);
        const existing = getRecord(request.key);
        if (existing) {
            // Backfill song metadata for files downloaded before metadata was
            // stored, so they can be browsed/played offline without re-downloading.
            if (!existing.song && request.song) {
                setRecord({ ...existing, song: request.song });
            }
            continue;
        }
        if (alreadyQueued || inProgress) {
            continue;
        }
        queue.push(request);
    }
    pump();
};

const cancel = (keys: string[]): void => {
    const keySet = new Set(keys);
    for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (keySet.has(queue[i].key)) {
            queue.splice(i, 1);
        }
    }
    for (const key of keys) {
        activeControllers.get(key)?.abort();
    }
};

const remove = async (keys: string[]): Promise<string[]> => {
    cancel(keys);
    const removed: string[] = [];
    for (const key of keys) {
        const record = getRecord(key);
        if (record) {
            await safeUnlink(record.absolutePath);
            deleteRecord(key);
        }
        removed.push(key);
    }
    return removed;
};

// ---------------------------------------------------------------------------
// Serve downloaded audio to the renderer (web/HTML5 player) via feishin://
// ---------------------------------------------------------------------------

export const serveOfflineRequest = async (request: GlobalRequest): Promise<GlobalResponse> => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
        return new Response(null, { status: 400, statusText: 'Bad Request' });
    }

    const serverId = decodeURIComponent(segments[0]);
    const songId = decodeURIComponent(segments.slice(1).join('/'));
    const record = getRecord(`${serverId}::${songId}`);

    if (!record) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
    }

    let total: number;
    try {
        const stat = await fs.stat(record.absolutePath);
        total = stat.size;
    } catch {
        return new Response(null, { status: 404, statusText: 'Not Found' });
    }

    const contentType = record.mimeType || extToMime(path.extname(record.absolutePath).slice(1));
    const range = request.headers.get('range');

    if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        let start = match && match[1] ? parseInt(match[1], 10) : 0;
        let end = match && match[2] ? parseInt(match[2], 10) : total - 1;

        if (Number.isNaN(start) || start < 0) start = 0;
        if (Number.isNaN(end) || end >= total) end = total - 1;
        if (start > end) start = 0;

        const stream = createReadStream(record.absolutePath, { end, start });
        return new Response(Readable.toWeb(stream) as ReadableStream, {
            headers: {
                'Accept-Ranges': 'bytes',
                'Content-Length': String(end - start + 1),
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Content-Type': contentType,
            },
            status: 206,
        });
    }

    const stream = createReadStream(record.absolutePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(total),
            'Content-Type': contentType,
        },
        status: 200,
    });
};

export const isOfflineRequest = (rawUrl: string): boolean => {
    try {
        return new URL(rawUrl).host === OFFLINE_PROTOCOL_HOST;
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------------------
// Settings / stats
// ---------------------------------------------------------------------------

const getStats = (): OfflineStats => {
    const records = Object.values(getRecords());
    return {
        fileCount: records.length,
        rootPath: getDownloadPath(),
        totalBytes: records.reduce((sum, record) => sum + (record.size || 0), 0),
    };
};

const chooseDownloadPath = async (): Promise<null | string> => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select offline download folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const newRoot = result.filePaths[0];
    const oldRoot = getDownloadPath();

    if (path.normalize(newRoot) === path.normalize(oldRoot)) {
        return newRoot;
    }

    // Migrate existing downloads to the new location, updating the manifest.
    const records = getRecords();
    for (const record of Object.values(records)) {
        const destination = path.join(newRoot, record.relativePath);
        try {
            await moveFile(record.absolutePath, destination);
            record.absolutePath = destination;
        } catch (error) {
            console.error(`Failed to migrate offline file ${record.absolutePath}`, error);
        }
    }
    store.set('songs', records);
    store.set('downloadPath', newRoot);

    return newRoot;
};

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('offline-enqueue', (_event, requests: OfflineDownloadRequest[]) => {
    enqueue(requests);
});

ipcMain.handle('offline-cancel', (_event, keys: string[]) => {
    cancel(keys);
});

ipcMain.handle('offline-remove', (_event, keys: string[]) => {
    return remove(keys);
});

ipcMain.handle('offline-get-manifest', (): OfflineSongRecord[] => {
    return Object.values(getRecords());
});

ipcMain.handle('offline-get-stats', (): OfflineStats => {
    return getStats();
});

ipcMain.handle('offline-get-settings', (): OfflineSettings => {
    return { downloadPath: getDownloadPath() };
});

ipcMain.handle('offline-choose-download-path', () => {
    return chooseDownloadPath();
});

ipcMain.handle('offline-open-download-folder', async () => {
    const root = getDownloadPath();
    await fs.mkdir(root, { recursive: true });
    await shell.openPath(root);
});
