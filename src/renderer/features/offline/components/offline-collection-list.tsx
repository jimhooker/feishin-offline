import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineDownload } from '/@/renderer/features/offline/use-offline-download';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { OfflineCollection, useOfflineCollections, useOfflineSongs } from '/@/renderer/store';
import { formatDurationString } from '/@/renderer/utils';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Progress } from '/@/shared/components/progress/progress';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Song } from '/@/shared/types/domain-types';
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
    const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());

    const list = useMemo(
        () => Object.values(collections).sort((a, b) => b.addedAt - a.addedAt),
        [collections],
    );

    // The downloaded songs (with metadata) for a collection, in order.
    const getCollectionSongs = useCallback(
        (collection: OfflineCollection): Song[] =>
            collection.songKeys
                .map((key) => songs[key])
                .filter((song) => Boolean(song?.song) && song?.status === 'complete')
                .map((song) => song!.song as Song),
        [songs],
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

    const toggleExpanded = useCallback((key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const handlePlay = useCallback(
        (collection: OfflineCollection, type: Play, playSongId?: string) => {
            const downloaded = getCollectionSongs(collection);
            if (downloaded.length === 0) {
                return;
            }
            player.addToQueueByData(downloaded, type, playSongId);
        },
        [getCollectionSongs, player],
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
                const isExpanded = expandedKeys.has(collection.key);
                const hasDownloads = progress.complete > 0;
                const collectionSongs = isExpanded ? getCollectionSongs(collection) : [];

                return (
                    <Stack gap="xs" key={collection.key}>
                        <Group justify="space-between" wrap="nowrap">
                            <Group
                                gap="xs"
                                onClick={() => toggleExpanded(collection.key)}
                                role="button"
                                style={{ cursor: 'pointer', minWidth: 0 }}
                                wrap="nowrap"
                            >
                                <Icon icon={isExpanded ? 'arrowDownS' : 'arrowRightS'} />
                                <Stack gap={2} style={{ minWidth: 0 }}>
                                    <Text overflow="hidden">{collection.name}</Text>
                                    <Text isMuted size="sm">
                                        {t('offline.collectionMeta', {
                                            complete: progress.complete,
                                            defaultValue:
                                                '{{type}} · {{complete}}/{{total}} tracks',
                                            total: progress.total,
                                            type: t(`entity.${collection.type}`, {
                                                count: 1,
                                                defaultValue: collection.type,
                                            }),
                                        })}
                                    </Text>
                                </Stack>
                            </Group>
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
                        {isExpanded && (
                            <Stack gap={0} pl="2rem">
                                {collectionSongs.length === 0 ? (
                                    <Text isMuted py="xs" size="sm">
                                        {t('offline.noTracksDownloaded', {
                                            defaultValue: 'No downloaded tracks yet.',
                                        })}
                                    </Text>
                                ) : (
                                    collectionSongs.map((song, index) => (
                                        <Group
                                            gap="md"
                                            key={song.id}
                                            onClick={() =>
                                                handlePlay(collection, Play.NOW, song.id)
                                            }
                                            role="button"
                                            style={{
                                                borderRadius: 'var(--theme-card-default-radius)',
                                                cursor: 'pointer',
                                                padding: '0.35rem 0.5rem',
                                            }}
                                            wrap="nowrap"
                                        >
                                            <Text isMuted size="sm" style={{ width: '1.5rem' }}>
                                                {index + 1}
                                            </Text>
                                            <Text
                                                overflow="hidden"
                                                size="sm"
                                                style={{ flex: 1, minWidth: 0 }}
                                            >
                                                {song.name}
                                            </Text>
                                            <Text isMuted overflow="hidden" size="sm">
                                                {song.artistName || song.artists?.[0]?.name || ''}
                                            </Text>
                                            <Text isMuted size="sm">
                                                {formatDurationString(song.duration)}
                                            </Text>
                                        </Group>
                                    ))
                                )}
                            </Stack>
                        )}
                    </Stack>
                );
            })}
        </Stack>
    );
});
