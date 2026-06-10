import { memo } from 'react';

import { OfflineCollectionsSettings } from '/@/renderer/features/settings/components/offline/offline-collections-settings';
import { OfflineStorageSettings } from '/@/renderer/features/settings/components/offline/offline-storage-settings';
import { Divider } from '/@/shared/components/divider/divider';
import { Stack } from '/@/shared/components/stack/stack';

export const OfflineTab = memo(() => {
    return (
        <Stack gap="md">
            <OfflineStorageSettings />
            <Divider />
            <OfflineCollectionsSettings />
        </Stack>
    );
});
