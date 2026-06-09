import Database from 'better-sqlite3';
import path from 'path';

export function initializeDatabase(dbPath: string): Database.Database {
  const fullPath = path.resolve(dbPath);
  const db = new Database(fullPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
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
      ended_at DATETIME,
      duration_minutes INTEGER,
      growth_at_trigger REAL,
      decision_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Weather data cache (avoids hammering HA API)
    CREATE TABLE IF NOT EXISTS weather_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      data TEXT NOT NULL,
      ttl_minutes INTEGER DEFAULT 30,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Algorithm execution log
    CREATE TABLE IF NOT EXISTS algorithm_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_time DATETIME NOT NULL,
      growth_estimate REAL,
      rain_delay_hours REAL,
      decision TEXT NOT NULL,
      decision_reason TEXT,
      next_run_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Growth history over time (for charting)
    CREATE TABLE IF NOT EXISTS growth_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME NOT NULL,
      growth_mm REAL NOT NULL,
      since_last_mow BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Rain delay predictions over time (for charting)
    CREATE TABLE IF NOT EXISTS rain_delay_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME NOT NULL,
      earliest_safe_time DATETIME,
      optimal_time DATETIME,
      confidence REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Persistent soil moisture state (single row, upserted each run)
    CREATE TABLE IF NOT EXISTS soil_moisture_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      estimated_pct REAL NOT NULL,
      last_rain_total_mm REAL NOT NULL DEFAULT 0,
      last_rain_timestamp TEXT,
      last_updated_at TEXT NOT NULL
    );
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_weather_cache_entity_timestamp
      ON weather_cache(metric, timestamp);
    CREATE INDEX IF NOT EXISTS idx_algorithm_runs_time
      ON algorithm_runs(run_time);
    CREATE INDEX IF NOT EXISTS idx_growth_history_timestamp
      ON growth_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_mow_events_started
      ON mow_events(started_at);
  `);

  return db;
}
