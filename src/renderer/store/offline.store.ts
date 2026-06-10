import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';

import {
    OfflineCollectionType,
    offlineKey,
    OfflineProgress,
    OfflineSongRecord,
    OfflineSongStatus,
} from '/@/shared/types/offline-types';

export interface OfflineCollection {
    addedAt: number;
    id: string;
    key: string;
    name: string;
    serverId: string;
    songKeys: string[];
    syncedAt: number;
    type: OfflineCollectionType;
}

export interface OfflineSong {
    absolutePath?: string;
    container: null | string;
    key: string;
    receivedBytes: number;
    serverId: string;
    songId: string;
    status: OfflineSongStatus;
    totalBytes: number;
}

export const collectionKey = (serverId: string, type: OfflineCollectionType, id: string): string =>
    `${serverId}::${type}::${id}`;

export interface OfflineSlice extends OfflineState {
    actions: {
        getSong: (key: string) => OfflineSong | undefined;
        hydrate: (records: OfflineSongRecord[]) => void;
        removeCollection: (key: string) => void;
        removeSongs: (keys: string[]) => void;
        updateProgress: (progress: OfflineProgress) => void;
        upsertCollection: (collection: OfflineCollection) => void;
        upsertSongs: (songs: OfflineSong[]) => void;
    };
}

export interface OfflineState {
    collections: Record<string, OfflineCollection>;
    songs: Record<string, OfflineSong>;
}

export const useOfflineStore = createWithEqualityFn<OfflineSlice>()(
    persist(
        devtools(
            immer((set, get) => ({
                actions: {
                    getSong: (key) => get().songs[key],
                    hydrate: (records) => {
                        set((state) => {
                            const next: Record<string, OfflineSong> = {};
                            for (const record of records) {
                                next[record.key] = {
                                    absolutePath: record.absolutePath,
                                    container: record.container,
                                    key: record.key,
                                    receivedBytes: record.size,
                                    serverId: record.serverId,
                                    songId: record.songId,
                                    status: 'complete',
                                    totalBytes: record.size,
                                };
                            }

                            // Preserve any in-flight (pending/downloading) entries
                            // that are not yet part of the on-disk manifest.
                            for (const song of Object.values(state.songs)) {
                                if (
                                    !next[song.key] &&
                                    (song.status === 'pending' || song.status === 'downloading')
                                ) {
                                    next[song.key] = song;
                                }
                            }

                            state.songs = next;
                        });
                    },
                    removeCollection: (key) => {
                        set((state) => {
                            delete state.collections[key];
                        });
                    },
                    removeSongs: (keys) => {
                        set((state) => {
                            for (const key of keys) {
                                delete state.songs[key];
                            }
                        });
                    },
                    updateProgress: (progress) => {
                        set((state) => {
                            if (progress.status === 'error') {
                                // Drop failed/cancelled entries so the UI does not
                                // show a permanently stuck download.
                                delete state.songs[progress.key];
                                return;
                            }

                            state.songs[progress.key] = {
                                absolutePath:
                                    progress.absolutePath ??
                                    state.songs[progress.key]?.absolutePath,
                                container:
                                    progress.container ??
                                    state.songs[progress.key]?.container ??
                                    null,
                                key: progress.key,
                                receivedBytes: progress.receivedBytes,
                                serverId: progress.serverId,
                                songId: progress.songId,
                                status: progress.status,
                                totalBytes: progress.totalBytes,
                            };
                        });
                    },
                    upsertCollection: (collection) => {
                        set((state) => {
                            state.collections[collection.key] = collection;
                        });
                    },
                    upsertSongs: (songs) => {
                        set((state) => {
                            for (const song of songs) {
                                // Do not downgrade an already-complete download.
                                if (state.songs[song.key]?.status === 'complete') {
                                    continue;
                                }
                                state.songs[song.key] = song;
                            }
                        });
                    },
                },
                collections: {},
                songs: {},
            })),
            { name: 'store_offline' },
        ),
        {
            name: 'store_offline',
            // Only collections are persisted; the songs map is rebuilt from the
            // main-process manifest (the source of truth) on every launch.
            partialize: (state) => ({ collections: state.collections }),
            version: 1,
        },
    ),
);

export const useOfflineStoreActions = () => useOfflineStore((state) => state.actions);

export const useOfflineCollections = () => useOfflineStore((state) => state.collections, shallow);

export const useOfflineSongs = () => useOfflineStore((state) => state.songs, shallow);

export const useOfflineSong = (key: string) => useOfflineStore((state) => state.songs[key]);

// Non-hook accessor for use inside the playback URL resolver.
export const getOfflineSong = (serverId: string, songId: string): OfflineSong | undefined =>
    useOfflineStore.getState().songs[offlineKey(serverId, songId)];
