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
      'SELECT estimated_pct, last_rain_total_mm, last_rain_timestamp, last_updated_at FROM soil_moisture_state WHERE id = 1'
    ).get() as SoilMoistureState | undefined;

    if (!row) return null;
    return row;
  }

  /**
   * Save soil moisture state (upsert single row).
   */
  public saveState(state: SoilMoistureState): void {
    this.db.prepare(`
      INSERT INTO soil_moisture_state (id, estimated_pct, last_rain_total_mm, last_rain_timestamp, last_updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        estimated_pct = excluded.estimated_pct,
        last_rain_total_mm = excluded.last_rain_total_mm,
        last_rain_timestamp = excluded.last_rain_timestamp,
        last_updated_at = excluded.last_updated_at
    `).run(
      state.estimated_pct,
      state.last_rain_total_mm,
      state.last_rain_timestamp,
      state.last_updated_at,
    );
  }

  /**
   * Update soil moisture estimate using persisted state + current weather data.
   * Returns the current estimated soil moisture percentage.
   */
  public update(hourlyWeather: HourlyWeather[]): number {
    const state = this.loadState();
    const fc = this.fieldCapacity();
    const tau = this.dryingTimeConstant();
    const thetaRes = fc * 0.5;
    const now = new Date();

    if (!state) {
      // First run — backfill from historical weather data
      logger.info('No soil moisture state found — backfilling from historical data');
      return this.backfill(hourlyWeather, fc, tau, thetaRes, now);
    }

    // Decay forward from last update to now
    const hoursElapsed = (now.getTime() - new Date(state.last_updated_at).getTime()) / 3600000;
    const sunFactor = this.sunDryingFactor(hourlyWeather, new Date(state.last_updated_at));
    const tempFactor = this.tempDryingFactor(hourlyWeather, new Date(state.last_updated_at));
    const weatherModifier = Math.max(0.5, 1 - (sunFactor + tempFactor) * 0.2);
    const effectiveTau = tau * weatherModifier;

    // Exponential decay toward thetaRes (residual moisture / dry baseline)
    let moisture = thetaRes + (state.estimated_pct - thetaRes) * Math.exp(-hoursElapsed / effectiveTau);

    // Add new rainfall since last update
    const newRainMm = this.newRainSince(hourlyWeather, state.last_rain_timestamp);
    if (newRainMm > 0) {
      // Infiltration: each mm of rain raises soil moisture by ~0.5 pct points
      moisture += newRainMm * 0.5;

      // Find the latest rain timestamp for tracking
      const latestRainTs = this.latestRainTimestamp(hourlyWeather, state.last_rain_timestamp);
      this.saveState({
        estimated_pct: this.clampMoisture(moisture, fc),
        last_rain_total_mm: state.last_rain_total_mm + newRainMm,
        last_rain_timestamp: latestRainTs,
        last_updated_at: now.toISOString(),
      });
    } else {
      this.saveState({
        estimated_pct: this.clampMoisture(moisture, fc),
        last_rain_total_mm: state.last_rain_total_mm,
        last_rain_timestamp: state.last_rain_timestamp,
        last_updated_at: now.toISOString(),
      });
    }

    return this.clampMoisture(moisture, fc);
  }

  /**
   * Backfill: simulate soil moisture from historical weather data to seed initial state.
   * Walks through all hourly data, applying rain and decay from a dry baseline.
   */
  private backfill(
    hourlyWeather: HourlyWeather[],
    fc: number,
    tau: number,
    thetaRes: number,
    now: Date,
  ): number {
    // Sort chronologically
    const sorted = [...hourlyWeather].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    if (sorted.length === 0) {
      // No data — seed at field capacity (conservative)
      const state: SoilMoistureState = {
        estimated_pct: fc,
        last_rain_total_mm: 0,
        last_rain_timestamp: null,
        last_updated_at: now.toISOString(),
      };
      this.saveState(state);
      return fc;
    }

    // Start from field capacity and simulate forward
    let moisture = fc;
    let totalRain = 0;
    let lastRainTs: string | null = null;
    const dt = 1; // 1-hour steps

    for (let i = 0; i < sorted.length; i++) {
      const hour = sorted[i];

      // Decay for 1 hour (use base tau — sun/temp effects are averaged over the period)
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
    };
    this.saveState(state);

    logger.info(
      { estimated_pct: moisture.toFixed(1), total_rain_mm: totalRain.toFixed(1) },
      'Soil moisture backfill complete',
    );

    return this.clampMoisture(moisture, fc);
  }

  /**
   * Sum rainfall that occurred AFTER the given timestamp (not yet accounted for).
   */
  private newRainSince(hourlyWeather: HourlyWeather[], sinceTimestamp: string | null): number {
    if (!sinceTimestamp) {
      // No previous rain — all rain is new
      return hourlyWeather.reduce((sum, h) => sum + (h.rainfall_mm > 0.1 ? h.rainfall_mm : 0), 0);
    }

    const since = new Date(sinceTimestamp);
    let total = 0;
    for (const h of hourlyWeather) {
      if (h.timestamp > since && h.rainfall_mm > 0.1) {
        total += h.rainfall_mm;
      }
    }
    return total;
  }

  /**
   * Find the latest rain timestamp after the given timestamp.
   */
  private latestRainTimestamp(
    hourlyWeather: HourlyWeather[],
    sinceTimestamp: string | null,
  ): string {
    let latest: Date | null = null;
    const since = sinceTimestamp ? new Date(sinceTimestamp) : null;

    for (const h of hourlyWeather) {
      if (h.rainfall_mm > 0.1) {
        if (since === null || h.timestamp > since) {
          if (latest === null || h.timestamp > latest) {
            latest = h.timestamp;
          }
        }
      }
    }

    // If no new rain, keep the old timestamp
    if (latest === null && sinceTimestamp) {
      return sinceTimestamp;
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
