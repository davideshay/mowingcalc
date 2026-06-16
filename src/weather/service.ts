import pino from 'pino';
import Database from 'better-sqlite3';
import { HAClient, AggregatedWeatherData } from '../ha/client';
import { AppConfig, getSensorEntityId } from '../config/schema';

const logger = pino({ level: 'info' });

// Raw weather reading from HA
export interface WeatherReading {
  timestamp: string;
  rainfall_mm?: number;
  temperature_c?: number;
  sunshine_hours?: number;
}

// Processed weather data for algorithms (hourly buckets)
export interface HourlyWeather {
  timestamp: Date;
  rainfall_mm: number;
  temperature_c: number;
  sunshine_hours: number;
}

// Weather summary for the past N hours
export interface WeatherSummary {
  period_hours: number;
  total_rainfall_mm: number;
  avg_temperature_c: number;
  total_sunshine_hours: number;
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

    // Fetch all metrics in parallel (rainfall, temperature, sunshine sources)
    const sunshineSources = entityGroups.sunshineSources || [];
    const sunshineEntityIds = sunshineSources
      .filter((s: any) => s.type === 'sunshine')
      .map((s: any) => s.entity_id);
    const uvEntityIds = sunshineSources
      .filter((s: any) => s.type === 'uv_index')
      .map((s: any) => s.entity_id);

