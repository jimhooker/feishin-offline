import isElectron from 'is-electron';
import { useEffect } from 'react';

import { useOfflineDownload } from '/@/renderer/features/offline/use-offline-download';
import { useCurrentServerId, useOfflineStore, useOfflineStoreActions } from '/@/renderer/store';

const offlineApi = isElectron() ? window.api.offline : null;

// Mounted once at app start. Rebuilds the offline song map from the
// main-process manifest, listens for download progress, and re-syncs any
// downloaded playlists/albums for the current server (when online).
export const useOfflineSync = (): void => {
    const { hydrate, updateProgress } = useOfflineStoreActions();
    const { resync } = useOfflineDownload();
    const serverId = useCurrentServerId();

    useEffect(() => {
        if (!offlineApi) {
            return undefined;
        }

        let mounted = true;

        offlineApi
            .getManifest()
            .then((records) => {
                if (mounted) {
                    hydrate(records);
                }
                return records;
            })
            .catch((error) => {
                console.error('Failed to load offline manifest:', error);
            });

        const unsubscribe = offlineApi.onProgress((progress) => updateProgress(progress));

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, [hydrate, updateProgress]);

    useEffect(() => {
        if (!offlineApi || !serverId) {
            return undefined;
        }

        let cancelled = false;

        const run = async () => {
            const collections = Object.values(useOfflineStore.getState().collections).filter(
                (collection) => collection.serverId === serverId,
            );

            for (const collection of collections) {
                if (cancelled) {
                    break;
                }
                try {
                    await resync(collection, { silent: true });
                } catch {
                    // Likely offline or a transient server error — keep existing
                    // downloads and try again on the next launch.
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [resync, serverId]);
};
