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
  rain_delay_hours: number;
  is_safe_to_mow: boolean;
  hours_since_mow: number;
  last_mow_time: string | null;
  next_review: string;
  timestamp: string;
}

export interface ConfigResponse {
  grassType: string;
  growthLowerLimit: number;
  growthUpperLimit: number;
  growthModel: {
    baseRatePerDay: number;
    rainMultiplier: number;
    tempOptimalMin: number;
    tempOptimalMax: number;
    sunGrowthBoost: number;
  };
  rainDelayModel: {
    minDelayAfterRain: number;
    heavyRainDelay: number;
    sunDryingRate: number;
    tempDryingFactor: number;
    soilType: 'sand' | 'loam' | 'clay';
  };
  minTimeBetweenMows: number;
  maxTimeBetweenMows: number;
  avgMowingDuration: number;
  algorithmRunInterval: number;
  weatherCacheTTL: number;
  maxPrecipitationChance: number;
  mowingWindows: Record<string, Array<{ start: string; end: string }>>;
  entityGroups: {
    rainfallSensors: string[];
    temperatureSensors: string[];
    sunshineSensors: string[];
    humiditySensors: string[];
    windSpeedSensors: string[];
    weatherForecastEntity: string;
    mowerType: 'switch' | 'lawn_mower' | 'custom';
    mowerEntity: string;
    mowerStateEntity: string;
    mowerBatteryEntity: string;
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
