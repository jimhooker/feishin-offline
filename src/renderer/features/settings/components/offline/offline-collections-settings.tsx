import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineDownload } from '/@/renderer/features/offline/use-offline-download';
import { OfflineCollection, useOfflineCollections, useOfflineSongs } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Progress } from '/@/shared/components/progress/progress';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

interface CollectionProgress {
    complete: number;
    inProgress: boolean;
    pct: number;
    total: number;
}

export const OfflineCollectionsSettings = memo(() => {
    const { t } = useTranslation();
    const collections = useOfflineCollections();
    const songs = useOfflineSongs();
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

    return (
        <Stack gap="md">
            <TextTitle fw={600} order={4}>
                {t('offline.downloads', { defaultValue: 'Downloads' })}
            </TextTitle>
            {list.length === 0 ? (
                <Text isMuted px="xl">
                    {t('offline.noDownloads', {
                        defaultValue:
                            'No offline downloads yet. Right-click a playlist or album and choose "Download for offline".',
                    })}
                </Text>
            ) : (
                <Stack gap="lg" px="xl">
                    {list.map((collection) => {
                        const progress = getProgress(collection);
                        const isBusy = busyKey === collection.key;

                        return (
                            <Stack gap="xs" key={collection.key}>
                                <Group justify="space-between" wrap="nowrap">
                                    <Stack gap={2}>
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
                                    <Group gap="sm" wrap="nowrap">
                                        <Button
                                            disabled={isBusy}
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
                                {progress.complete < progress.total && (
                                    <Progress value={progress.pct} w="100%" />
                                )}
                            </Stack>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
});
