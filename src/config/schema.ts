import { z } from 'zod';

// Time window schema (supports HH:MM format and sunset-relative notation)
const TimeWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const MowingWindowsSchema = z.object({
  monday: z.array(TimeWindowSchema).default([]),
  tuesday: z.array(TimeWindowSchema).default([]),
  wednesday: z.array(TimeWindowSchema).default([]),
  thursday: z.array(TimeWindowSchema).default([]),
  friday: z.array(TimeWindowSchema).default([]),
  saturday: z.array(TimeWindowSchema).default([]),
  sunday: z.array(TimeWindowSchema).default([]),
});

// Growth model parameters
// Research: cool-season grasses grow 2-4 mm/day at peak (spring/fall, well-fertilized)
// Tall fescue: ~2.5 mm/day at 100% GP; bermuda: ~3.0 mm/day
const GrowthModelSchema = z.object({
  baseRatePerDay: z.number().positive().default(2.5),
  rainMultiplier: z.number().positive().default(0.2),
  tempOptimalMin: z.number().default(15),
  tempOptimalMax: z.number().default(25),
  sunGrowthBoost: z.number().min(0).max(1).default(0.15),

  // NEW: Soil type for growth model (shares with rainDelayModel)
  // Affects water retention, nutrient availability, and drainage
  soilType: z.enum(['sand', 'loam', 'clay']).default('loam'),

  // NEW: Latitude for seasonal dormancy calculations
  // Enables photoperiod-based growth adjustment (degrees, -90 to 90)
  latitude: z.number().min(-90).max(90).default(40),
});

// Rain delay model parameters
// Research-backed thresholds for 60-70 lb robot mowers (RAIN_DELAY_MODEL_RESEARCH.md)
const RainDelayModelSchema = z.object({
  // Absolute bounds on the rain delay calculation (applied after the model runs)
  // minDelayAfterRain: minimum hours to wait after rain is detected.
  //   Even a light sprinkle needs time for surface moisture to dry off the
  //   grass blades. Independent of soil moisture model output.
  minDelayAfterRain: z.number().positive().default(4),
  // heavyRainDelay: maximum hours the model will ever delay.
  //   Even after a drenching downpour, we cap the delay so the mower
  //   doesn't sit idle indefinitely.
  heavyRainDelay: z.number().positive().default(48),
  sunDryingRate: z.number().min(0).max(1).default(0.1),
  tempDryingFactor: z.number().min(0).default(0.05),
  soilType: z.enum(['sand', 'loam', 'clay']).default('loam'),

  // NEW: mower-specific parameters (RAIN_DELAY_MODEL_RESEARCH.md Section 6)
  // Mower weight in lbs - drives compaction threshold automatically
  // Below 100 lbs = robot mower thresholds; above 200 lbs = conventional mower thresholds
  mowerWeightLbs: z.number().positive().default(65),

  // Compaction threshold as fraction of field capacity
  // 1.05 = safe to mow at 105% of FC (robot mower - low compaction risk)
  // 1.0  = safe to mow at exactly FC (conventional mower)
  // Auto-computed from mowerWeightLbs unless explicitly overridden
  compactionThreshold: z.number().min(0.5).max(1.2).default(1.05),

  // Surface dry factor: additional drying time fraction for cutting quality
  // 0.3 = optimal mow requires 30% more drying beyond compaction-safe threshold
  // Accounts for grass surface moisture vs deep soil moisture
  surfaceDryFactor: z.number().min(0).max(1).default(0.3),
});

// Entity groups - maps metric types to arrays of HA entity IDs
// The algorithm will use median aggregation across all entities in each group
// to avoid outliers from individual sensors
const SunshineSourceSchema = z.object({
  entity_id: z.string(),
  type: z.enum(['sunshine', 'uv_index']),
});

// Weather sensor entry: can be a plain string (legacy) or an object with added_at timestamp.
// When a sensor is added to config, added_at is auto-set to the current time.
// The sensor-outlier check uses this to avoid flagging "missed rain" for rain events
// that occurred before the sensor was configured.
const WeatherSensorSchema = z.union([
  z.object({
    entity_id: z.string(),
    added_at: z.string().datetime().optional(),
  }),
  z.string(),
]);

