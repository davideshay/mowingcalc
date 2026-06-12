// API response types matching backend endpoints

export interface HealthResponse {
  status: string;
  timestamp: string;
  ha_connected: boolean;
}

export interface AlgorithmStateResponse {
  status: string;
  should_mow: boolean;
  reason: string;
  growth_mm: number;
  daily_growth_mm: number;
  gp_factor: number;
  moisture_factor: number;
  sun_factor: number;
  soil_factor: number;
  seasonal_factor: number;
  // Growth model diagnostics
  avg_temperature_c: number;
  min_temperature_c: number;
  max_temperature_c: number;
  gp_sd: number;
  gp_optimal_temp: number;
  base_rate_daily: number;
  total_hours_processed: number;
  rain_delay_hours: number;
  optimal_delay_hours: number;
  is_safe_to_mow: boolean;
  safe_to_mow_time: string | null;
  estimated_soil_moisture_pct: number;
  field_capacity_pct: number;
  rain_delay_details: {
    last_significant_rain: string | null;
    last_rain_mm: number;
    rain_intensity: 'none' | 'light' | 'moderate' | 'heavy';
    hours_since_rain: number;
    initial_soil_moisture_pct: number;
    drying_time_constant: number;
    effective_tau: number;
    sun_drying_modifier: number;
    temp_drying_modifier: number;
    sun_drying_reduction: number;
    temp_drying_reduction: number;
    // Robot mower model fields
    mower_weight_lbs: number;
    compaction_threshold: number;
    safe_moisture_threshold: number;
    optimal_moisture_threshold: number;
    surface_dry_factor: number;
    time_to_safe_hours: number;
    time_to_optimal_hours: number;
    min_delay_floor_hours: number;
    max_delay_ceil_hours: number;
  };
  hours_since_mow: number;
  last_mow_time: string | null;
  next_review: string;
  timestamp: string;
}

export interface SunshineSource {
  entity_id: string;
  type: 'sunshine' | 'uv_index';
}

export interface ConfigResponse {
  readonlyMode: boolean;
  displayUnits: 'metric' | 'imperial';
  grassType: string;
  growthLowerLimit: number;
  growthUpperLimit: number;
  growthModel: {
    baseRatePerDay: number;
    rainMultiplier: number;
    tempOptimalMin: number;
    tempOptimalMax: number;
    sunGrowthBoost: number;
    soilType: 'sand' | 'loam' | 'clay';
    latitude: number;
  };
  rainDelayModel: {
    minDelayAfterRain: number;
    heavyRainDelay: number;
    sunDryingRate: number;
    tempDryingFactor: number;
    soilType: 'sand' | 'loam' | 'clay';
    mowerWeightLbs: number;
    compactionThreshold: number;
    surfaceDryFactor: number;
  };
  minTimeBetweenMows: number;
  maxTimeBetweenMows: number;
  avgMowingDuration: number;
  algorithmRunInterval: number;
  weatherCacheTTL: number;
  maxPrecipitationChance: number;
  forecastLookaheadDays: number;
  mowingWindows: Record<string, Array<{ start: string; end: string }>>;
  lastMowTimeOverride: string | null;
  entityGroups: {
    rainfallSensors: string[];
    rainfallUnit: 'millimeters' | 'inches';
    temperatureSensors: string[];
    temperatureUnit: 'celsius' | 'fahrenheit';
    sunshineSources: Array<{ entity_id: string; type: 'sunshine' | 'uv_index' }>;
    weatherForecastEntity: string;
    hourlyForecastEntity: string;
    dailyForecastEntity: string;
    mowerType: 'switch' | 'lawn_mower' | 'custom';
    mowerEntity: string;
    lastMowTimeEntity: string;
    sunEntity: string;
  };
  haInputHelpers: {
    enabled: boolean;
    nextMowNumber: string;
    growthEstimateNumber: string;
    rainDelayNumber: string;
    mowRecommendedBoolean: string;
    mowReasonSelect: string;
  };
}

export interface MowerStatusResponse {
  available: boolean;
  state?: string;
  battery_pct?: number;
  last_mowed?: string;
}

export interface MowEvent {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  growth_at_trigger: number | null;
  decision_reason: string | null;
  created_at: string;
}

export interface AlgorithmRun {
  id: number;
  run_time: string;
  growth_estimate: number | null;
  rain_delay_hours: number | null;
  decision: 'mow' | 'wait';
  decision_reason: string | null;
  next_run_time: string | null;
  created_at: string;
}

export interface GrowthHistoryPoint {
  id: number;
  timestamp: string;
  growth_mm: number;
  since_last_mow: boolean;
  created_at: string;
}

// Sensor Health / Outlier Analysis types
export interface SensorStats {
  count: number;
  validCount: number;
  zeroCount: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  dataSpanHours: number;
}

export interface OutlierFlag {
  type: 'all_zeros' | 'stale' | 'statistical' | 'zero_dominant' | 'extreme_range';
  severity: 'critical' | 'warning';
  message: string;
}

export interface SensorReading {
  timestamp: string;
  value: number;
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
  error?: string;
}
