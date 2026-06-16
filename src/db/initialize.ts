import Database from 'better-sqlite3';
import path from 'path';

const SCHEMA_SQL = `
  -- Application configuration (key-value store)
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Mowing event history
  CREATE TABLE IF NOT EXISTS mow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME NOT NULL,
    duration_minutes INTEGER
  );

  -- Weather data cache (avoids hammering HA API; one row per metric, replaced on hit)
  CREATE TABLE IF NOT EXISTS weather_cache (
    metric TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    data TEXT NOT NULL,
    ttl_minutes INTEGER DEFAULT 30
  );

  -- Algorithm execution log
  CREATE TABLE IF NOT EXISTS algorithm_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_time DATETIME NOT NULL,
    growth_estimate REAL,
    rain_delay_hours REAL,
    decision TEXT NOT NULL,
    decision_reason TEXT,
    next_run_time DATETIME
  );

  -- Growth history over time (for charting)
  CREATE TABLE IF NOT EXISTS growth_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    growth_mm REAL NOT NULL
  );

  -- Persistent soil moisture state (single row, upserted each run)
  CREATE TABLE IF NOT EXISTS soil_moisture_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    estimated_pct REAL NOT NULL,
    last_rain_total_mm REAL NOT NULL DEFAULT 0,
    last_rain_timestamp TEXT,
    last_updated_at TEXT NOT NULL,
    last_weather_start TEXT DEFAULT ''
  );
`;

const INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_algorithm_runs_time
    ON algorithm_runs(run_time);
  CREATE INDEX IF NOT EXISTS idx_growth_history_timestamp
    ON growth_history(timestamp);
  CREATE INDEX IF NOT EXISTS idx_mow_events_started
    ON mow_events(started_at);
`;

/**
 * Check if a table has a given column.
 */
function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return info.some((r) => r.name === column);
}

/**
 * Migrate existing tables to the v3 schema.
 * Rebuilds tables that had columns removed, preserving existing data.
 * Drops the dead rain_delay_history table.
 */
function migrateV3Tables(db: Database.Database): void {
  // Drop dead table
  try {
    db.exec('DROP TABLE IF EXISTS rain_delay_history');
  } catch {
    // Ignore
  }

  // mow_events: remove ended_at, growth_at_trigger, decision_reason, created_at
  if (
    tableHasColumn(db, 'mow_events', 'ended_at') ||
    tableHasColumn(db, 'mow_events', 'growth_at_trigger') ||
    tableHasColumn(db, 'mow_events', 'decision_reason') ||
    tableHasColumn(db, 'mow_events', 'created_at')
  ) {
    migrateTable(
      db,
      'mow_events',
      `CREATE TABLE mow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME NOT NULL,
        duration_minutes INTEGER
      )`,
      ['id', 'started_at', 'duration_minutes'],
    );
  }

  // weather_cache: remove id, created_at; change PK from id to metric
  if (
    tableHasColumn(db, 'weather_cache', 'created_at') ||
    tableHasColumn(db, 'weather_cache', 'id')
  ) {
    migrateTable(
      db,
      'weather_cache',
      `CREATE TABLE weather_cache (
        metric TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        data TEXT NOT NULL,
        ttl_minutes INTEGER DEFAULT 30
      )`,
      ['metric', 'entity_id', 'timestamp', 'data', 'ttl_minutes'],
    );
  }

  // algorithm_runs: remove created_at
  if (tableHasColumn(db, 'algorithm_runs', 'created_at')) {
    migrateTable(
      db,
      'algorithm_runs',
      `CREATE TABLE algorithm_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_time DATETIME NOT NULL,
        growth_estimate REAL,
        rain_delay_hours REAL,
        decision TEXT NOT NULL,
        decision_reason TEXT,
        next_run_time DATETIME
      )`,
      ['id', 'run_time', 'growth_estimate', 'rain_delay_hours', 'decision', 'decision_reason', 'next_run_time'],
    );
  }

  // growth_history: remove since_last_mow, created_at
  if (
    tableHasColumn(db, 'growth_history', 'since_last_mow') ||
    tableHasColumn(db, 'growth_history', 'created_at')
  ) {
    migrateTable(
      db,
      'growth_history',
      `CREATE TABLE growth_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        growth_mm REAL NOT NULL
      )`,
      ['id', 'timestamp', 'growth_mm'],
    );
  }
}

/**
 * Rebuild a table with a new schema, preserving specified columns.
 * Pattern: create temp → copy surviving columns → drop old → create new → restore.
 */
function migrateTable(
  db: Database.Database,
  table: string,
  newSchema: string,
  columnsToKeep: string[],
): void {
  const backup = `${table}_backup`;

  db.transaction(() => {
    // 1. Create backup with new schema
    db.exec(newSchema.replace(`CREATE TABLE ${table}`, `CREATE TABLE ${backup}`));

    // 2. Copy surviving columns
    const cols = columnsToKeep.filter((c) => tableHasColumn(db, table, c));
    if (cols.length > 0) {
      db.exec(`INSERT INTO ${backup} (${cols.join(', ')}) SELECT ${cols.join(', ')} FROM ${table}`);
    }

    // 3. Drop old table
    db.exec(`DROP TABLE ${table}`);

    // 4. Rename backup to real table
    db.exec(`ALTER TABLE ${backup} RENAME TO ${table}`);
  })();
}

export function initializeDatabase(dbPath: string): Database.Database {
  const fullPath = path.resolve(dbPath);
  const db = new Database(fullPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(SCHEMA_SQL);

  // Migration: add last_weather_start column if it doesn't exist (v2 tracker)
  try {
    db.exec("ALTER TABLE soil_moisture_state ADD COLUMN last_weather_start TEXT DEFAULT ''");
  } catch {
    // Column already exists — ignore
  }

  // Migration v3: rebuild tables with removed columns + drop dead table
  migrateV3Tables(db);

  // Create indexes for common queries
  db.exec(INDEX_SQL);

  return db;
}
