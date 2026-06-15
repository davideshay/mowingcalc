import pino from 'pino';
import { HAClient, HAEntityState } from '../ha/client';
import { AppConfig } from '../config/schema';

const logger = pino({ level: 'info' });

// ---- Public interfaces ----

export interface SensorReading {
  timestamp: string;
  value: number;
}

export interface SensorStats {
  count: number;
  validCount: number;
  zeroCount: number;
  mean: number | null;          // mean of non-zero values (for reporting)
  meanAll: number | null;       // mean of ALL values including zeros (for comparison)
  std: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  total: number | null;
  dataSpanHours: number;
  lastReadingAgeHours: number;
}

export interface OutlierFlag {
  type: 'all_zeros' | 'stale' | 'statistical' | 'zero_dominant' | 'extreme_range' | 'missed_rain';
  severity: 'critical' | 'warning';
  message: string;
}

export interface SensorAnalysis {
  entity_id: string;
  friendly_name: string | null;
  unit_of_measurement: string | null;
  stats: SensorStats;
  flags: OutlierFlag[];
  readings: SensorReading[];
  recommended: boolean;
}

export interface MetricAnalysis {
  metric: 'rainfall' | 'temperature' | 'uv_index' | 'sunshine';
  metricLabel: string;
  sensorCount: number;
  timeRangeHours: number;
  groupMedian: number | null;
  sensors: SensorAnalysis[];
}

export interface RecommendedRemoval {
  metric: string;
  entity_id: string;
  friendly_name: string | null;
  reason: string;
}

export interface SensorOutlierResult {
  analysisTime: string;
  metrics: MetricAnalysis[];
  totalOutliers: number;
  recommendedRemovals: RecommendedRemoval[];
}

// ---- Internal helpers ----

