import pino from 'pino';
import Database from 'better-sqlite3';
import { HAClient, AggregatedWeatherData } from '../ha/client';
import { AppConfig } from '../config/schema';

const logger = pino({ level: 'info' });

// Raw weather reading from HA
export interface WeatherReading {
  timestamp: string;
  rainfall_mm?: number;
  temperature_c?: number;
  sunshine_hours?: number;
  humidity_pct?: number;
  wind_speed_kmh?: number;
}

// Processed weather data for algorithms (hourly buckets)
export interface HourlyWeather {
  timestamp: Date;
  rainfall_mm: number;
  temperature_c: number;
  sunshine_hours: number;
  humidity_pct: number;
  wind_speed_kmh: number;
}

// Weather summary for the past N hours
export interface WeatherSummary {
  period_hours: number;
  total_rainfall_mm: number;
  avg_temperature_c: number;
  total_sunshine_hours: number;
  avg_humidity_pct: number;
  avg_wind_speed_kmh: number;
  last_rain_timestamp: string | null;
  last_rain_mm: number;
  hourly: HourlyWeather[];
}

export class WeatherService {
  private ha: HAClient;
  private db: Database.Database;
  private config: AppConfig;

  constructor(ha: HAClient, db: Database.Database, config: AppConfig) {
    this.ha = ha;
    this.db = db;
    this.config = config;
  }

  // Update config reference (called when config changes)
  public updateConfig(config: AppConfig): void {
    this.config = config;
  }

  /**
   * Get historical weather data for the past N hours with caching.
   * Pulls from multiple sensors per metric, aggregates by median.
   */
  public async getHistoricalWeather(hours: number = 168): Promise<WeatherSummary> {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 3600000);
    const { entityGroups, weatherCacheTTL } = this.config;

