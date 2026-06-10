import isElectron from 'is-electron';

import { getOfflineSong, useSettingsStore } from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';
import { OFFLINE_PROTOCOL_HOST } from '/@/shared/types/offline-types';
import { PlayerType } from '/@/shared/types/types';

export const buildOfflineProtocolUrl = (serverId: string, songId: string): string =>
    `feishin://${OFFLINE_PROTOCOL_HOST}/${encodeURIComponent(serverId)}/${encodeURIComponent(songId)}`;

// Returns a playable URL for a downloaded song, or undefined if the song is not
// available offline. The mpv (LOCAL) player loads the absolute file path
// directly; the web/HTML5 player loads the file via the feishin:// protocol
// because it cannot read file:// URLs under the app's sandbox.
export const getOfflinePlaybackUrl = (song: QueueSong | undefined): string | undefined => {
    if (!isElectron() || !song?._serverId || !song?.id) {
        return undefined;
    }

    const record = getOfflineSong(song._serverId, song.id);
    if (!record || record.status !== 'complete') {
        return undefined;
    }

    const playerType = useSettingsStore.getState().playback.type;
    if (playerType === PlayerType.LOCAL && record.absolutePath) {
        return record.absolutePath;
    }

    return buildOfflineProtocolUrl(song._serverId, song.id);
};