function computeStats(values: number[]): Omit<SensorStats, 'count' | 'zeroCount' | 'meanAll'> {
  if (values.length === 0) {
    return {
      validCount: 0,
      mean: null,
      std: null,
      min: null,
      max: null,
      median: null,
      p10: null,
      p90: null,
      total: null,
      dataSpanHours: 0,
      lastReadingAgeHours: 0,
    };
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const percentile = (pct: number) => {
    const idx = pct * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  return {
    validCount: n,
    mean,
    std,
    min: sorted[0],
    max: sorted[n - 1],
    median: percentile(0.5),
    p10: percentile(0.1),
    p90: percentile(0.9),
    total: sum,
    dataSpanHours: 0, // will be set from timestamps
    lastReadingAgeHours: 0, // will be set from timestamps
  };
}

// ---- Main service ----

export class SensorOutlierService {
  private ha: HAClient;
  private config: AppConfig;

  constructor(ha: HAClient, config: AppConfig) {
    this.ha = ha;
    this.config = config;
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
  }

  /**
   * Analyze all configured sensor groups for outliers.
   * Fetches per-sensor historical data from HA statistics API.
   */
  public async analyze(hours: number = 240): Promise<SensorOutlierResult> {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 3600000);
    // Clamp to valid range
    hours = Math.max(24, Math.min(720, hours));

    const metricGroups = this.resolveMetricGroups();
    const metrics: MetricAnalysis[] = [];
    const allRemovals: RecommendedRemoval[] = [];
    let totalOutliers = 0;

    for (const group of metricGroups) {
      if (group.entityIds.length === 0) {
        metrics.push({
          metric: group.metric,
          metricLabel: group.label,
          sensorCount: 0,
          timeRangeHours: hours,
          groupMedian: null,
          sensors: [],
        });
        continue;
      }

      logger.info(
        { metric: group.metric, sensors: group.entityIds.length, hours },
        'Analyzing sensor data',
      );

      const analysis = await this.analyzeMetricGroup(group, startTime, now, hours);
      metrics.push(analysis);

      for (const sensor of analysis.sensors) {
        if (sensor.flags.length > 0) totalOutliers++;
        if (sensor.recommended) {
          allRemovals.push({
            metric: group.label,
            entity_id: sensor.entity_id,
            friendly_name: sensor.friendly_name,
            reason: sensor.flags
              .filter((f) => f.severity === 'critical')
              .map((f) => f.message)
              .join('; '),
          });
        }
      }
    }

    return {
      analysisTime: new Date().toISOString(),
      metrics,
      totalOutliers,
      recommendedRemovals: allRemovals,
    };
  }

  /**
   * Analyze a single metric group (e.g., all rainfall sensors).
   */
  private async analyzeMetricGroup(
    group: { metric: string; label: string; entityIds: string[] },
    startTime: Date,
    endTime: Date,
    hours: number,
  ): Promise<MetricAnalysis> {
    // Fetch statistics for all sensors in parallel
    const statsMap = await this.ha.getStatisticsBatch(
      group.entityIds,
      startTime,
      endTime,
    );

    // Fetch current states for friendly names
    const statesMap = new Map<string, HAEntityState>();
    for (const entityId of group.entityIds) {
      try {
        const state = await this.ha.getEntityState(entityId);
        statesMap.set(entityId, state);
      } catch {
        // Entity not found - will show as error
      }
    }

    // Build per-sensor analysis
    const sensors: SensorAnalysis[] = [];

    for (const entityId of group.entityIds) {
      const rawStats = statsMap.get(entityId) || [];
      const state = statesMap.get(entityId);
      const friendly_name = state
        ? ((state.attributes as Record<string, unknown>)['friendly_name'] as string) || null
        : null;
      const unit = state
        ? ((state.attributes as Record<string, unknown>)['unit_of_measurement'] as string) || null
        : null;

      // Determine state_class from entity attributes (authoritative source).
      // The raw stats metadata state_class is unreliable — client.ts infers it
      // from presence of `sum`, but HA returns non-null sum for BOTH measurement
      // and total_increasing sensors, so measurement sensors get misclassified.
      const attrStateClass = state
        ? ((state.attributes as Record<string, unknown>)['state_class'] as string) || ''
        : '';
      const inferredStateClass = rawStats[0]?.metadata?.state_class ?? '';

      // Convert raw stats to readings
      // total_increasing sensors: use `sum` (incremental change per bucket).
      // measurement sensors: use `mean` (instantaneous value per bucket).
      const isTotal = attrStateClass.includes('total') ||
        (attrStateClass === '' && inferredStateClass === 'total_increasing');

      // Detect rate sensors (e.g., in/h, mm/h) — need to convert rate to accumulation
      const rawUnit = state
        ? ((state.attributes as Record<string, unknown>)['unit_of_measurement'] as string) || ''
        : '';
      const isRateSensor = /\/h\b/i.test(rawUnit);
      // Statistics period in hours (5-minute buckets = 5/60 hours)
      const periodHours = (rawStats[0]?.metadata?.period ?? '5minute') === '5minute' ? 5 / 60 : 1;

      const readings: SensorReading[] = [];
      for (const entry of rawStats) {
        const value = isTotal
          ? entry.sum ?? entry.mean ?? entry.state
          : entry.mean ?? entry.sum ?? entry.state;
        if (value === null || value === undefined || isNaN(value)) continue;
        // For rate sensors, convert rate → accumulation per period
        const adjusted = isRateSensor ? Number(value) * periodHours : Number(value);
        readings.push({
          timestamp: entry.start,
          value: adjusted,
        });
      }

      // Normalize unit for rate sensors: "in/h" → "in", "mm/h" → "mm"
      let normalizedUnit = unit;
      if (isRateSensor && rawUnit) {
        normalizedUnit = rawUnit.replace(/\s*\/\s*h\b/i, '').trim() || normalizedUnit;
      }

      // Compute stats on ALL values (including zeros) for the group comparison.
      // For UV index, zero at night is a valid reading — a sensor showing 6 when
      // others show 0 IS an outlier, and we need zeros in the calculation to detect it.
      // Also compute stats on non-zero values only for individual sensor reporting
      // (mean of actual measurements, excluding periods of no activity).
      const values = readings.map((r) => r.value);
      const totalCount = readings.length;
      const zeroCount = values.filter((v) => v === 0).length;
      const allStatsData = computeStats(values);
      const validValues = values.filter((v) => v !== 0);
      const statsData = computeStats(validValues);

      // Compute data span & last reading age from timestamps
      let dataSpanHours = 0;
      let lastReadingAgeHours = 0;
      if (readings.length >= 2) {
        const firstTs = new Date(readings[0].timestamp).getTime();
        const lastTs = new Date(readings[readings.length - 1].timestamp).getTime();
        dataSpanHours = (lastTs - firstTs) / 3600000;
        lastReadingAgeHours = (endTime.getTime() - lastTs) / 3600000;
      } else if (readings.length === 1) {
        const lastTs = new Date(readings[0].timestamp).getTime();
        lastReadingAgeHours = (endTime.getTime() - lastTs) / 3600000;
      }

      const stats: SensorStats = {
        count: totalCount,
        validCount: statsData.validCount,
        zeroCount,
        mean: statsData.mean,
        meanAll: allStatsData.mean,
        std: statsData.std,
        min: statsData.min,
        max: statsData.max,
        median: statsData.median,
        p10: statsData.p10,
        p90: statsData.p90,
        total: statsData.total,
        dataSpanHours,
        lastReadingAgeHours,
      };

      sensors.push({
        entity_id: entityId,
        friendly_name,
        unit_of_measurement: normalizedUnit,
        stats,
        flags: [], // populated in Phase 3
        readings,
        recommended: false,
      });
    }

    // Phase 3: Outlier detection
    const flagged = this.detectOutliers(sensors, hours, group.metric);
    flagged.forEach((f) => {
      const sensor = sensors.find((s) => s.entity_id === f.entity_id);
      if (sensor) {
        sensor.flags.push(f.flag);
        if (f.flag.severity === 'critical') {
          sensor.recommended = true;
        }
      }
    });

    // Compute group median of means
    const means = sensors
      .map((s) => s.stats.mean)
      .filter((m) => m !== null) as number[];
    const groupMedian = means.length > 0
      ? HAClient.median(means)
      : null;

    // Compute actual time range from data
    const allReadings = sensors.flatMap((s) => s.readings);
    let timeRangeHours = hours;
    if (allReadings.length >= 2) {
      const timestamps = allReadings.map((r) => new Date(r.timestamp).getTime());
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      timeRangeHours = (maxTs - minTs) / 3600000;
    }

    return {
      metric: group.metric as any,
      metricLabel: group.label,
      sensorCount: sensors.length,
      timeRangeHours: Math.round(timeRangeHours),
      groupMedian,
      sensors,
    };
  }

  /**
   * Resolve entity IDs for each metric type from config.
   */
  private resolveMetricGroups(): Array<{ metric: 'rainfall' | 'temperature' | 'uv_index' | 'sunshine'; label: string; entityIds: string[] }> {
    const groups: Array<{ metric: 'rainfall' | 'temperature' | 'uv_index' | 'sunshine'; label: string; entityIds: string[] }> = [];

    // Rainfall sensors
    const rainfallSensors = this.config.entityGroups.rainfallSensors || [];
    if (rainfallSensors.length > 0) {
      groups.push({ metric: 'rainfall', label: 'Rainfall', entityIds: rainfallSensors });
    } else {
      groups.push({ metric: 'rainfall', label: 'Rainfall', entityIds: [] });
    }

    // Temperature sensors
    const temperatureSensors = this.config.entityGroups.temperatureSensors || [];
    if (temperatureSensors.length > 0) {
      groups.push({ metric: 'temperature', label: 'Temperature', entityIds: temperatureSensors });
    } else {
      groups.push({ metric: 'temperature', label: 'Temperature', entityIds: [] });
    }

    // Sunshine sources (sunshine type)
    const sunshineSources = this.config.entityGroups.sunshineSources || [];
    const sunshineIds = sunshineSources
      .filter((s: any) => s.type === 'sunshine')
      .map((s: any) => s.entity_id);
    groups.push({ metric: 'sunshine', label: 'Sunshine', entityIds: sunshineIds });

    // UV Index sources
    const uvIds = sunshineSources
      .filter((s: any) => s.type === 'uv_index')
      .map((s: any) => s.entity_id);
    if (uvIds.length > 0) {
      groups.push({ metric: 'uv_index', label: 'UV Index', entityIds: uvIds });
    } else {
      groups.push({ metric: 'uv_index', label: 'UV Index', entityIds: [] });
    }

    return groups;
  }

  /**
   * Run all outlier detection checks on a set of sensors.
   */
  private detectOutliers(
    sensors: SensorAnalysis[],
    hours: number,
    metric: string,
  ): Array<{ entity_id: string; flag: OutlierFlag }> {
    const flags: Array<{ entity_id: string; flag: OutlierFlag }> = [];

    for (const sensor of sensors) {
      // Check 1: All zeros
      if (sensor.stats.validCount === 0) {
        flags.push({
          entity_id: sensor.entity_id,
          flag: {
            type: 'all_zeros',
            severity: 'critical',
            message: 'No valid data - all readings are zero or missing',
          },
        });
      }

      // Check 2: Zero dominant (>95% zeros) — temperature only
      // Rain and UV are legitimately zero for long periods (no rain, night)
      if (metric === 'temperature' && sensor.stats.count > 0) {
        const zeroRatio = sensor.stats.zeroCount / sensor.stats.count;
        if (zeroRatio > 0.95 && sensor.stats.validCount > 0) {
          flags.push({
            entity_id: sensor.entity_id,
            flag: {
              type: 'zero_dominant',
              severity: 'critical',
              message: `${Math.round(zeroRatio * 100)}% of readings are zero`,
            },
          });
        } else if (zeroRatio > 0.5 && sensor.stats.validCount > 0) {
          flags.push({
            entity_id: sensor.entity_id,
            flag: {
              type: 'zero_dominant',
              severity: 'warning',
              message: `${Math.round(zeroRatio * 100)}% of readings are zero`,
            },
          });
        }
      }

      // Check 3: Stale data
      // A sensor is "stale" only if its most recent reading is actually old (>24h ago).
      // Newly added sensors with short history but recent data are NOT stale — they're just new.
      if (sensor.stats.count > 0 && sensor.stats.lastReadingAgeHours > 24) {
        flags.push({
          entity_id: sensor.entity_id,
          flag: {
            type: 'stale',
            severity: 'critical',
            message: `Last reading ${Math.round(sensor.stats.lastReadingAgeHours)}h ago`,
          },
        });
      }
    }

    // Check 4: Statistical outlier (requires 3+ sensors with valid data)
    // For rainfall: compare total accumulated rainfall over the period.
    //   Comparing mean of non-zero values is meaningless for rainfall — most buckets are zero,
    //   and the non-zero mean is dominated by a few heavy events and sensitive to how many
    //   light-rain events each sensor happened to catch. Total rainfall is directly comparable.
    // For temperature: compare mean of non-zero values (average operating value).
    //   Temperature sensors can legitimately read near 0°C, but we exclude exact zeros
    //   as they often indicate sensor disconnect or initialization.
    // For UV index: compare mean of ALL values (including zeros).
    //   UV should be 0 at night — a sensor stuck at 6 when all others are 0 IS an outlier,
    //   and we need the zeros in the calculation to detect it.
    // For sunshine: same as UV — compare mean of ALL values.
    const useTotalForComparison = metric === 'rainfall';
    const useMeanAll = metric === 'uv_index' || metric === 'sunshine';

    // Filter sensors with valid data for comparison
    const validSensors = sensors.filter((s) =>
      useTotalForComparison ? s.stats.total !== null
        : (useMeanAll ? s.stats.meanAll !== null : s.stats.mean !== null)
    );
    if (validSensors.length >= 3) {
      const compareValues = validSensors.map((s) =>
        useTotalForComparison ? (s.stats.total as number)
          : (useMeanAll ? (s.stats.meanAll as number) : (s.stats.mean as number))
      );
      const compareMedian = HAClient.median(compareValues) as number;

      // Compute IQR of deviations
      const deviations = compareValues.map((v) => Math.abs(v - compareMedian));
      const sortedDevs = deviations.slice().sort((a, b) => a - b);
      const n = sortedDevs.length;
      const q1Idx = Math.floor(n * 0.25);
      const q3Idx = Math.floor(n * 0.75);
      const iqr = sortedDevs[q3Idx] - sortedDevs[q1Idx];

      for (const sensor of validSensors) {
        const compareValue = useTotalForComparison ? (sensor.stats.total as number)
          : (useMeanAll ? (sensor.stats.meanAll as number) : (sensor.stats.mean as number));
        const deviation = Math.abs(compareValue - compareMedian);
        if (iqr > 0 && deviation > 1.5 * iqr) {
          const severity = deviation > 3 * iqr ? 'critical' : 'warning';
          const label = useTotalForComparison ? 'Total rainfall' : 'Mean';
          flags.push({
            entity_id: sensor.entity_id,
            flag: {
              type: 'statistical',
              severity,
              message: `${label} (${compareValue.toFixed(2)}) deviates significantly from group median (${compareMedian.toFixed(2)})`,
            },
          });
        }
      }

      // Ratio-based outlier checks — catch cases where the IQR method fails
      // with small sample sizes (a single outlier swamps the IQR calculation).
      
      // Rainfall: 3x ratio on total rainfall
      if (metric === 'rainfall' && compareMedian > 0) {
        for (const sensor of validSensors) {
          const sensorTotal = sensor.stats.total as number;
          const ratio = sensorTotal / compareMedian;
          if (ratio > 3 || ratio < 0.3) {
            const alreadyFlagged = flags.some(
              (f) => f.entity_id === sensor.entity_id && f.flag.type === 'statistical',
            );
            if (!alreadyFlagged) {
              flags.push({
                entity_id: sensor.entity_id,
                flag: {
                  type: 'statistical',
                  severity: 'warning',
                  message: `Rainfall total is ${ratio > 1 ? ratio.toFixed(1) + 'x' : (1 / ratio).toFixed(1) + 'x less than'} group median`,
                },
              });
            }
          }
        }
      }
      
      // UV/sunshine: a sensor reading >2.5x or <0.4x the group median is suspicious
      if (useMeanAll && compareMedian > 0) {
        for (const sensor of validSensors) {
          const sensorValue = sensor.stats.meanAll as number;
          const ratio = sensorValue / compareMedian;
          if (ratio > 2.5 || ratio < 0.4) {
            const alreadyFlagged = flags.some(
              (f) => f.entity_id === sensor.entity_id && f.flag.type === 'statistical',
            );
            if (!alreadyFlagged) {
              flags.push({
                entity_id: sensor.entity_id,
                flag: {
                  type: 'statistical',
                  severity: ratio > 4 || ratio < 0.2 ? 'critical' : 'warning',
                  message: `Mean (${sensorValue.toFixed(2)}) is ${ratio > 1 ? ratio.toFixed(1) + 'x' : (1 / ratio).toFixed(1) + 'x less than'} group median (${compareMedian.toFixed(2)})`,
                },
              });
            }
          }
        }
      }
    } else if (validSensors.length === 2) {
      // With only 2 sensors, simple comparison
      const means = validSensors.map((s) =>
        useMeanAll ? (s.stats.meanAll as number) : (s.stats.mean as number)
      );
      if (means[0] !== null && means[1] !== null) {
        const ratio = Math.max(means[0] / (means[1] || 1), means[1] / (means[0] || 1));
        if (ratio > 3) {
          // Flag the one that's further from the midpoint
          const midpoint = (means[0] + means[1]) / 2;
          for (const sensor of validSensors) {
            const val = useMeanAll ? (sensor.stats.meanAll as number) : (sensor.stats.mean as number);
            const deviation = Math.abs(val - midpoint);
            if (deviation > midpoint * 0.5) {
              flags.push({
                entity_id: sensor.entity_id,
                flag: {
                  type: 'statistical',
                  severity: 'warning',
                  message: `Mean (${val.toFixed(2)}) differs significantly from peer sensor`,
                },
              });
            }
          }
        }
      }
    }

    // Check 5: Missed rain events — rainfall only
    // Aggregate at the hourly level to handle spatial variability (sensors may be 5km apart
    // and experience slightly different weather at the 5-min level).
    // Exclude stale sensors from the majority check.
    if (metric === 'rainfall') {
      const rainThreshold = 0.01; // in — skip very light rain / sensor noise

      // Identify stale sensors (already flagged above)
      const staleEntityIds = new Set(
        flags.filter((f) => f.flag.type === 'stale').map((f) => f.entity_id),
      );
      const activeSensors = sensors.filter((s) => !staleEntityIds.has(s.entity_id));

      // Build hourly buckets: hourKey -> sensorEntityId -> totalRainInHour
      // Aggregate all 5-min readings within each hour.
      const hourlyBuckets = new Map<number, Map<string, number>>();
      for (const sensor of activeSensors) {
        for (const reading of sensor.readings) {
          const tsMs = new Date(reading.timestamp).getTime();
          // Truncate to hour boundary
          const hourKey = Math.floor(tsMs / 3600000) * 3600000;
          if (!hourlyBuckets.has(hourKey)) {
            hourlyBuckets.set(hourKey, new Map());
          }
          const sensorBucket = hourlyBuckets.get(hourKey)!;
          const existing = sensorBucket.get(sensor.entity_id) ?? 0;
          sensorBucket.set(sensor.entity_id, existing + reading.value);
        }
      }

      for (const sensor of activeSensors) {
        let totalRainEvents = 0;
        let missedEvents = 0;

        for (const [, hourValues] of hourlyBuckets) {
          // A rain event: majority of active sensors report rain > threshold in this hour
          const sensorsWithRain = [...hourValues.entries()].filter(
            ([_eid, val]) => val > rainThreshold,
          );
          const isRainEvent = sensorsWithRain.length > activeSensors.length / 2;
          if (!isRainEvent) continue;

          totalRainEvents++;
          // Did this sensor miss it?
          const sensorRain = hourValues.get(sensor.entity_id) ?? 0;
          if (sensorRain <= rainThreshold) {
            missedEvents++;
          }
        }

        // Need at least 5 rain events to avoid false positives on barely-rainy windows
        if (totalRainEvents >= 5 && missedEvents > 0) {
          const missRatio = missedEvents / totalRainEvents;
          if (missRatio > 0.5) {
            flags.push({
              entity_id: sensor.entity_id,
              flag: {
                type: 'missed_rain',
                severity: 'critical',
                message: `Missed ${missedEvents}/${totalRainEvents} rain events (${Math.round(missRatio * 100)}%)`,
              },
            });
          } else if (missRatio > 0.2) {
            flags.push({
              entity_id: sensor.entity_id,
              flag: {
                type: 'missed_rain',
                severity: 'warning',
                message: `Missed ${missedEvents}/${totalRainEvents} rain events (${Math.round(missRatio * 100)}%)`,
              },
            });
          }
        }
      }
    }

    // Check 6: Extreme range — temperature only (requires 3+ sensors)
    // Rain and UV have natural range variation (weather, day/night cycle)
    if (metric === 'temperature' && validSensors.length >= 3) {
      const ranges = validSensors
        .map((s) => {
          if (s.stats.min !== null && s.stats.max !== null) {
            return s.stats.max! - s.stats.min!;
          }
          return null;
        })
        .filter((r) => r !== null) as number[];

      if (ranges.length >= 3) {
        const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
        for (const sensor of validSensors) {
          if (sensor.stats.min !== null && sensor.stats.max !== null) {
            const range = sensor.stats.max! - sensor.stats.min!;
            if (avgRange > 0 && range > 3 * avgRange) {
              flags.push({
                entity_id: sensor.entity_id,
                flag: {
                  type: 'extreme_range',
                  severity: 'warning',
                  message: `Range (${sensor.stats.min!.toFixed(1)}-${sensor.stats.max!.toFixed(1)}) is ${(range / avgRange).toFixed(1)}x wider than group average`,
                },
              });
            }
          }
        }
      }
    }

    return flags;
  }
}
