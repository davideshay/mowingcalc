import Database from 'better-sqlite3';
import { AppConfigSchema, AppConfig } from './schema';
import { DEFAULT_CONFIG } from './defaults';

export class ConfigLoader {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Seed the config table with defaults if empty
  public seedDefaults(): void {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');

    const flat = this.flatten(DEFAULT_CONFIG);
    for (const [key, value] of Object.entries(flat)) {
      stmt.run(key, JSON.stringify(value));
    }
  }

  // Load config from DB, merge with defaults
  public load(): AppConfig {
    const rows = this.db.prepare('SELECT key, value FROM config').all();
    const dbValues: Record<string, unknown> = {};

    for (const row of rows as Array<{ key: string; value: string }>) {
      try {
        dbValues[row.key] = JSON.parse(row.value);
      } catch {
        // Corrupted row — skip, will fall back to default
      }
    }

    // Unflatten DB values back to nested structure
    const merged = this.mergeWithDefaults(this.unflatten(dbValues), DEFAULT_CONFIG);

    // Validate against schema
    return AppConfigSchema.parse(merged);
  }

  // Save full config to DB
  public save(config: AppConfig): void {
    const now = new Date().toISOString();
    const flat = this.flatten(config);

    const upsert = this.db.prepare(
      'INSERT INTO config (key, value, updated_at) VALUES (@key, @value, @updated_at) ' +
      'ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at',
    );

    this.db.transaction(() => {
      for (const [key, value] of Object.entries(flat)) {
        upsert.run({ key, value: JSON.stringify(value), updated_at: now });
      }
    })();
  }

  // Update a single config key (dotted path)
  public update(key: string, value: unknown): void {
    const upsert = this.db.prepare(
      'INSERT INTO config (key, value, updated_at) VALUES (@key, @value, @updated_at) ' +
      'ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at',
    );
    upsert.run({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
  }

  // Flatten nested object to dotted keys
  private flatten(obj: unknown, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        Object.assign(result, this.flatten(item, `${prefix}[${i}]`));
      });
      return obj.length > 0 ? result : { [prefix]: obj };
    }

    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        Object.assign(result, this.flatten(v, prefix ? `${prefix}.${k}` : k));
      }
      return Object.keys(result).length > 0 ? result : { [prefix]: obj };
    }

    return { [prefix]: obj };
  }

  // Unflatten dotted keys back to nested object
  private unflatten(flat: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(flat)) {
      const parts = key.match(/[^\[\]]+/g) || [];
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          // Check if next part is an array index
          const next = parts[i + 1];
          current[part] = /^\d+$/.test(next) ? [] : {};
        }
        current = current[part] as Record<string, unknown>;
      }

      const last = parts[parts.length - 1];
      current[last] = flat[key];
    }

    return result;
  }

  // Deep merge, preferring db values over defaults
  private mergeWithDefaults(dbValues: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, defValue] of Object.entries(defaults)) {
      if (key in dbValues) {
        // Both are objects — recurse
        if (
          dbValues[key] && defaults[key] &&
          typeof dbValues[key] === 'object' && typeof defaults[key] === 'object' &&
          !Array.isArray(dbValues[key]) && !Array.isArray(defaults[key])
        ) {
          result[key] = this.mergeWithDefaults(
            dbValues[key] as Record<string, unknown>,
            defaults[key] as Record<string, unknown>,
          );
        } else {
          // DB wins for arrays and primitives
          result[key] = dbValues[key];
        }
      } else {
        result[key] = defValue;
      }
    }

    return result;
  }
}
