import fetch from 'node-fetch';
import pino from 'pino';
import { HAWsConnection } from './ws-connection';

const logger = pino({ level: 'info' });

export interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HAForecast {
  condition: string;
  temperature: number;
  templow?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
  humidity?: number;
  datetime: string;
  is_daytime?: boolean;
}

export interface HAHistoricalData {
  state: string;
  last_changed: string;
  attributes: Record<string, unknown>;
}

export interface HAServiceCallResult {
  success: boolean;
  context_id: string;
}

// Aggregated weather data point (median across multiple sensors)
export interface AggregatedWeatherData {
  timestamp: string;
  rainfall_mm?: number;
  temperature_c?: number;
  sunshine_hours?: number;
  humidity_pct?: number;
  wind_speed_kmh?: number;
}

// Statistics API response types (periodic samples from /api/history/statistics)
export interface HAStatisticsMetadata {
  has_mean: boolean;
  has_sum: boolean;
  has_state: boolean;
  max: number | null;
  mean: number | null;
  min: number | null;
  period: string;
  state_class: string | null;
  unit_of_measurement: string | null;
}

export interface HAStatisticsData {
  metadata: HAStatisticsMetadata;
  start: string;
  sum: number | null;
  max: number | null;
  mean: number | null;
  min: number | null;
  state: number | null;
}

export class HAClient {
  private baseUrl: string;
  private token: string;
  private readonlyMode: boolean;
  private wsConnection: HAWsConnection | null = null;

