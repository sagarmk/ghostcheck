/**
 * Plugin loader — discovers and loads acv plugins.
 *
 * Plugins are npm packages that export an AcvPlugin object.
 * They can provide:
 *   - Custom rules
 *   - Language parsers
 *   - Output reporters
 *   - Lifecycle hooks
 */

import type { PluginInterface } from '../core/types.js';

/**
 * Loaded plugin with metadata.
 */
export interface LoadedPlugin {
  readonly plugin: PluginInterface;
  readonly packageName: string;
  readonly loadTimeMs: number;
}

/**
 * Plugin loader — discovers and validates plugins from npm packages.
 */
export class PluginLoader {
  private readonly _loaded = new Map<string, LoadedPlugin>();

  /**
   * Load a plugin by package name.
   */
  async load(packageName: string): Promise<LoadedPlugin> {
    const existing = this._loaded.get(packageName);
    if (existing) return existing;

    const start = performance.now();

    // Dynamic import of the plugin package
    const mod = (await import(packageName)) as { default?: PluginInterface } & PluginInterface;
    const plugin = mod.default ?? mod;

    // Validate plugin structure
    this._validate(plugin, packageName);

    const loaded: LoadedPlugin = {
      plugin,
      packageName,
      loadTimeMs: performance.now() - start,
    };

    this._loaded.set(packageName, loaded);
    return loaded;
  }

  /**
   * Load multiple plugins.
   */
  async loadAll(packageNames: readonly string[]): Promise<LoadedPlugin[]> {
    const results = await Promise.allSettled(packageNames.map((name) => this.load(name)));

    const loaded: LoadedPlugin[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'fulfilled') {
        loaded.push(result.value);
      } else {
        console.error(`Failed to load plugin "${packageNames[i]}": ${String(result.reason)}`);
      }
    }

    return loaded;
  }

  /**
   * Get all loaded plugins.
   */
  getLoaded(): readonly LoadedPlugin[] {
    return [...this._loaded.values()];
  }

  /**
   * Validate a plugin object has the required structure.
   */
  private _validate(plugin: unknown, packageName: string): asserts plugin is PluginInterface {
    if (typeof plugin !== 'object' || plugin === null) {
      throw new Error(`Plugin "${packageName}" does not export an object`);
    }

    const obj = plugin as Record<string, unknown>;

    if (typeof obj['name'] !== 'string' || !obj['name']) {
      throw new Error(`Plugin "${packageName}" is missing required "name" field`);
    }

    if (typeof obj['version'] !== 'string' || !obj['version']) {
      throw new Error(`Plugin "${packageName}" is missing required "version" field`);
    }
  }
}