    // Fetch all metrics in parallel (rainfall, temperature, sunshine sources)
    const rainfallEntityIds: string[] = entityGroups.rainfallSensors.map((s) => getSensorEntityId(s)).filter(Boolean);
    const tempEntityIds: string[] = entityGroups.temperatureSensors.map((s) => getSensorEntityId(s)).filter(Boolean);
    const [rainData, tempData, sunData, uvData] = await Promise.all([
      this.fetchMetricWithCache('rainfall', rainfallEntityIds, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('temperature', tempEntityIds, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('sunshine', sunshineEntityIds, startTime, now, weatherCacheTTL),
      this.fetchMetricWithCache('uv_index', uvEntityIds, startTime, now, weatherCacheTTL),
    ]);

    // Merge into hourly buckets
    const hourly = this.mergeIntoHourly(rainData, tempData, sunData, uvData, startTime, now, hours);

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
      let data = await this.ha.getAggregatedHistoricalData(
        entityIds, startTime, endTime, 3600000,
        metric as 'rainfall' | 'temperature' | 'sunshine' | 'uv_index',
      );
      // Convert Fahrenheit to Celsius if configured
      if (metric === 'temperature' && this.config.entityGroups.temperatureUnit === 'fahrenheit') {
        data = data.map((d) => ({
          ...d,
          temperature_c: d.temperature_c != null ? (d.temperature_c - 32) * 5 / 9 : undefined,
        }));
      }
      // NOTE: rainfall unit conversion is handled in HAClient (getAggregatedStatisticsData line 329).
      // The HA client converts in/hr -> mm automatically. Do NOT double-convert here.
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
   * Validates: metric, TTL, entity IDs match, and time window is close enough.
   * Time window tolerance: cache entry is valid if its start/end covers our request.
   */
  private getFromCache(
    metric: string,
    startTime: Date,
    endTime: Date,
    ttlMinutes: number,
  ): AggregatedWeatherData[] | null {
    // Build current entity ID string for this metric
    const entityId = this.getEntityIdForMetric(metric);

    const rows = (this.db.prepare(`
      SELECT data, entity_id, timestamp, ttl_minutes FROM weather_cache
      WHERE metric = ?
    `).get(
      metric,
    ) as { data: string; entity_id: string; timestamp: string; ttl_minutes: number } | undefined);

    if (!rows) return null;

    // Check TTL — cached entry is valid only if it was stored recently enough
    const cachedTs = new Date(rows.timestamp).getTime();
    const ttlMs = rows.ttl_minutes * 60 * 1000;
    if (Date.now() - cachedTs > ttlMs) return null;

    // Validate entity IDs match (prevents stale data after config change)
    if (rows.entity_id !== entityId) return null;

    // Validate time window covers our request
    const cachedEnd = cachedTs + ttlMs;
    if (cachedTs <= startTime.getTime() && cachedEnd >= endTime.getTime()) {
      try {
        return JSON.parse(rows.data) as AggregatedWeatherData[];
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Resolve entity ID string for a given metric, matching saveToCache logic.
   */
  private getEntityIdForMetric(metric: string): string {
    const entityIds = this.config.entityGroups;
    switch (metric) {
      case 'rainfall': return entityIds.rainfallSensors.map((s) => getSensorEntityId(s)).join(',');
      case 'temperature': return entityIds.temperatureSensors.map((s) => getSensorEntityId(s)).join(',');
      case 'sunshine': return (entityIds.sunshineSources || [])
        .filter((s: any) => s.type === 'sunshine')
        .map((s: any) => s.entity_id)
        .join(',');
      case 'uv_index': return (entityIds.sunshineSources || [])
        .filter((s: any) => s.type === 'uv_index')
        .map((s: any) => s.entity_id)
        .join(',');
      default: return '';
    }
  }

  /**
   * Save weather data to cache.
   * Stores both start and end timestamps for precise window matching on retrieval.
   */
  private saveToCache(
    metric: string,
    startTime: Date,
    endTime: Date,
    data: AggregatedWeatherData[],
  ): void {
    const stmt = this.db.prepare(`
      REPLACE INTO weather_cache (metric, entity_id, timestamp, data, ttl_minutes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const entityId = this.getEntityIdForMetric(metric);

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
   * UV index data is converted to sunshine hours (UV > 0.5 -> 1h sun).
   */
  private mergeIntoHourly(
    rainData: AggregatedWeatherData[],
    tempData: AggregatedWeatherData[],
    sunData: AggregatedWeatherData[],
    uvData: AggregatedWeatherData[],
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
          // Read from the correct source field: rainfall_mm for rain, temperature_c for others
          const sourceValue = field === 'rainfall_mm'
            ? point.rainfall_mm
            : point.temperature_c;
          // @ts-ignore - dynamic field access
          buckets[nearest][field] = sourceValue || 0;
        }
      }
    };

    fillBucket(rainData, 'rainfall_mm');
    fillBucket(tempData, 'temperature_c');
    fillBucket(sunData, 'sunshine_hours');

    // If no direct sunshine sensors, use UV index as proxy (UV > 0.5 -> 1h sunshine)
    if (sunData.length === 0 && uvData.length > 0) {
      for (const point of uvData) {
        const ts = new Date(point.timestamp).getTime();
        let nearest = null;
        let minDiff = Infinity;
        for (const key of Object.keys(buckets)) {
          const diff = Math.abs(Number(key) - ts);
          if (diff < minDiff) {
            minDiff = diff;
            nearest = Number(key);
          }
        }
        if (nearest !== null && minDiff < 1800000) {
          const uv = point.temperature_c || 0; // reusing temperature_c field from HA response
          buckets[nearest].sunshine_hours = uv > 0.5 ? 1 : 0;
        }
      }
    }

    return Object.values(buckets).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Compute summary statistics from hourly data.
   * Excludes uninitialized zero-filled buckets from averages.
   */
  private computeSummary(hourly: HourlyWeather[], periodHours: number): WeatherSummary {
    const totalRainfall = hourly.reduce((sum, h) => sum + h.rainfall_mm, 0);

    // Only average temperatures from buckets with real data (not blank zero-fill)
    const hasRealData = (h: HourlyWeather) =>
      h.temperature_c > 0 || h.temperature_c < -1 || h.rainfall_mm > 0 || h.sunshine_hours > 0;
    const validTemps = hourly.filter(hasRealData);
    const avgTemp = validTemps.length > 0
      ? validTemps.reduce((sum, h) => sum + h.temperature_c, 0) / validTemps.length
      : 0;

    const totalSunshine = hourly.reduce((sum, h) => sum + h.sunshine_hours, 0);

    // Find last measurable rain event
    let lastRainTs: string | null = null;
    let lastRainMm = 0;
    let inRainEvent = false;
    for (let i = hourly.length - 1; i >= 0; i--) {
      if (hourly[i].rainfall_mm > 0) {
        if (!inRainEvent) {
          inRainEvent = true;
          lastRainMm = 0;
        }
        lastRainMm += hourly[i].rainfall_mm;
        if (lastRainTs === null || hourly[i].timestamp > new Date(lastRainTs)) {
          lastRainTs = hourly[i].timestamp.toISOString();
        }
      } else {
        if (inRainEvent) break;
        inRainEvent = false;
      }
    }

    return {
      period_hours: periodHours,
      total_rainfall_mm: Math.round(totalRainfall * 100) / 100,
      avg_temperature_c: Math.round(avgTemp * 100) / 100,
      total_sunshine_hours: Math.round(totalSunshine * 100) / 100,
      last_rain_timestamp: lastRainTs,
      last_rain_mm: Math.round(lastRainMm * 100) / 100,
      hourly,
    };
  }
}