  constructor(baseUrl: string, token: string, readonlyMode: boolean = false) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.readonlyMode = readonlyMode;
    this.wsConnection = new HAWsConnection(baseUrl, token);
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(endpoint: string, options: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        ...this.headers,
        ...(options.headers as Record<string, string>),
      },
      method: (options.method as string) || 'GET',
      body: options.body as string | undefined,
    });

    if (!response.ok) {
      throw new Error(`HA API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // Utility: calculate median of a number array
  static median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Utility: parse numeric state, return null if invalid
  static parseNumericState(state: string): number | null {
    const num = parseFloat(state);
    return isNaN(num) ? null : num;
  }

  // Get current state of an entity
  async getEntityState(entityId: string): Promise<HAEntityState> {
    return this.request<HAEntityState>(`/api/states/${entityId}`);
  }

  // Get states from multiple entities, return array of {entity_id, value}
  async getNumericStates(entityIds: string[]): Promise<Array<{ entity_id: string; value: number }>> {
    const results: Array<{ entity_id: string; value: number }> = [];
    const promises = entityIds.map(async (id) => {
      try {
        const state = await this.getEntityState(id);
        const value = HAClient.parseNumericState(state.state);
        if (value !== null) {
          results.push({ entity_id: id, value });
        }
      } catch {
        // Entity unavailable or invalid
      }
    });
    await Promise.all(promises);
    return results;
  }

  // Get median value across multiple entities
  async getMedianState(entityIds: string[]): Promise<number | null> {
    const readings = await this.getNumericStates(entityIds);
    if (readings.length === 0) return null;
    return HAClient.median(readings.map((r) => r.value));
  }

  // Get all historical data from multiple entities for a time range
  async getHistoricalData(entityIds: string[], startTime: Date, endTime: Date): Promise<Map<string, HAHistoricalData[]>> {
    const resultMap = new Map<string, HAHistoricalData[]>();

    const promises = entityIds.map(async (id) => {
      try {
        const data = await this.getHistory(id, startTime, endTime);
        resultMap.set(id, data);
      } catch {
        resultMap.set(id, []);
      }
    });

    await Promise.all(promises);
    return resultMap;
  }

  // Get historical data and aggregate by median at each timestamp
  // Uses the statistics API (periodic 5-minute samples) as primary source,
  // falling back to raw history API if statistics are unavailable.
  async getAggregatedHistoricalData(
    entityIds: string[],
    startTime: Date,
    endTime: Date,
    aggregationIntervalMs: number = 3600000, // default 1 hour
    metric: 'rainfall' | 'temperature' | 'sunshine' | 'uv_index' = 'temperature',
  ): Promise<AggregatedWeatherData[]> {
    // Try statistics API first (periodic samples, not just state changes)
    try {
      const result = await this.getAggregatedStatisticsData(
        entityIds,
        startTime,
        endTime,
        aggregationIntervalMs,
        metric,
      );
      if (result.length > 0) {
        return result;
      }
      logger.debug('Statistics API returned no data, falling back to raw history');
    } catch (err) {
      logger.debug({ err }, 'Statistics API unavailable, falling back to raw history');
    }

    // Fallback: raw history API (only state changes)
    // For rainfall rate sensors: integrate rate over time (area under curve)
    // For other sensors: median of sparse samples
    const allData = await this.getHistoricalData(entityIds, startTime, endTime);

    if (metric === 'rainfall') {
      // Integrate rate over time for each sensor, then bucket the results
      const rainfallBuckets = new Map<number, number[]>();
      allData.forEach((data, entityId) => {
        // Sort by timestamp
        const sorted = [...data].sort((a, b) =>
          new Date(a.last_changed).getTime() - new Date(b.last_changed).getTime(),
        );

        // Filter out non-numeric states
        const valid = sorted.filter((p) => {
          const v = HAClient.parseNumericState(p.state);
          return v !== null;
        });

        if (valid.length === 0) return;

        // Integrate: for each interval, accumulate rate * duration
        // Handle intervals that span bucket boundaries by splitting them
        for (let i = 0; i < valid.length - 1; i++) {
          const current = valid[i];
          const next = valid[i + 1];
          const rate = HAClient.parseNumericState(current.state) || 0;
          const intervalStart = new Date(current.last_changed).getTime();
          const intervalEnd = new Date(next.last_changed).getTime();

          if (intervalEnd <= intervalStart) continue;

          // Split interval at bucket boundaries
          let currentTime = intervalStart;

          while (currentTime < intervalEnd) {
            const currentBucket = Math.floor(currentTime / aggregationIntervalMs) * aggregationIntervalMs;
            const bucketEnd = currentBucket + aggregationIntervalMs;
            const segmentEnd = Math.min(intervalEnd, bucketEnd);
            const segmentDuration = (segmentEnd - currentTime) / 3600000;

            if (segmentDuration > 0) {
              const accumulated = rate * segmentDuration;
              if (!rainfallBuckets.has(currentBucket)) {
                rainfallBuckets.set(currentBucket, []);
              }
              rainfallBuckets.get(currentBucket)!.push(accumulated);
            }

            currentTime = segmentEnd;
          }
        }
      });

      // For each bucket, take median across sensors
      return this.buildRainfallResult(rainfallBuckets);
    }

    // For non-rainfall metrics: original median-based approach
    const timestampBuckets = new Map<number, number[]>();
    allData.forEach((data) => {
      for (const point of data) {
        const bucketTime = new Date(point.last_changed).getTime();
        const bucketKey = Math.floor(bucketTime / aggregationIntervalMs) * aggregationIntervalMs;
        const value = HAClient.parseNumericState(point.state);
        if (value !== null) {
          if (!timestampBuckets.has(bucketKey)) {
            timestampBuckets.set(bucketKey, []);
          }
          timestampBuckets.get(bucketKey)!.push(value);
        }
      }
    });

    return this.buildAggregatedResult(timestampBuckets, metric);
  }

  // Aggregate data using the statistics API (periodic samples)
  private async getAggregatedStatisticsData(
    entityIds: string[],
    startTime: Date,
    endTime: Date,
    aggregationIntervalMs: number,
    metric: string,
  ): Promise<AggregatedWeatherData[]> {
    const timestampBuckets = new Map<number, number[]>();
    let hasAnyData = false;

    // Fetch ALL entities concurrently over a single WebSocket connection
    const allStats = await this.getStatisticsBatch(entityIds, startTime, endTime);

    for (const [entityId, stats] of allStats) {
      if (!stats || stats.length === 0) continue;

      const stateClass = stats[0].metadata.state_class || '';
      const isRainfallRate = metric === 'rainfall';

      if (stateClass === 'total_increasing') {
        // Cumulative sensor (e.g., rainfall) - compute period deltas from sum
        for (let i = 1; i < stats.length; i++) {
          const prevSum = stats[i - 1].sum;
          const currSum = stats[i].sum;
          if (prevSum == null || currSum == null) continue;

          const delta = currSum - prevSum;
          const bucketTime = new Date(stats[i].start).getTime();
          const bucketKey = Math.floor(bucketTime / aggregationIntervalMs) * aggregationIntervalMs;

          if (!timestampBuckets.has(bucketKey)) {
            timestampBuckets.set(bucketKey, []);
          }
          timestampBuckets.get(bucketKey)!.push(delta);
          hasAnyData = true;
        }
      } else if (isRainfallRate) {
        // Rainfall rate sensor (measurement, e.g., sensor.aw_*_hourly_rain in in/hr)
        // Statistics API gives min/max per 5-min bucket.
        // Integrate: avg_rate * duration for each 5-min bucket, then sum within hourly buckets.
        const hourlyAccum = new Map<number, number[]>();
        for (const entry of stats) {
          const min = entry.min;
          const max = entry.max;
          if (min == null && max == null) continue;

          // Average rate over this 5-min bucket
          const avgRate = ((min ?? 0) + (max ?? 0)) / 2;
          // Duration: 5 minutes = 5/60 hours
          const durationHours = 5 / 60;
          // Accumulated rainfall in inches for this 5-min bucket
          const accumulated = avgRate * durationHours;
          // Convert to mm
          const accumulatedMm = accumulated * 25.4;

          const bucketTime = new Date(entry.start).getTime();
          const bucketKey = Math.floor(bucketTime / aggregationIntervalMs) * aggregationIntervalMs;

          // Sum within hourly bucket
          if (!hourlyAccum.has(bucketKey)) {
            hourlyAccum.set(bucketKey, []);
          }
          hourlyAccum.get(bucketKey)!.push(accumulatedMm);
          hasAnyData = true;
        }

        // Collapse 5-min accumulations into hourly totals per sensor, then add to cross-sensor buckets
        hourlyAccum.forEach((accumulations, hourlyBucket) => {
          const total = accumulations.reduce((a, b) => a + b, 0);
          if (!timestampBuckets.has(hourlyBucket)) {
            timestampBuckets.set(hourlyBucket, []);
          }
          timestampBuckets.get(hourlyBucket)!.push(total);
        });
      } else {
        // Other measurement state_class - use mean if available, otherwise state
        for (const entry of stats) {
          const value = entry.mean ?? entry.state;
          if (value == null) continue;

          const bucketTime = new Date(entry.start).getTime();
          const bucketKey = Math.floor(bucketTime / aggregationIntervalMs) * aggregationIntervalMs;

          if (!timestampBuckets.has(bucketKey)) {
            timestampBuckets.set(bucketKey, []);
          }
          timestampBuckets.get(bucketKey)!.push(value);
          hasAnyData = true;
        }
      }
    }

    if (hasAnyData) {
      return this.buildAggregatedResult(timestampBuckets, metric);
    }

    return [];
  }

  // Build aggregated result from timestamp buckets
  // All metrics use median across sensors (robust to individual sensor outliers)
  private buildAggregatedResult(
    timestampBuckets: Map<number, number[]>,
    metric: string = 'temperature',
  ): AggregatedWeatherData[] {
    const result: AggregatedWeatherData[] = [];

    timestampBuckets.forEach((values, timestamp) => {
      // Median across sensors for all metrics (including rainfall)
      const aggregated = HAClient.median(values);

      if (aggregated !== null && aggregated > 0) {
        if (metric === 'rainfall') {
          result.push({
            timestamp: new Date(timestamp).toISOString(),
            rainfall_mm: aggregated,
          });
        } else {
          result.push({
            timestamp: new Date(timestamp).toISOString(),
            temperature_c: aggregated as number,
          });
        }
      }
    });

    result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return result;
  }

  // Build rainfall result from integrated buckets
  // For each bucket, take median across sensors (they're all measuring the same rain)
  private buildRainfallResult(rainfallBuckets: Map<number, number[]>): AggregatedWeatherData[] {
    const result: AggregatedWeatherData[] = [];

    rainfallBuckets.forEach((values, timestamp) => {
      // Median across sensors - they're all measuring the same rain event
      const median = HAClient.median(values);
      if (median !== null && median > 0) {
        result.push({
          timestamp: new Date(timestamp).toISOString(),
          temperature_c: median, // This will be converted to mm later in weather service
        });
      }
    });

    result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return result;
  }

  // Get historical state data for a single entity using the period endpoint
  async getHistory(entityId: string, startTime: Date, endTime: Date): Promise<HAHistoricalData[]> {
    const params = new URLSearchParams({
      filter_entity_id: entityId,
      end_time: endTime.toISOString(),
      minimal_response: 'true',
    });

    // Correct endpoint: /api/history/period/{datetime}?filter_entity_id=...&end_time=...
    const result = await this.request<HAHistoricalData[][]>(`/api/history/period/${startTime.toISOString()}?${params}`);
    return result[0] || [];
  }

  // Get statistics for all entities concurrently via a single persistent WebSocket connection
  async getStatisticsBatch(
    entityIds: string[],
    startTime: Date,
    endTime: Date,
  ): Promise<Map<string, HAStatisticsData[]>> {
    if (!this.wsConnection) {
      throw new Error('WebSocket connection not available');
    }
    const rawResults = await this.wsConnection.getStatisticsBatch(entityIds, startTime, endTime);
    // Convert to HAStatisticsData format
    const resultMap = new Map<string, HAStatisticsData[]>();
    rawResults.forEach((rawStats, entityId) => {
      // Infer state_class from the data itself since WebSocket responses
      // don't always include metadata. If entries have non-null sum → total_increasing;
      // if they have min/max/mean → measurement.
      let inferredStateClass: string | null = null;
      if (rawStats.length > 0) {
        const sample = rawStats[0];
        if (sample.meta && sample.meta.state_class) {
          inferredStateClass = sample.meta.state_class;
        } else if (sample.sum !== undefined && sample.sum !== null) {
          inferredStateClass = 'total_increasing';
        } else if (sample.mean !== undefined || sample.min !== undefined || sample.max !== undefined) {
          inferredStateClass = 'measurement';
        }
      }

      // Also try to extract metadata from the result dict level
      const meta = (rawStats[0]?.meta || {}) as {[key: string]: any};

      const stats: HAStatisticsData[] = rawStats.map((s) => {
        return {
          metadata: {
            has_mean: meta?.has_mean ?? (s.mean !== undefined && s.mean !== null),
            has_sum: meta?.has_sum ?? (s.sum !== undefined && s.sum !== null),
            has_state: meta?.has_state ?? false,
            max: meta?.max ?? null,
            mean: meta?.mean ?? null,
            min: meta?.min ?? null,
            period: '5minute',
            state_class: meta?.state_class ?? inferredStateClass,
            unit_of_measurement: meta?.unit_of_measurement ?? null,
          },
          start: new Date(s.start).toISOString(),
          sum: s.sum ?? null,
          max: s.max ?? null,
          mean: s.mean ?? null,
          min: s.min ?? null,
          state: s.state ?? null,
        };
      });
      resultMap.set(entityId, stats);
    });
    return resultMap;
  }

  // Single-entity statistics (delegates to batch, then extracts one)
  async getStatistics(entityId: string, startTime: Date, endTime: Date): Promise<HAStatisticsData[]> {
    const batch = await this.getStatisticsBatch([entityId], startTime, endTime);
    return batch.get(entityId) || [];
  }

  // Clear all weather cache entries (useful when switching to statistics API)
  public static clearWeatherCache(db: any): void {
    try {
      db.prepare('DELETE FROM weather_cache').run();
      logger.info('Weather cache cleared');
    } catch {
      logger.warn('Failed to clear weather cache');
    }
  }

  // Get weather forecast from a weather entity via weather.get_forecasts service
  // Some integrations (like NWS) only support 'twice_daily' instead of 'daily'.
  // When forecastType is 'daily', we try 'daily' first, then fall back to 'twice_daily'
  // and return all entries (both day and night).
  async getWeatherForecast(entityId: string, forecastType: 'hourly' | 'daily'): Promise<HAForecast[]> {
    logger.info({ entityId, forecastType }, `Calling weather.get_forecasts service`);
    const target = forecastType === 'daily' ? 'daily' : forecastType;

    // First try the requested type
    try {
      const response = await this.requestForecast(entityId, target);
      if (response.length > 0) {
        return response;
      }
    } catch (err) {
      logger.info({ entityId, forecastType: target, err: String(err) }, `${target} forecast failed`);
    }

    // If daily failed or returned empty, try twice_daily and return all entries
    if (forecastType === 'daily') {
      logger.info({ entityId }, 'falling back to twice_daily');
      try {
        const twiceDaily = await this.requestForecast(entityId, 'twice_daily');
        if (twiceDaily.length > 0) {
          logger.info({ entityId, count: twiceDaily.length }, `twice_daily forecast received`);
          return twiceDaily;
        }
      } catch (err) {
        logger.warn({ entityId, err: String(err) }, 'twice_daily also failed');
      }
    }

    return [];
  }

  private async requestForecast(entityId: string, forecastType: string): Promise<HAForecast[]> {
    const response = await this.request<Record<string, unknown>>(`/api/services/weather/get_forecasts?return_response=true`, {
      method: 'POST',
      body: JSON.stringify({
        type: forecastType,
        entity_id: entityId,
      }),
    });
    // HA returns: { service_response: { "weather.openweathermap": { forecast: [...] } } }
    const serviceResponse = (response as Record<string, unknown>).service_response as Record<string, unknown>;
    if (!serviceResponse) {
      throw new Error(`No service_response from weather.get_forecasts for ${entityId}`);
    }
    const entityData = serviceResponse[entityId] as Record<string, unknown>;
    if (!entityData) {
      throw new Error(`No data for ${entityId} in service_response (keys: ${Object.keys(serviceResponse).join(', ')})`);
    }
    const forecast = entityData.forecast as HAForecast[];
    if (!forecast || forecast.length === 0) {
      return []; // Return empty instead of throwing - caller may try fallback
    }
    logger.info({ entityId, forecastType, count: forecast.length, first: forecast[0] }, `${forecastType} forecast received`);
    return forecast;
  }

  // Call a Home Assistant service (e.g., switch.turn_on)
  async callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<HAServiceCallResult> {
    if (this.readonlyMode) {
      throw new Error(`READONLY MODE: service call ${domain}.${service} blocked`);
    }
    return this.request<HAServiceCallResult>(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Trigger mower (generic switch approach - will be customized per mower type)
  async triggerMowerOn(entityId: string): Promise<void> {
    await this.callService('switch', 'turn_on', { entity_id: entityId });
  }

  // Stop mower
  async triggerMowerOff(entityId: string): Promise<void> {
    await this.callService('switch', 'turn_off', { entity_id: entityId });
  }

  // Lawn mower domain (Segway Navimow)
  async startMowing(entityId: string): Promise<void> {
    await this.callService('lawn_mower', 'start_mowing', { entity_id: entityId });
  }

  async dockMower(entityId: string): Promise<void> {
    await this.callService('lawn_mower', 'dock', { entity_id: entityId });
  }

  async pauseMowing(entityId: string): Promise<void> {
    await this.callService('lawn_mower', 'pause', { entity_id: entityId });
  }

  async resumeMowing(entityId: string): Promise<void> {
    await this.callService('lawn_mower', 'resume', { entity_id: entityId });
  }

  // Get mower state
  async getMowerState(entityId: string): Promise<HAEntityState> {
    return this.getEntityState(entityId);
  }

  // Get battery level
  async getBatteryLevel(entityId: string): Promise<number | null> {
    try {
      const state = await this.getEntityState(entityId);
      return HAClient.parseNumericState(state.state);
    } catch {
      return null;
    }
  }

  // Write to HA input helpers
  async writeInputNumber(entityId: string, value: number): Promise<void> {
    await this.callService('input_number', 'set_value', { entity_id: entityId, value });
  }

  async writeInputBoolean(entityId: string, state: boolean): Promise<void> {
    const service = state ? 'turn_on' : 'turn_off';
    await this.callService('input_boolean', service, { entity_id: entityId });
  }

  async writeInputSelect(entityId: string, option: string): Promise<void> {
    await this.callService('input_select', 'select_option', { entity_id: entityId, option });
  }

  // Get sun state (sunrise/sunset times)
  async getSunState(): Promise<HAEntityState> {
    return this.getEntityState('sun.sun');
  }

  // Health check - use the mower entity which we know exists
    async healthCheck(): Promise<boolean> {
      try {
        await this.request<Record<string, unknown>>('/api/states/sun.sun');
        return true;
      } catch {
        return false;
      }
    }
}
