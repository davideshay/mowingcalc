import Database from 'better-sqlite3';
import { AppConfigSchema, AppConfig } from './schema';
import { DEFAULT_CONFIG } from './defaults';

/**
 * ConfigLoader — stores each top-level config section as a JSON blob in SQLite.
 *
 * No flattening or unflattening. Each key like 'entityGroups', 'growthModel',
 * 'rainDelayModel', etc. is stored as a single JSON string. This eliminates
 * all the array-index and stale-key bugs from the old flatten approach.
 */
export class ConfigLoader {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Seed the config table with defaults if empty
  public seedDefaults(): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)'
    );
    const existingKeysRaw = this.db.prepare('SELECT key FROM config').all() as Array<{ key: string }>;
    const existingKeyNames = existingKeysRaw.map(r => r.key);

    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      // Skip object-type defaults if flattened child keys exist
      // (the flat keys contain the actual user data that needs migration)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const hasChildKeys = existingKeyNames.some((k) => k.startsWith(key + '.'));
        if (hasChildKeys) continue;
      }

      stmt.run(key, JSON.stringify(value));
    }
  }

  // Load config from DB, merge with defaults for any missing keys
  public load(): AppConfig {
    const rows = this.db.prepare('SELECT key, value FROM config').all();
    let dbValues: Record<string, unknown> = {};

    for (const row of rows as Array<{ key: string; value: string }>) {
      try {
        dbValues[row.key] = JSON.parse(row.value);
      } catch {
        // Corrupted row — skip, will fall back to default
      }
    }

    // Migration: convert old flattened keys (entityGroups.rainfallSensors.0, etc.)
    // to new JSON blob format (entityGroups = {...}).
    // This is a ONE-TIME migration — only runs when configVersion < 3.
    // configVersion >= 3 means migration already completed (flat keys cleaned up).
    const savedVersion = (dbValues['configVersion'] as number) ?? 0;
    if (savedVersion < 3) {
      dbValues = this.migrateFlattenedKeys(dbValues);
    }

    // Deep-merge DB values with defaults (DB wins for existing keys)
    let merged = this.deepMergeDefaults(DEFAULT_CONFIG, dbValues);

    // Migrations: apply one-time config updates for schema changes
    merged = this.applyMigrations(merged, DEFAULT_CONFIG);

    // Persist the migration version back to DB
    const version = merged['configVersion'] as number | undefined;
    if (version !== undefined) {
      this.update('configVersion', version);
    }

    // Validate against schema
    return AppConfigSchema.parse(merged);
  }

    /**
   * Detect and convert old flattened keys to JSON blobs.
   *
   * Old format: entityGroups.rainfallSensors.0 = "sensor.aw_1_hourly_rain"
   * New format: entityGroups = {"rainfallSensors": ["sensor.aw_1_hourly_rain"], ...}
   *
   * When BOTH a parent blob and flattened child keys exist, we must determine
   * which is authoritative:
   *   - If the blob was stored by update() (user-modified), it is newer and wins.
   *   - If the blob is just defaults from seedDefaults(), the flattened keys
   *     contain the actual user data and win.
   *
   * We detect this by comparing the blob to the defaults. If the blob fields
   * that have corresponding flattened keys are identical to defaults, the blob
   * is stale — use the flattened keys. Otherwise, the blob was user-modified.
   *
   * This is a ONE-TIME migration that persists the blob to DB and deletes
   * flat keys. After migration completes, it will not run again (guarded by
   * configVersion check in load()).
   */
  private migrateFlattenedKeys(dbValues: Record<string, unknown>): Record<string, unknown> {
    const flatKeysToDelete: string[] = [];
    const now = new Date().toISOString();

    // Identify top-level groups that have flattened child keys
    const groupPrefixes = Object.keys(DEFAULT_CONFIG).filter((k) => {
      const def = (DEFAULT_CONFIG as Record<string, unknown>)[k];
      return def && typeof def === 'object' && !Array.isArray(def);
    });

    for (const prefix of groupPrefixes) {
      // Find all keys under this prefix
      const childKeys = Object.keys(dbValues).filter((k) => k.startsWith(`${prefix}.`));
      if (childKeys.length === 0) continue;

      // If parent blob exists, check if it was user-modified or is just defaults
      if (prefix in dbValues) {
        const parentVal = dbValues[prefix];
        if (parentVal && typeof parentVal === 'object' && !Array.isArray(parentVal)) {
          const blobIsUserModified = this.blobDiffersFromDefaults(prefix, parentVal as Record<string, unknown>, childKeys);
          if (blobIsUserModified) {
            // Blob was modified by update() — it is the authoritative source.
            // Delete orphaned child keys from memory AND DB.
            for (const ck of childKeys) {
              delete dbValues[ck];
              flatKeysToDelete.push(ck);
            }
            continue;
          }
          // Blob is just defaults — flattened keys contain the real user data.
          // Fall through to reconstruct from flattened keys.
        }
      }

      // No parent blob OR blob is stale defaults — reconstruct from flattened keys
      let nested = this.reconstructNested(prefix, childKeys, dbValues);

      // Track old child keys for DB cleanup
      for (const ck of childKeys) {
        delete dbValues[ck];
        flatKeysToDelete.push(ck);
      }

      // If there was a stale parent blob, merge reconstructed data into it
      // (the blob may have fields that the flattened keys don't cover)
      if (prefix in dbValues) {
        const parentVal = dbValues[prefix] as Record<string, unknown>;
        // Delete the stale blob from dbValues
        delete dbValues[prefix];
        // Merge: reconstructed nested data wins, parent blob fills in missing fields
        nested = this.deepMergeDefaults(nested, parentVal);
      }

      // Store as single JSON blob in memory
      dbValues[prefix] = nested;

      // CRITICAL: persist the reconstructed blob to DB immediately.
      // This is a migration — we're converting flat keys to a blob.
      // Without this, the blob only exists in memory and is lost on next load().
      const upsert = this.db.prepare(
        'INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      );
      upsert.run(prefix, JSON.stringify(nested), now);
    }

    // Delete flat keys from DB
    if (flatKeysToDelete.length > 0) {
      const placeholders = flatKeysToDelete.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM config WHERE key IN (${placeholders})`).run(...flatKeysToDelete);
    }

    return dbValues;
  }

  /**
   * Check if a blob differs from defaults for fields that have corresponding flattened keys.
   * Returns true if the blob has been user-modified (e.g., by update()), false if it's
   * just the defaults from seedDefaults().
   */
  private blobDiffersFromDefaults(
    prefix: string,
    blob: Record<string, unknown>,
    childKeys: string[],
  ): boolean {
    const defaults = (DEFAULT_CONFIG as Record<string, unknown>)[prefix] as Record<string, unknown> | undefined;
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return false;

    // For each flattened key, extract the top-level sub-key and compare
    // e.g., entityGroups.rainfallSensors.0 -> compare blob.rainfallSensors vs defaults.rainfallSensors
    const topLevelSubKeys = new Set<string>();
    for (const ck of childKeys) {
      const relative = ck.slice(prefix.length + 1); // e.g., "rainfallSensors.0"
      const topKey = relative.split('.')[0]; // e.g., "rainfallSensors"
      topLevelSubKeys.add(topKey);
    }

    // If any sub-key is missing from blob (but exists as flat keys), the blob is incomplete
    // and was likely written by a partial update — treat it as user-modified.
    for (const subKey of topLevelSubKeys) {
      if (!(subKey in blob)) {
        return true;
      }
    }

    // If any sub-key in the blob differs from defaults, the blob is user-modified
    for (const subKey of topLevelSubKeys) {
      if (subKey in blob && subKey in defaults) {
        if (JSON.stringify(blob[subKey]) !== JSON.stringify(defaults[subKey])) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Reconstruct a nested object from flattened dotted keys.
   * e.g., ["entityGroups.rainfallSensors.0", "entityGroups.rainfallSensors.1"]
   * -> { rainfallSensors: ["val0", "val1"], ...other fields... }
   */
  private reconstructNested(
    prefix: string,
    childKeys: string[],
    dbValues: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Sort keys so child keys come before parent keys (deepest first)
    // This ensures we build arrays/objects bottom-up
    const sorted = childKeys
      .map((k) => k.slice(prefix.length + 1)) // strip prefix
      .sort((a, b) => b.split('.').length - a.split('.').length);

    for (const relativeKey of sorted) {
      const fullPath = `${prefix}.${relativeKey}`;
      const value = dbValues[fullPath];
      const parts = relativeKey.split('.');

      // Skip array-valued keys — they are stale artifacts from the old flatten format
      // (e.g., entityGroups.rainfallSensors = []). Indexed child keys
      // (e.g., entityGroups.rainfallSensors.0 = "...") will correctly rebuild the array.
      // Processing the empty array last would overwrite the populated one.
      if (Array.isArray(value)) continue;

      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const next = parts[i + 1];
        const isNextIndex = /^\d+$/.test(next);

        if (!(part in current)) {
          current[part] = isNextIndex ? [] : {};
        }

        // Navigate into child
        if (Array.isArray(current[part]) && /^\d+$/.test(part)) {
          const idx = parseInt(part, 10);
          while ((current[part] as unknown[]).length <= idx) {
            (current[part] as unknown[]).push({});
          }
          current = (current[part] as unknown[])[idx] as Record<string, unknown>;
        } else if (typeof current[part] === 'object' && current[part] !== null) {
          current = current[part] as Record<string, unknown>;
        } else {
          // Convert primitive to object/array
          current[part] = isNextIndex ? [] : {};
          current = current[part] as Record<string, unknown>;
        }
      }

      const last = parts[parts.length - 1];
      if (Array.isArray(current) && /^\d+$/.test(last)) {
        const idx = parseInt(last, 10);
        (current as unknown[])[idx] = value;
      } else {
        (current as Record<string, unknown>)[last] = value;
      }
    }

    return result;
  }

  // Apply config migrations
  private applyMigrations(
    config: Record<string, unknown>,
    defaults: Record<string, unknown>,
  ): Record<string, unknown> {
    const versionKey = 'configVersion';
    const savedVersion = config[versionKey] as number | undefined;
    const currentVersion = 4;

    if ((savedVersion ?? 0) >= currentVersion) {
      return config;
    }

    // Migration v3 -> v4: add per-sensor units for existing sensors without units
    if ((savedVersion ?? 0) < 4) {
      const eg = config.entityGroups as Record<string, unknown> | undefined;
      if (eg) {
        for (const key of ['temperatureSensors', 'rainfallSensors']) {
          const arr = eg[key];
          if (Array.isArray(arr)) {
            eg[key] = arr.map((item: unknown) => {
              if (typeof item === 'string') {
                return { entity_id: item, added_at: new Date().toISOString(), unit: key === 'temperatureSensors' ? 'celsius' : 'millimeters' };
              }
              if (item && typeof item === 'object' && 'entity_id' in item && !('unit' in item)) {
                const obj = item as Record<string, unknown>;
                obj.unit = key === 'temperatureSensors' ? 'celsius' : 'millimeters';
                if (!obj.added_at) {
                  obj.added_at = new Date().toISOString();
                }
                return obj;
              }
              return item;
            });
          }
        }
      }
    }

    // Migration v1 -> v2: fix growth model base rates
    if ((savedVersion ?? 0) < 2) {
      const growthModel = config.growthModel as Record<string, unknown> | undefined;
      const defaultGM = (defaults.growthModel as Record<string, unknown>) || {};
      if (growthModel && typeof growthModel === 'object') {
        const rate = growthModel.baseRatePerDay;
        if (typeof rate === 'number' && rate < 1.5) {
          growthModel.baseRatePerDay = defaultGM.baseRatePerDay as number;
        }
      }
    }

    // Migration v2 -> v3: convert rainfallSensors/temperatureSensors from string[]
    // to { entity_id, added_at }[]. Plain strings get current timestamp as added_at.
    if ((savedVersion ?? 0) < 3) {
      const eg = config.entityGroups as Record<string, unknown> | undefined;
      if (eg && typeof eg === 'object') {
        for (const key of ['rainfallSensors', 'temperatureSensors']) {
          const arr = eg[key];
          if (Array.isArray(arr)) {
            eg[key] = arr.map((item) => {
              if (typeof item === 'string') {
                return { entity_id: item, added_at: new Date().toISOString() };
              }
              if (item && typeof item === 'object' && 'entity_id' in item) {
                const obj = item as Record<string, unknown>;
                if (!obj.added_at) {
                  obj.added_at = new Date().toISOString();
                }
                return obj;
              }
              return item;
            });
          }
        }
      }
    }

    config[versionKey] = currentVersion;
    return config;
  }

  /**
   * Deep merge: recursively merge source into target, preferring source values.
   * Used by the PUT config endpoint to safely update nested objects.
   */
  public deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    return this.deepMergeDefaults(target, source) as T;
  }

  /**
   * Deep merge defaults with DB values. DB values win for existing keys,
   * defaults fill in anything missing.
   */
  private deepMergeDefaults(
    defaults: Record<string, unknown>,
    overrides: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, defValue] of Object.entries(defaults)) {
      if (key in overrides) {
        const overrideValue = overrides[key];

        // Both are non-array objects — recurse
        if (
          defValue && overrideValue &&
          typeof defValue === 'object' && typeof overrideValue === 'object' &&
          !Array.isArray(defValue) && !Array.isArray(overrideValue)
        ) {
          result[key] = this.deepMergeDefaults(
            defValue as Record<string, unknown>,
            overrideValue as Record<string, unknown>,
          );
        } else {
          // Override wins for arrays and primitives
          result[key] = overrideValue;
        }
      } else {
        result[key] = defValue;
      }
    }

    return result;
  }

  // Save full config to DB
  public save(config: AppConfig, configVersion?: number): void {
    const now = new Date().toISOString();

    // Build set of valid keys from the schema defaults
    const validKeys = new Set(Object.keys(DEFAULT_CONFIG));
    if (configVersion !== undefined) {
      validKeys.add('configVersion');
    }

    // Delete orphaned keys (including old flattened keys from migration)
    const allRows = this.db.prepare('SELECT key FROM config').all() as Array<{ key: string }>;
    const toDelete = allRows
      .filter((r) => !validKeys.has(r.key))
      .map((r) => r.key);
    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM config WHERE key IN (${placeholders})`).run(...toDelete);
    }

    const upsert = this.db.prepare(
      'INSERT INTO config (key, value, updated_at) VALUES (@key, @value, @updated_at) ' +
      'ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at',
    );

    this.db.transaction(() => {
      for (const [key, value] of Object.entries(config)) {
        upsert.run({ key, value: JSON.stringify(value), updated_at: now });
      }
      if (configVersion !== undefined) {
        upsert.run({ key: 'configVersion', value: JSON.stringify(configVersion), updated_at: now });
      }
    })();
  }

  // Update a single top-level config key (e.g., 'entityGroups', 'growthModel')
  // Stores the entire value as a JSON blob — no flattening needed.
  public update(key: string, value: unknown): void {
    const now = new Date().toISOString();
    const upsert = this.db.prepare(
      'INSERT INTO config (key, value, updated_at) VALUES (@key, @value, @updated_at) ' +
      'ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at',
    );
    upsert.run({ key, value: JSON.stringify(value), updated_at: now });
  }
}
