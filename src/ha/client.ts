import fetch from 'node-fetch';

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

export class HAClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
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
  async getAggregatedHistoricalData(
    entityIds: string[],
    startTime: Date,
    endTime: Date,
    aggregationIntervalMs: number = 3600000, // default 1 hour
  ): Promise<AggregatedWeatherData[]> {
    const allData = await this.getHistoricalData(entityIds, startTime, endTime);

    // Group by timestamp bucket
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

    // Calculate median for each bucket
    const result: AggregatedWeatherData[] = [];
    timestampBuckets.forEach((values, timestamp) => {
      const median = HAClient.median(values);
      if (median !== null) {
        result.push({
          timestamp: new Date(timestamp).toISOString(),
          temperature_c: median, // caller should specify which metric this is
        });
      }
    });

    result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return result;
  }

  // Get historical state data for a single entity
  async getHistory(entityId: string, startTime: Date, endTime: Date): Promise<HAHistoricalData[]> {
    const params = new URLSearchParams({
      filter_entity_id: entityId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      minimal_response: 'true',
    });

    const result = await this.request<HAHistoricalData[][]>(`/api/history?${params}`);
    return result[0] || [];
  }

  // Get weather forecast from a weather entity
  async getWeatherForecast(entityId: string, forecastType: 'hourly' | 'daily'): Promise<HAForecast[]> {
    const state = await this.getEntityState(entityId);
    const forecast = (state.attributes as Record<string, HAForecast[]>)[forecastType];
    if (!forecast) {
      throw new Error(`No ${forecastType} forecast available for ${entityId}`);
    }
    return forecast;
  }

  // Call a Home Assistant service (e.g., switch.turn_on)
  async callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<HAServiceCallResult> {
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

  // Get sun state (sunrise/sunset times)
  async getSunState(): Promise<HAEntityState> {
    return this.getEntityState('sun.sun');
  }

  // Health check - get HA server state
  async healthCheck(): Promise<boolean> {
    try {
      await this.request<Record<string, unknown>>('/api');
      return true;
    } catch {
      return false;
    }
  }
}