    // Fetch all metrics in parallel
    const [rainData, tempData, sunData, humidityData, windData] = await Promise.all([
      this.fetchMetricWithCache('rainfall', entityGroups.rainfallSensors, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('temperature', entityGroups.temperatureSensors, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('sunshine', entityGroups.sunshineSensors, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('humidity', entityGroups.humiditySensors, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('wind_speed', entityGroups.windSpeedSensors, startTime, now, weatherCacheTTL),
    ]);

    // Merge into hourly buckets
    const hourly = this.mergeIntoHourly(rainData, tempData, sunData, humidityData, windData, startTime, now, hours);

    // Compute summary
    return this.computeSummary(hourly, hours);
  }

  /**
   * Fetch a single weather metric from HA, using cache if available.
   */
  private async fetchMetricWithCache(
    metric: string,
    entityIds: string[],
    startTime: Date,
    endTime: Date,
    ttlMinutes: number,
  ): Promise<AggregatedWeatherData[]> {
    if (entityIds.length === 0) {
      logger.debug({ metric }, 'No sensors configured');
      return [];
    }

    // Check cache first
    const cached = this.getFromCache(metric, startTime, endTime, ttlMinutes);
    if (cached) {
      return cached;
    }

    // Fetch from HA
    logger.info({ metric, entities: entityIds }, 'Fetching weather data from HA');
    try {
      const data = await this.ha.getAggregatedHistoricalData(entityIds, startTime, endTime);
      // Store in cache
      this.saveToCache(metric, startTime, endTime, data);
      return data;
    } catch (err) {
      logger.warn({ metric, err }, 'Failed to fetch weather data from HA');
      return [];
    }
  }

  /**
   * Get cached weather data if still valid.
   */
  private getFromCache(
    metric: string,
    startTime: Date,
    endTime: Date,
    ttlMinutes: number,
  ): AggregatedWeatherData[] | null {
    const cached = (this.db.prepare(`
      SELECT data FROM weather_cache
      WHERE metric = ?
        AND timestamp >= ?
        AND timestamp <= ?
        AND created_at > datetime('now', '-' || ? || ' minutes')
      ORDER BY created_at DESC
      LIMIT 1
    `).all(
      metric,
      startTime.toISOString(),
      endTime.toISOString(),
      ttlMinutes,
    ) as Array<{ data: string }>);

    if (cached.length === 0) return null;

    try {
      return JSON.parse(cached[0].data) as AggregatedWeatherData[];
    } catch {
      return null;
    }
  }

  /**
   * Save weather data to cache.
   */
  private saveToCache(
    metric: string,
    startTime: Date,
    endTime: Date,
    data: AggregatedWeatherData[],
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO weather_cache (metric, entity_id, timestamp, data, ttl_minutes)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Store entity IDs as a JSON array for reference
    const entityIds = this.config.entityGroups;
    let entityId = '';
    switch (metric) {
      case 'rainfall': entityId = entityIds.rainfallSensors.join(','); break;
      case 'temperature': entityId = entityIds.temperatureSensors.join(','); break;
      case 'sunshine': entityId = entityIds.sunshineSensors.join(','); break;
      case 'humidity': entityId = entityIds.humiditySensors.join(','); break;
      case 'wind_speed': entityId = entityIds.windSpeedSensors.join(','); break;
    }

    stmt.run(
      metric,
      entityId,
      startTime.toISOString(),
      JSON.stringify(data),
      this.config.weatherCacheTTL,
    );
  }

  /**
   * Merge multiple metric arrays into unified hourly buckets.
   */
  private mergeIntoHourly(
    rainData: AggregatedWeatherData[],
    tempData: AggregatedWeatherData[],
    sunData: AggregatedWeatherData[],
    humidityData: AggregatedWeatherData[],
    windData: AggregatedWeatherData[],
    startTime: Date,
    endTime: Date,
    hours: number,
  ): HourlyWeather[] {
    // Create hourly buckets
    const buckets: Record<number, HourlyWeather> = {};
    for (let i = 0; i < hours; i++) {
      const ts = new Date(startTime.getTime() + i * 3600000);
      buckets[ts.getTime()] = {
        timestamp: ts,
        rainfall_mm: 0,
        temperature_c: 0,
        sunshine_hours: 0,
        humidity_pct: 0,
        wind_speed_kmh: 0,
      };
    }

    // Fill from data (each metric array has median values per hour)
    const fillBucket = (data: AggregatedWeatherData[], field: keyof HourlyWeather) => {
      for (const point of data) {
        const ts = new Date(point.timestamp).getTime();
        // Find nearest bucket
        let nearest = null;
        let minDiff = Infinity;
        for (const key of Object.keys(buckets)) {
          const diff = Math.abs(Number(key) - ts);
          if (diff < minDiff) {
            minDiff = diff;
            nearest = Number(key);
          }
        }
        if (nearest !== null && minDiff < 1800000) { // within 30 min
          // @ts-ignore - dynamic field access
          buckets[nearest][field] = point.temperature_c || 0;
        }
      }
    };

    fillBucket(rainData, 'rainfall_mm');
    fillBucket(tempData, 'temperature_c');
    fillBucket(sunData, 'sunshine_hours');
    fillBucket(humidityData, 'humidity_pct');
    fillBucket(windData, 'wind_speed_kmh');

    return Object.values(buckets).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Compute summary statistics from hourly data.
   */
  private computeSummary(hourly: HourlyWeather[], periodHours: number): WeatherSummary {
    const totalRainfall = hourly.reduce((sum, h) => sum + h.rainfall_mm, 0);
    const avgTemp = hourly.length > 0 ? hourly.reduce((sum, h) => sum + h.temperature_c, 0) / hourly.length : 0;
    const totalSunshine = hourly.reduce((sum, h) => sum + h.sunshine_hours, 0);
    const avgHumidity = hourly.length > 0 ? hourly.reduce((sum, h) => sum + h.humidity_pct, 0) / hourly.length : 0;
    const avgWind = hourly.length > 0 ? hourly.reduce((sum, h) => sum + h.wind_speed_kmh, 0) / hourly.length : 0;

    // Find last significant rain event (>0.5mm)
    let lastRainTs: string | null = null;
    let lastRainMm = 0;
    for (let i = hourly.length - 1; i >= 0; i--) {
      if (hourly[i].rainfall_mm > 0.5) {
        lastRainTs = hourly[i].timestamp.toISOString();
        lastRainMm = hourly[i].rainfall_mm;
        break;
      }
    }

    return {
      period_hours: periodHours,
      total_rainfall_mm: Math.round(totalRainfall * 100) / 100,
      avg_temperature_c: Math.round(avgTemp * 100) / 100,
      total_sunshine_hours: Math.round(totalSunshine * 100) / 100,
      avg_humidity_pct: Math.round(avgHumidity * 100) / 100,
      avg_wind_speed_kmh: Math.round(avgWind * 100) / 100,
      last_rain_timestamp: lastRainTs,
      last_rain_mm: Math.round(lastRainMm * 100) / 100,
      hourly,
    };
  }
}
