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
  // NEW: timestamp of the earliest weather data processed, to prevent double-counting rain
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
   * Update soil moisture estimate using persisted state + current weather data.
   * Returns the current estimated soil moisture percentage.
   *
   * Key design: only processes rain that falls AFTER the last weather window we processed.
   * This prevents double-counting rain across repeated algorithm runs with overlapping data.
   */
  public update(hourlyWeather: HourlyWeather[]): number {
    const state = this.loadState();
    const fc = this.fieldCapacity();
    const tau = this.dryingTimeConstant();
    const thetaRes = fc * 0.5;
    const now = new Date();

    // Determine the time window of the weather data
    const sorted = [...hourlyWeather].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const weatherStart = sorted.length > 0 ? sorted[0].timestamp : now;
    const weatherEnd = sorted.length > 0 ? sorted[sorted.length - 1].timestamp : now;

    // Check for stale/corrupted state:
    // 1. If below wilting point (~12% for loam): old dry-baseline bug
    // 2. If above FC + 10% (>50% for loam): impossible, must be from the rain leak bug
    // 3. If last_rain_total_mm is impossibly high: accumulated double-counted rain
    const wiltingPoint = this.wiltingPoint();
    const isStale = state && state.last_weather_start && (
      state.estimated_pct < wiltingPoint ||
      state.estimated_pct > fc + 10 ||
      state.last_rain_total_mm > 100 // more than 100mm of rain in history is clearly wrong
    );

    if (!state || !state.last_weather_start || isStale) {
      // First run or corrupted state — backfill from historical weather data
      logger.info(
        { weather_start: weatherStart.toISOString(), stale: isStale, old_pct: state?.estimated_pct },
        isStale
          ? 'Stale/corrupted soil moisture state detected — backfilling'
          : 'No valid soil moisture state — backfilling from historical data',
      );
      return this.backfill(sorted, fc, tau, thetaRes, now, weatherStart);
    }

    // Decay forward from last update to now
    const hoursElapsed = (now.getTime() - new Date(state.last_updated_at).getTime()) / 3600000;
    const sunFactor = this.sunDryingFactor(sorted, new Date(state.last_updated_at));
    const tempFactor = this.tempDryingFactor(sorted, new Date(state.last_updated_at));
    const weatherModifier = Math.max(0.5, 1 - (sunFactor + tempFactor) * 0.2);
    const effectiveTau = tau * weatherModifier;

    // Exponential decay toward thetaRes (residual moisture / dry baseline)
    let moisture = thetaRes + (state.estimated_pct - thetaRes) * Math.exp(-hoursElapsed / effectiveTau);

    // Only count rain that falls AFTER the last weather window we already processed.
    // This prevents double-counting when the same weather data overlaps across runs.
    const lastWeatherStart = new Date(state.last_weather_start);
    const newRainMm = this.rainAfter(sorted, lastWeatherStart);

    if (newRainMm > 0) {
      // Infiltration: each mm of rain raises soil moisture by ~0.5 pct points
      moisture += newRainMm * 0.5;

      // Find the latest rain timestamp for tracking
      const latestRainTs = this.latestRainTimestampAfter(sorted, lastWeatherStart);
      this.saveState({
        estimated_pct: this.clampMoisture(moisture, fc),
        last_rain_total_mm: state.last_rain_total_mm + newRainMm,
        last_rain_timestamp: latestRainTs,
        last_updated_at: now.toISOString(),
        last_weather_start: weatherEnd.toISOString(),
      });
    } else {
      // CRITICAL: always advance last_weather_start even when no new rain.
      // If we don't, the same rain data gets re-processed every algorithm run.
      this.saveState({
        estimated_pct: this.clampMoisture(moisture, fc),
        last_rain_total_mm: state.last_rain_total_mm,
        last_rain_timestamp: state.last_rain_timestamp,
        last_updated_at: now.toISOString(),
        last_weather_start: weatherEnd.toISOString(),
      });
    }

    return this.clampMoisture(moisture, fc);
  }

  /**
   * Backfill: simulate soil moisture from historical weather data to seed initial state.
   * Walks through all hourly data, applying rain and decay from a RESIDUAL baseline
   * (assumes soil was dry before our data window started).
   */
  private backfill(
    sorted: HourlyWeather[],
    fc: number,
    tau: number,
    thetaRes: number,
    now: Date,
    weatherStart: Date,
  ): number {
    if (sorted.length === 0) {
      // No data — seed at field capacity (realistic default for maintained lawn)
      const state: SoilMoistureState = {
        estimated_pct: fc,
        last_rain_total_mm: 0,
        last_rain_timestamp: null,
        last_updated_at: now.toISOString(),
        last_weather_start: weatherStart.toISOString(),
      };
      this.saveState(state);
      return fc;
    }

    // Start from a realistic level — 85% of FC.
    // A maintained spring lawn sits between 75-90% of FC under normal conditions.
    // This avoids two problems:
    // 1. Starting from residual (20%): growth model underestimates for weeks until rain accumulates
    // 2. Starting from FC (40%): rain delay model falsely blocks mowing after any rain event
    let moisture = fc * 0.85;
    let totalRain = 0;
    let lastRainTs: string | null = null;
    const dt = 1; // 1-hour steps

    for (let i = 0; i < sorted.length; i++) {
      const hour = sorted[i];

      // Decay for 1 hour
      moisture = thetaRes + (moisture - thetaRes) * Math.exp(-dt / tau);

      // Add rain for this hour
      if (hour.rainfall_mm > 0.1) {
        moisture += hour.rainfall_mm * 0.5;
        totalRain += hour.rainfall_mm;
        lastRainTs = hour.timestamp.toISOString();
      }

      moisture = this.clampMoisture(moisture, fc);
    }

    // Decay from last data point to now
    const hoursToNow = (now.getTime() - sorted[sorted.length - 1].timestamp.getTime()) / 3600000;
    if (hoursToNow > 0) {
      moisture = thetaRes + (moisture - thetaRes) * Math.exp(-hoursToNow / tau);
    }

    const state: SoilMoistureState = {
      estimated_pct: this.clampMoisture(moisture, fc),
      last_rain_total_mm: totalRain,
      last_rain_timestamp: lastRainTs,
      last_updated_at: now.toISOString(),
      last_weather_start: weatherStart.toISOString(),
    };
    this.saveState(state);

    logger.info(
      { estimated_pct: moisture.toFixed(1), total_rain_mm: totalRain.toFixed(1) },
      'Soil moisture backfill complete',
    );

    return this.clampMoisture(moisture, fc);
  }

  /**
   * Sum rainfall that occurred AFTER the given timestamp.
   * Strictly greater-than comparison to prevent double-counting.
   */
  private rainAfter(hourlyWeather: HourlyWeather[], afterTimestamp: Date): number {
    let total = 0;
    for (const h of hourlyWeather) {
      if (h.timestamp > afterTimestamp && h.rainfall_mm > 0.1) {
        total += h.rainfall_mm;
      }
    }
    return total;
  }

  /**
   * Find the latest rain timestamp after the given timestamp.
   */
  private latestRainTimestampAfter(
    hourlyWeather: HourlyWeather[],
    afterTimestamp: Date,
  ): string {
    let latest: Date | null = null;
    for (const h of hourlyWeather) {
      if (h.timestamp > afterTimestamp && h.rainfall_mm > 0.1) {
        if (latest === null || h.timestamp > latest) {
          latest = h.timestamp;
        }
      }
    }
    return latest?.toISOString() ?? new Date().toISOString();
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
    return Math.max(5, Math.min(fc + 20, moisture));
  }
}
