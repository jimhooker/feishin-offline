import isElectron from 'is-electron';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineDownload } from '/@/renderer/features/offline/use-offline-download';
import { collectionKey, useCurrentServer, useOfflineCollections } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';

// Downloads (or re-syncs) the current server's favorited tracks for offline use,
// reusing the same collection/download machinery as playlists and albums.
export const FavoritesOfflineButton = () => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const collections = useOfflineCollections();
    const { download, resync } = useOfflineDownload();

    const existing = useMemo(() => {
        if (!server?.id) {
            return undefined;
        }
        return collections[collectionKey(server.id, 'favorites', 'favorites')];
    }, [collections, server]);

    const onClick = useCallback(async () => {
        if (!server?.id) {
            return;
        }

        if (existing) {
            await resync(existing);
            return;
        }

        await download({
            id: 'favorites',
            name: t('page.favorites.title', { defaultValue: 'Favorites' }),
            serverId: server.id,
            type: 'favorites',
        });
    }, [download, existing, resync, server, t]);

    if (!isElectron()) {
        return null;
    }

    return (
        <Button leftSection={<Icon icon="download" />} onClick={onClick} variant="subtle">
            {existing
                ? t('offline.resyncAction', { defaultValue: 'Re-sync offline' })
                : t('offline.downloadAction', { defaultValue: 'Download for offline' })}
        </Button>
    );
};
