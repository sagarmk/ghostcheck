/**
 * Database updater — downloads and applies registry updates.
 *
 * Supports both delta (incremental) and full database updates.
 * All downloads are verified with Ed25519 signatures.
 */

/**
 * Update check result.
 */
export interface UpdateInfo {
  readonly available: boolean;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly deltaSize?: number;
  readonly fullSize?: number;
}

/**
 * Update progress callback.
 */
export type UpdateProgressCallback = (progress: {
  readonly phase: 'download' | 'verify' | 'apply';
  readonly percent: number;
  readonly bytesDownloaded?: number;
  readonly totalBytes?: number;
}) => void;

/**
 * Database updater.
 */
export class DatabaseUpdater {
  /**
   * Check if updates are available.
   */
  checkForUpdates(): Promise<UpdateInfo> {
    // TODO: Fetch update manifest from CDN
    return Promise.resolve({
      available: false,
      currentVersion: '0.0.0',
      latestVersion: '0.0.0',
    });
  }

  /**
   * Download and apply updates.
   */
  async update(
    _options: { force?: boolean; proxy?: string } = {},
    _onProgress?: UpdateProgressCallback,
  ): Promise<void> {
    // TODO: Download delta/full update, verify signature, apply
  }
}
