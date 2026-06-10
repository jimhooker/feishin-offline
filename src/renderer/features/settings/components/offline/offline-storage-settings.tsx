import isElectron from 'is-electron';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { useOfflineSongs } from '/@/renderer/store';
import { formatSizeString } from '/@/renderer/utils';
import { Button } from '/@/shared/components/button/button';
import { toast } from '/@/shared/components/toast/toast';
import { OfflineStats } from '/@/shared/types/offline-types';

const offlineApi = isElectron() ? window.api.offline : null;

export const OfflineStorageSettings = memo(() => {
    const { t } = useTranslation();
    const songs = useOfflineSongs();
    const [stats, setStats] = useState<null | OfflineStats>(null);

    const completeCount = useMemo(
        () => Object.values(songs).filter((song) => song.status === 'complete').length,
        [songs],
    );

    const refresh = useCallback(() => {
        if (!offlineApi) {
            return;
        }
        offlineApi.getStats().then(setStats).catch(console.error);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh, completeCount]);

    const handleOpenFolder = useCallback(() => {
        offlineApi?.openDownloadFolder().catch(console.error);
    }, []);

    const handleChangeFolder = useCallback(async () => {
        if (!offlineApi) {
            return;
        }
        try {
            const newPath = await offlineApi.chooseDownloadPath();
            if (newPath) {
                refresh();
                toast.success({
                    message: t('offline.folderChanged', {
                        defaultValue: 'Download folder updated',
                    }),
                });
            }
        } catch (error) {
            console.error(error);
            toast.error({ message: (error as Error).message });
        }
    }, [refresh, t]);

    const options: SettingOption[] = [
        {
            control: (
                <Button onClick={handleChangeFolder} size="compact-md" variant="default">
                    {t('common.change', { defaultValue: 'Change' })}
                </Button>
            ),
            description: stats?.rootPath ?? '',
            title: t('offline.downloadFolder', { defaultValue: 'Download folder' }),
        },
        {
            control: (
                <Button onClick={handleOpenFolder} size="compact-md" variant="default">
                    {t('offline.openFolder', { defaultValue: 'Open folder' })}
                </Button>
            ),
            description: t('offline.storageUsage', {
                count: stats?.fileCount ?? 0,
                defaultValue: '{{count}} tracks · {{size}}',
                size: formatSizeString(stats?.totalBytes),
            }),
            title: t('offline.storage', { defaultValue: 'Storage used' }),
        },
    ];

    return (
        <SettingsSection
            options={options}
            title={t('page.setting.offlineTab', { defaultValue: 'Offline' })}
        />
    );
});