const EntityGroupsSchema = z.object({
  // Historical weather sensors (past 7 days, hourly)
  rainfallSensors: z.array(WeatherSensorSchema).default([]),
  // Rainfall unit reported by sensors ('millimeters' or 'inches')
  // WeatherFlow AWS hourly_rain sensors report in inches per hour
  rainfallUnit: z.enum(['millimeters', 'inches']).default('millimeters'),
  temperatureSensors: z.array(WeatherSensorSchema).default([]),
  // Temperature unit reported by sensors ('celsius' or 'fahrenheit')
  // WeatherFlow AWS sensors report in Fahrenheit by default
  temperatureUnit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  // Sunshine sources: direct duration sensors OR UV index sensors (app converts UV > 0.5 -> 1h sun)
  sunshineSources: z.array(SunshineSourceSchema).default([]),

  // Forecast entities - can use different providers for hourly vs daily
  // If empty, falls back to weatherForecastEntity (legacy single entity)
  weatherForecastEntity: z.string().default('weather.home'),
  hourlyForecastEntity: z.string().default(''),
  dailyForecastEntity: z.string().default(''),

  // Mower control - single entity for Segway Navimow lawn_mower integration
  mowerType: z.enum(['lawn_mower', 'switch', 'custom']).default('lawn_mower'),
  mowerEntity: z.string().default('lawn_mower.navimow'),

  // Last mow time (optional - if Navimow doesn't expose this as an attribute)
  lastMowTimeEntity: z.string().default(''),

  // Sun entity (usually fixed)
  sunEntity: z.string().default('sun.sun'),
});

// Debug override: manually set last mow time (ISO 8601 string)
// Takes precedence over lastMowTimeEntity when non-empty.
// Useful when the HA sensor is broken or during model accuracy testing.
export const LAST_MOW_OVERRIDE_FIELD = 'lastMowTimeOverride';

// HA Input Helpers config (optional)
const HAInputHelpersSchema = z.object({
  enabled: z.boolean().default(false),
  nextMowNumber: z.string().default('input_number.next_predicted_mow'),
  growthEstimateNumber: z.string().default('input_number.growth_estimate_mm'),
  rainDelayNumber: z.string().default('input_number.rain_delay_hours'),
  mowRecommendedBoolean: z.string().default('input_boolean.mow_recommended'),
  mowReasonSelect: z.string().default('input_select.mow_reason'),
});

// Main application configuration schema
export const AppConfigSchema = z.object({
  // Safety: read-only mode blocks all mower actions
  readonlyMode: z.boolean().default(true),

  // Display units for UI (internal calculations always metric)
  displayUnits: z.enum(['metric', 'imperial']).default('metric'),

  // Grass and growth
  grassType: z.string().default('tall_fescue'),
  growthLowerLimit: z.number().positive().default(3),
  growthUpperLimit: z.number().positive().default(6),
  growthModel: GrowthModelSchema.default({}),

  // Rain delay
  rainDelayModel: RainDelayModelSchema.default({}),

  // Time constraints
  minTimeBetweenMows: z.number().positive().default(48),
  maxTimeBetweenMows: z.number().positive().default(168),
  avgMowingDuration: z.number().positive().default(90),

  // Algorithm timing
  algorithmRunInterval: z.number().positive().default(15),
  weatherCacheTTL: z.number().positive().default(30),

  // Weather thresholds
  maxPrecipitationChance: z.number().min(0).max(100).default(30),

  // Forecast lookahead (mow proactively if rain is coming in next N days)
  forecastLookaheadDays: z.number().min(1).max(7).default(3),

  // Debug override: manually set last mow time (ISO 8601 string or null)
  // Takes precedence over lastMowTimeEntity when non-empty.
  lastMowTimeOverride: z.string().nullable().default(null),

  // Home Assistant connection (can also be set via HA_URL/HA_TOKEN env vars)
  haUrl: z.string().default(''),
  haToken: z.string().default(''),

  // Mowing windows
  mowingWindows: MowingWindowsSchema.default({}),

  // Home Assistant entity groups (multiple sensors per metric, median aggregated)
  entityGroups: EntityGroupsSchema.default({}),

  // HA Input Helpers (optional)
  haInputHelpers: HAInputHelpersSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Extract entity_id from a weather sensor entry.
 * Handles both legacy string format and { entity_id, added_at } object format.
 */
export function getSensorEntityId(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return (entry as { entity_id?: string }).entity_id ?? '';
  }
  return '';
}

/**
 * Get added_at timestamp from a weather sensor entry, or undefined if legacy string format.
 */
export function getSensorAddedAt(entry: unknown): string | undefined {
  if (typeof entry === 'string') return undefined;
  if (entry && typeof entry === 'object') {
    return (entry as { added_at?: string }).added_at;
  }
  return undefined;
}

/**
 * Normalize a weather sensor entry to { entity_id, added_at }.
 * Auto-timestamps new entries that lack added_at.
 */
export function normalizeWeatherSensor(entry: unknown, now?: string): { entity_id: string; added_at: string } {
  const id = getSensorEntityId(entry);
  let added_at = getSensorAddedAt(entry);
  if (!added_at) {
    added_at = now ?? new Date().toISOString();
  }
  return { entity_id: id, added_at };
}

// Validate and parse config, falling back to defaults
export function parseConfig(input: unknown): AppConfig {
  return AppConfigSchema.parse(input);
}
