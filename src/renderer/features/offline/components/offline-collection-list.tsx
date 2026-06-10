import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineDownload } from '/@/renderer/features/offline/use-offline-download';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import {
    getDownloadedSongs,
    OfflineCollection,
    useOfflineCollections,
    useOfflineSongs,
} from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Progress } from '/@/shared/components/progress/progress';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Play } from '/@/shared/types/types';

interface CollectionProgress {
    complete: number;
    inProgress: boolean;
    pct: number;
    total: number;
}

export const OfflineCollectionList = memo(() => {
    const { t } = useTranslation();
    const collections = useOfflineCollections();
    const songs = useOfflineSongs();
    const player = usePlayer();
    const { remove, resync } = useOfflineDownload();
    const [busyKey, setBusyKey] = useState<null | string>(null);

    const list = useMemo(
        () => Object.values(collections).sort((a, b) => b.addedAt - a.addedAt),
        [collections],
    );

    const getProgress = useCallback(
        (collection: OfflineCollection): CollectionProgress => {
            const total = collection.songKeys.length;
            let complete = 0;
            let inProgress = false;

            for (const key of collection.songKeys) {
                const song = songs[key];
                if (!song) {
                    continue;
                }
                if (song.status === 'complete') {
                    complete += 1;
                } else if (song.status === 'downloading' || song.status === 'pending') {
                    inProgress = true;
                }
            }

            return {
                complete,
                inProgress,
                pct: total > 0 ? Math.round((complete / total) * 100) : 0,
                total,
            };
        },
        [songs],
    );

    const handlePlay = useCallback(
        (collection: OfflineCollection, type: Play) => {
            const downloaded = getDownloadedSongs(collection.songKeys);
            if (downloaded.length === 0) {
                return;
            }
            player.addToQueueByData(downloaded, type);
        },
        [player],
    );

    const handleResync = useCallback(
        async (collection: OfflineCollection) => {
            setBusyKey(collection.key);
            try {
                await resync(collection);
            } finally {
                setBusyKey(null);
            }
        },
        [resync],
    );

    const handleRemove = useCallback(
        async (collection: OfflineCollection) => {
            setBusyKey(collection.key);
            try {
                await remove(collection);
            } finally {
                setBusyKey(null);
            }
        },
        [remove],
    );

    if (list.length === 0) {
        return (
            <Text isMuted>
                {t('offline.noDownloads', {
                    defaultValue:
                        'No offline downloads yet. Right-click a playlist or album and choose "Download for offline".',
                })}
            </Text>
        );
    }

    return (
        <Stack gap="lg">
            {list.map((collection) => {
                const progress = getProgress(collection);
                const isBusy = busyKey === collection.key;
                const hasDownloads = progress.complete > 0;

                return (
                    <Stack gap="xs" key={collection.key}>
                        <Group justify="space-between" wrap="nowrap">
                            <Stack gap={2} style={{ minWidth: 0 }}>
                                <Text overflow="hidden">{collection.name}</Text>
                                <Text isMuted size="sm">
                                    {t('offline.collectionMeta', {
                                        complete: progress.complete,
                                        defaultValue: '{{type}} · {{complete}}/{{total}} tracks',
                                        total: progress.total,
                                        type: t(`entity.${collection.type}`, {
                                            count: 1,
                                            defaultValue: collection.type,
                                        }),
                                    })}
                                </Text>
                            </Stack>
                            <Group gap="sm" wrap="nowrap">
                                <Button
                                    disabled={!hasDownloads}
                                    leftSection={<Icon icon="mediaPlay" />}
                                    onClick={() => handlePlay(collection, Play.NOW)}
                                    size="compact-md"
                                    variant="filled"
                                >
                                    {t('player.play', { defaultValue: 'Play' })}
                                </Button>
                                <Button
                                    disabled={!hasDownloads}
                                    leftSection={<Icon icon="mediaPlayLast" />}
                                    onClick={() => handlePlay(collection, Play.LAST)}
                                    size="compact-md"
                                    variant="default"
                                >
                                    {t('offline.queue', { defaultValue: 'Queue' })}
                                </Button>
                                <Button
                                    disabled={isBusy}
                                    leftSection={<Icon icon="refresh" />}
                                    loading={isBusy}
                                    onClick={() => handleResync(collection)}
                                    size="compact-md"
                                    variant="default"
                                >
                                    {t('offline.resync', { defaultValue: 'Re-sync' })}
                                </Button>
                                <Button
                                    disabled={isBusy}
                                    onClick={() => handleRemove(collection)}
                                    size="compact-md"
                                    variant="subtle"
                                >
                                    {t('common.remove', { defaultValue: 'Remove' })}
                                </Button>
                            </Group>
                        </Group>
                        {progress.complete < progress.total && <Progress value={progress.pct} />}
                    </Stack>
                );
            })}
        </Stack>
    );
});
