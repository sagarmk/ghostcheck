/**
 * Data layer — offline database management.
 *
 * Manages SQLite databases for package registries, CVE advisories,
 * API surface snapshots, and typosquat dictionaries.
 */

export { Database } from './db.js';
export { DatabaseUpdater } from './updater.js';
export { IntegrityVerifier } from './integrity.js';
