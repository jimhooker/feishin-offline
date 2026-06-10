import { useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { getAlbumSongsById, getPlaylistSongsById } from '/@/renderer/features/player/utils';
import {
    collectionKey,
    OfflineCollection,
    OfflineSong,
    useOfflineStore,
    useOfflineStoreActions,
} from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { Song } from '/@/shared/types/domain-types';
import {
    OfflineCollectionType,
    OfflineDownloadRequest,
    offlineKey,
} from '/@/shared/types/offline-types';

const offlineApi = isElectron() ? window.api.offline : null;

export interface OfflineDownloadTarget {
    id: string;
    name: string;
    serverId: string;
    type: OfflineCollectionType;
}

const toRequest = (song: Song, serverId: string): OfflineDownloadRequest => ({
    container: song.container,
    key: offlineKey(serverId, song.id),
    serverId,
    song,
    songId: song.id,
    url: api.controller.getDownloadUrl({
        apiClientProps: { serverId },
        query: { id: song.id },
    }),
});

const toPending = (song: Song, serverId: string): OfflineSong => ({
    container: song.container,
    key: offlineKey(serverId, song.id),
    receivedBytes: 0,
    serverId,
    song,
    songId: song.id,
    status: 'pending',
    totalBytes: 0,
});

// Set of song keys referenced by collections other than the given one — used to
// avoid deleting files that another downloaded playlist/album still needs.
const keysUsedByOtherCollections = (excludeKey: string): Set<string> => {
    const set = new Set<string>();
    for (const collection of Object.values(useOfflineStore.getState().collections)) {
        if (collection.key === excludeKey) {
            continue;
        }
        for (const key of collection.songKeys) {
            set.add(key);
        }
    }
    return set;
};

export const useOfflineDownload = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const { removeCollection, removeSongs, upsertCollection, upsertSongs } =
        useOfflineStoreActions();

    const fetchCollectionSongs = useCallback(
        async (target: OfflineDownloadTarget): Promise<Song[]> => {
            if (target.type === 'playlist') {
                const res = await getPlaylistSongsById({
                    id: target.id,
                    queryClient,
                    serverId: target.serverId,
                });
                return res?.items ?? [];
            }

            const res = await getAlbumSongsById({
                id: [target.id],
                queryClient,
                serverId: target.serverId,
            });
            return res?.items ?? [];
        },
        [queryClient],
    );

    const download = useCallback(
        async (target: OfflineDownloadTarget) => {
            if (!offlineApi) {
                return;
            }

            try {
                const songs = await fetchCollectionSongs(target);
                if (songs.length === 0) {
                    toast.warn({
                        message: t('offline.empty', {
                            defaultValue: 'Nothing to download',
                        }),
                    });
                    return;
                }

                const { serverId, type } = target;
                upsertSongs(songs.map((song) => toPending(song, serverId)));
                upsertCollection({
                    addedAt: Date.now(),
                    id: target.id,
                    key: collectionKey(serverId, type, target.id),
                    name: target.name,
                    serverId,
                    songKeys: songs.map((song) => offlineKey(serverId, song.id)),
                    syncedAt: Date.now(),
                    type,
                });

                await offlineApi.enqueue(songs.map((song) => toRequest(song, serverId)));

                toast.success({
                    message: t('offline.downloadStarted', {
                        count: songs.length,
                        defaultValue: 'Downloading {{count}} tracks for offline use',
                    }),
                });
            } catch (error) {
                console.error('Failed to start offline download:', error);
                toast.error({
                    message: t('offline.downloadError', {
                        defaultValue: 'Failed to start offline download',
                    }),
                });
            }
        },
        [fetchCollectionSongs, t, upsertCollection, upsertSongs],
    );

    const resync = useCallback(
        async (collection: OfflineCollection, options?: { silent?: boolean }) => {
            if (!offlineApi) {
                return;
            }

            const { serverId } = collection;
            const songs = await fetchCollectionSongs({
                id: collection.id,
                name: collection.name,
                serverId,
                type: collection.type,
            });

            const newKeys = songs.map((song) => offlineKey(serverId, song.id));
            const newKeySet = new Set(newKeys);

            upsertSongs(songs.map((song) => toPending(song, serverId)));

            const others = keysUsedByOtherCollections(collection.key);
            const removed = collection.songKeys.filter(
                (key) => !newKeySet.has(key) && !others.has(key),
            );
            if (removed.length > 0) {
                await offlineApi.remove(removed);
                removeSongs(removed);
            }

            upsertCollection({
                ...collection,
                songKeys: newKeys,
                syncedAt: Date.now(),
            });

            await offlineApi.enqueue(songs.map((song) => toRequest(song, serverId)));

            if (!options?.silent) {
                toast.success({
                    message: t('offline.resynced', {
                        defaultValue: 'Offline content re-synced',
                    }),
                });
            }
        },
        [fetchCollectionSongs, removeSongs, t, upsertCollection, upsertSongs],
    );

    const remove = useCallback(
        async (collection: OfflineCollection) => {
            if (!offlineApi) {
                return;
            }

            const others = keysUsedByOtherCollections(collection.key);
            const toDelete = collection.songKeys.filter((key) => !others.has(key));
            if (toDelete.length > 0) {
                await offlineApi.remove(toDelete);
                removeSongs(toDelete);
            }
            removeCollection(collection.key);

            toast.success({
                message: t('offline.removed', {
                    defaultValue: 'Removed from offline downloads',
                }),
            });
        },
        [removeCollection, removeSongs, t],
    );

    return { download, remove, resync };
};
