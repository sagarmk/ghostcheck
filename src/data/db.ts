/**
 * SQLite database wrapper.
 *
 * Provides schema management and typed queries for the offline
 * package registry and CVE databases.
 */

/**
 * Database schema version.
 */
export const SCHEMA_VERSION = 1;

/**
 * Database configuration.
 */
export interface DatabaseConfig {
  /** Path to the SQLite database file */
  readonly path: string;
  /** Whether to create the database if it doesn't exist */
  readonly createIfMissing: boolean;
  /** Whether to open in read-only mode */
  readonly readOnly: boolean;
}

/**
 * Package record from the registry database.
 */
export interface PackageRecord {
  readonly name: string;
  readonly registry: string;
  readonly version: string;
  readonly deprecated: boolean;
  readonly updatedAt: string;
}

/**
 * CVE/advisory record.
 */
export interface AdvisoryRecord {
  readonly id: string;
  readonly packageName: string;
  readonly registry: string;
  readonly severity: string;
  readonly affectedVersions: string;
  readonly summary: string;
  readonly publishedAt: string;
}

/**
 * SQLite database wrapper using better-sqlite3.
 */
export class Database {
  private _initialized = false;

  constructor(_config: DatabaseConfig) {
    // TODO: Store config for better-sqlite3 initialization
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the database connection and run migrations.
   */
  initialize(): Promise<void> {
    // TODO: Open better-sqlite3 connection
    // TODO: Run migrations from src/data/migrations/
    this._initialized = true;
    return Promise.resolve();
  }

  /**
   * Check if a package exists in the registry.
   */
  packageExists(name: string, registry: string): boolean {
    // TODO: SQLite query
    void name;
    void registry;
    return false;
  }

  /**
   * Look up a package by name.
   */
  getPackage(name: string, registry: string): PackageRecord | null {
    // TODO: SQLite query
    void name;
    void registry;
    return null;
  }

  /**
   * Get advisories for a package.
   */
  getAdvisories(packageName: string, registry: string): AdvisoryRecord[] {
    // TODO: SQLite query
    void packageName;
    void registry;
    return [];
  }

  /**
   * Get the database schema version.
   */
  getSchemaVersion(): number {
    // TODO: Query pragma or metadata table
    return SCHEMA_VERSION;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    // TODO: Close better-sqlite3 connection
    this._initialized = false;
  }
}
