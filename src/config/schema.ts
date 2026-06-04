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
const GrowthModelSchema = z.object({
  baseRatePerDay: z.number().positive().default(0.7),
  rainMultiplier: z.number().positive().default(0.2),
  tempOptimalMin: z.number().default(15),
  tempOptimalMax: z.number().default(25),
  sunGrowthBoost: z.number().min(0).max(1).default(0.15),
});

// Rain delay model parameters
const RainDelayModelSchema = z.object({
  minDelayAfterRain: z.number().positive().default(24),
  heavyRainDelay: z.number().positive().default(48),
  sunDryingRate: z.number().min(0).max(1).default(0.1),
  tempDryingFactor: z.number().min(0).default(0.05),
  soilType: z.enum(['sand', 'loam', 'clay']).default('loam'),
});

// Entity groups - maps metric types to arrays of HA entity IDs
// The algorithm will use median aggregation across all entities in each group
// to avoid outliers from individual sensors
const EntityGroupsSchema = z.object({
  // Historical weather sensors (past 7 days, hourly)
  rainfallSensors: z.array(z.string()).default([]),
  temperatureSensors: z.array(z.string()).default([]),
  sunshineSensors: z.array(z.string()).default([]),
  humiditySensors: z.array(z.string()).default([]),
  windSpeedSensors: z.array(z.string()).default([]),

  // Forecast entity (usually a single weather entity with forecast attribute)
  weatherForecastEntity: z.string().default('weather.home'),

  // Mower control
  mowerType: z.enum(['switch', 'lawn_mower', 'custom']).default('lawn_mower'),
  mowerEntity: z.string().default('lawn_mower.navimow'),
  mowerStateEntity: z.string().default('sensor.navimow_state'),
  mowerBatteryEntity: z.string().default('sensor.navimow_battery'),

  // Last mow time (if not available from mower entity)
  lastMowTimeEntity: z.string().default(''),

  // Sun entity (usually fixed)
  sunEntity: z.string().default('sun.sun'),
});

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

  // Mowing windows
  mowingWindows: MowingWindowsSchema.default({}),

  // Home Assistant entity groups (multiple sensors per metric, median aggregated)
  entityGroups: EntityGroupsSchema.default({}),

  // HA Input Helpers (optional)
  haInputHelpers: HAInputHelpersSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// Validate and parse config, falling back to defaults
export function parseConfig(input: unknown): AppConfig {
  return AppConfigSchema.parse(input);
}
