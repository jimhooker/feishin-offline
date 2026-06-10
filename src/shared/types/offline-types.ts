// Shared types for the offline download / sync feature.
// These are used across the Electron main process, the preload bridge, and the
// renderer, so they must not import anything process-specific.

import { Song } from '/@/shared/types/domain-types';

export type OfflineCollectionType = 'album' | 'playlist';

// A request sent from the renderer to the main process to download a track.
// `song` carries the full track metadata so downloaded content can be browsed
// and played without a server connection.
export interface OfflineDownloadRequest {
    container: null | string;
    key: string;
    serverId: string;
    song: Song;
    songId: string;
    url: string;
}

// Progress event emitted by the main process while downloading (or when a track
// completes / errors / is removed).
export interface OfflineProgress {
    absolutePath?: string;
    container?: null | string;
    error?: string;
    key: string;
    receivedBytes: number;
    serverId: string;
    songId: string;
    status: OfflineSongStatus;
    totalBytes: number;
}

export interface OfflineSettings {
    downloadPath: string;
}

// A single downloaded track as tracked by the main-process manifest (the source
// of truth for what actually exists on disk).
export interface OfflineSongRecord {
    absolutePath: string;
    addedAt: number;
    container: null | string;
    key: string;
    mimeType: string;
    relativePath: string;
    serverId: string;
    size: number;
    song: Song;
    songId: string;
}

export type OfflineSongStatus = 'complete' | 'downloading' | 'error' | 'pending';

export interface OfflineStats {
    fileCount: number;
    rootPath: string;
    totalBytes: number;
}

// Host segment used by the `feishin://` custom protocol to route offline audio
// requests (e.g. `feishin://offline/<serverId>/<songId>`). The renderer uses
// this for the HTML5/web audio player, which cannot load `file://` URLs.
export const OFFLINE_PROTOCOL_HOST = 'offline';

// Stable key for a downloaded song. Combines the server id and song id so the
// same track on two different servers is tracked independently.
export const offlineKey = (serverId: string, songId: string): string => `${serverId}::${songId}`;
