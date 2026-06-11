import pino from 'pino';
import Database from 'better-sqlite3';
import { AppConfig } from '../config/schema';
import { HourlyWeather } from '../weather/service';

const logger = pino({ level: 'info' });

export interface SoilMoistureState {
  estimated_pct: number;
  last_rain_total_mm: number;
  last_rain_timestamp: string | null;
  last_updated_at: string;
  // NEW: timestamp up to which weather data has been processed for rain.
  // Used to prevent double-counting rain across repeated algorithm runs.
  last_weather_start: string;
}

export class SoilMoistureTracker {
  private db: Database.Database;
  private config: AppConfig;

  constructor(db: Database.Database, config: AppConfig) {
    this.db = db;
    this.config = config;
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
  }

  /**
   * Load persisted soil moisture state. Returns null on first run.
   */
  public loadState(): SoilMoistureState | null {
    const row = this.db.prepare(
      'SELECT estimated_pct, last_rain_total_mm, last_rain_timestamp, last_updated_at, COALESCE(last_weather_start, \'\') as last_weather_start FROM soil_moisture_state WHERE id = 1'
    ).get() as (SoilMoistureState & { last_weather_start: string }) | undefined;

    if (!row) return null;
    return row as SoilMoistureState;
  }

  /**
   * Save soil moisture state (upsert single row).
   */
  public saveState(state: SoilMoistureState): void {
    this.db.prepare(`
      INSERT INTO soil_moisture_state (id, estimated_pct, last_rain_total_mm, last_rain_timestamp, last_updated_at, last_weather_start)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        estimated_pct = excluded.estimated_pct,
        last_rain_total_mm = excluded.last_rain_total_mm,
        last_rain_timestamp = excluded.last_rain_timestamp,
        last_updated_at = excluded.last_updated_at,
        last_weather_start = excluded.last_weather_start
    `).run(
      state.estimated_pct,
      state.last_rain_total_mm,
      state.last_rain_timestamp,
      state.last_updated_at,
      state.last_weather_start,
    );
  }

  /**
   * Update soil moisture estimate using current weather data.
   * Returns the current estimated soil moisture percentage.
   *
   * Design: compute from scratch on each call using the full weather window.
   * This avoids double-counting rain when the sliding window shifts.
   * Starts from a baseline (85% of field capacity), applies decay for the
   * full window period, then adds infiltration from all rain in the window.
   */
  public update(hourlyWeather: HourlyWeather[]): number {
    const fc = this.fieldCapacity();
    const tau = this.dryingTimeConstant();
    const thetaRes = fc * 0.5;
    const now = new Date();

    // Determine the time window of the weather data
    const sorted = [...hourlyWeather].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Compute from scratch: baseline + decay + rain infiltration
    let moisture = fc * 0.85; // Start from realistic baseline (85% FC)
    let totalRain = 0;
    let lastRainTs: string | null = null;
    const dt = 1; // 1-hour steps

    for (const hour of sorted) {
      // Decay for 1 hour
      moisture = thetaRes + (moisture - thetaRes) * Math.exp(-dt / tau);

      // Add rain for this hour
      if (hour.rainfall_mm > 0) {
        moisture += hour.rainfall_mm * 0.5;
        totalRain += hour.rainfall_mm;
        lastRainTs = hour.timestamp.toISOString();
      }

      moisture = this.clampMoisture(moisture, fc);
    }

    // Decay from last data point to now
    if (sorted.length > 0) {
      const hoursToNow = (now.getTime() - sorted[sorted.length - 1].timestamp.getTime()) / 3600000;
      if (hoursToNow > 0) {
        moisture = thetaRes + (moisture - thetaRes) * Math.exp(-hoursToNow / tau);
      }
    }

    // Persist state for external consumers (rain delay, etc.)
    this.saveState({
      estimated_pct: this.clampMoisture(moisture, fc),
      last_rain_total_mm: totalRain,
      last_rain_timestamp: lastRainTs,
      last_updated_at: now.toISOString(),
      last_weather_start: now.toISOString(),
    });

    return this.clampMoisture(moisture, fc);
  }

  /**
   * Compute soil moisture at a specific historical timestamp.
   * Walks weather data from the start up to (and including) the given timestamp,
   * applying decay + rain infiltration. Used by the growth model to compute
   * per-hour moisture factors instead of using a single snapshot.
   */
  public computeMoistureAt(hourlyWeather: HourlyWeather[], atTimestamp: Date): number {
    const fc = this.fieldCapacity();
    const tau = this.dryingTimeConstant();
    const thetaRes = fc * 0.5;
    const dt = 1; // 1-hour steps

    const sorted = [...hourlyWeather].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    let moisture = fc * 0.85; // Start from realistic baseline (85% FC)

    for (const hour of sorted) {
      if (hour.timestamp > atTimestamp) break;

      // Decay for 1 hour
      moisture = thetaRes + (moisture - thetaRes) * Math.exp(-dt / tau);

      // Add rain for this hour
      if (hour.rainfall_mm > 0) {
        moisture += hour.rainfall_mm * 0.5;
      }

      moisture = this.clampMoisture(moisture, fc);
    }

    return moisture;
  }

  private fieldCapacity(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 20;
      case 'loam': return 40;
      case 'clay': return 50;
      default: return 40;
    }
  }

  private wiltingPoint(): number {
    // Permanent wilting point by soil type (USGA data)
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 5;
      case 'loam': return 12;
      case 'clay': return 20;
      default: return 12;
    }
  }

  private dryingTimeConstant(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 24;
      case 'loam': return 72;
      case 'clay': return 168;
      default: return 72;
    }
  }

  private sunDryingFactor(
    hourlyWeather: HourlyWeather[],
    sinceTimestamp: Date,
  ): number {
    const { rainDelayModel } = this.config;
    let totalSunHours = 0;
    for (const hour of hourlyWeather) {
      if (hour.timestamp >= sinceTimestamp) {
        totalSunHours += hour.sunshine_hours;
      }
    }
    return Math.min(0.6, totalSunHours * rainDelayModel.sunDryingRate);
  }

  private tempDryingFactor(
    hourlyWeather: HourlyWeather[],
    sinceTimestamp: Date,
  ): number {
    const { rainDelayModel } = this.config;
    let warmHours = 0;
    for (const hour of hourlyWeather) {
      if (hour.timestamp >= sinceTimestamp) {
        if (hour.temperature_c > 15) {
          warmHours += (hour.temperature_c - 15) * rainDelayModel.tempDryingFactor;
        }
      }
    }
    return Math.min(0.4, warmHours);
  }

  private clampMoisture(moisture: number, fc: number): number {
    // Floor at wilting point - soil cannot physically release water below this
    const wp = this.wiltingPoint();
    return Math.max(wp, Math.min(fc + 20, moisture));
  }
}
