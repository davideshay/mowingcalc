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
        Object.assign(result, this.flatten(item, `${prefix}.${i}`));
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

    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const next = parts[i + 1];
        const isNextIndex = /^\d+$/.test(next);

        if (!(part in current)) {
          current[part] = isNextIndex ? [] : {};
        }

        // If current[part] is a primitive but next part is an index, convert to array
        if (typeof current[part] === 'number' || typeof current[part] === 'string') {
          current[part] = [];
        }

        current = current[part] as Record<string, unknown>;

        // If current is an array and part is an index, navigate into it
        if (Array.isArray(current) && /^\d+$/.test(part)) {
          const idx = parseInt(part, 10);
          while (current.length <= idx) {
            current.push(isNextIndex ? [] : {});
          }
          current = current[idx] as Record<string, unknown>;
        }
      }

      const last = parts[parts.length - 1];
      if (Array.isArray(current) && /^\d+$/.test(last)) {
        const idx = parseInt(last, 10);
        current[idx] = value;
      } else {
        current[last] = value;
      }
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
