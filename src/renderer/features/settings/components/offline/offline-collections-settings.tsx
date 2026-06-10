import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { OfflineCollectionList } from '/@/renderer/features/offline/components/offline-collection-list';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';

export const OfflineCollectionsSettings = memo(() => {
    const { t } = useTranslation();

    return (
        <Stack gap="md">
            <TextTitle fw={600} order={4}>
                {t('offline.downloads', { defaultValue: 'Downloads' })}
            </TextTitle>
            <Stack gap="lg" px="xl">
                <OfflineCollectionList />
            </Stack>
        </Stack>
    );
});
