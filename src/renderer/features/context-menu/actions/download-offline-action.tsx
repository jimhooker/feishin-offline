import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineDownload } from '/@/renderer/features/offline/use-offline-download';
import { useCurrentServer } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Album, LibraryItem, Playlist } from '/@/shared/types/domain-types';

interface DownloadOfflineActionProps {
    items: Album[] | Playlist[];
    itemType: LibraryItem.ALBUM | LibraryItem.PLAYLIST;
}

export const DownloadOfflineAction = ({ items, itemType }: DownloadOfflineActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const { download } = useOfflineDownload();

    const onSelect = useCallback(async () => {
        if (!server?.id) {
            return;
        }

        const type = itemType === LibraryItem.ALBUM ? 'album' : 'playlist';
        for (const item of items) {
            await download({ id: item.id, name: item.name, serverId: server.id, type });
        }
    }, [download, items, itemType, server]);

    if (!isElectron()) {
        return null;
    }

    return (
        <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
            {t('offline.downloadAction', { defaultValue: 'Download for offline' })}
        </ContextMenu.Item>
    );
};
