import { useTranslation } from 'react-i18next';

import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { OfflineCollectionList } from '/@/renderer/features/offline/components/offline-collection-list';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

const OfflineRoute = () => {
    const { t } = useTranslation();

    return (
        <AnimatedPage>
            <PageHeader />
            <div style={{ height: '100%', overflowY: 'auto', padding: '1.5rem', width: '100%' }}>
                <Stack gap="md">
                    <TextTitle order={2}>
                        {t('page.offline.title', { defaultValue: 'Offline' })}
                    </TextTitle>
                    <Text isMuted>
                        {t('page.offline.description', {
                            defaultValue: 'Playlists and albums available without a connection.',
                        })}
                    </Text>
                    <OfflineCollectionList />
                </Stack>
            </div>
        </AnimatedPage>
    );
};

const OfflineRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <OfflineRoute />
        </PageErrorBoundary>
    );
};

export default OfflineRouteWithBoundary;
