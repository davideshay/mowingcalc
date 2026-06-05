import { AppConfig } from './schema';

export const DEFAULT_CONFIG: AppConfig = {
  // Grass and growth settings
  grassType: 'tall_fescue',
  growthLowerLimit: 3,    // mm - trigger if future conditions uncertain
  growthUpperLimit: 6,    // mm - trigger immediately if exceeded
  growthModel: {
    baseRatePerDay: 0.7,   // mm/day for tall fescue
    rainMultiplier: 0.2,   // mm growth per 1mm rainfall
    tempOptimalMin: 15,    // C
    tempOptimalMax: 25,    // C
    sunGrowthBoost: 0.15,  // 15% boost with adequate sun
  },

  // Rain delay settings
  rainDelayModel: {
    minDelayAfterRain: 24,       // hours - configurable minimum
    heavyRainDelay: 48,          // hours after heavy rain
    sunDryingRate: 0.1,          // reduction factor per hour of sun
    tempDryingFactor: 0.05,      // reduction per degree above 15C
    soilType: 'loam',            // soil type for drying calculations
  },

  // Time constraints
  minTimeBetweenMows: 48,   // hours
  maxTimeBetweenMows: 168,  // hours (7 days - emergency trigger)
  avgMowingDuration: 90,    // minutes

  // Algorithm timing
  algorithmRunInterval: 15, // minutes
  weatherCacheTTL: 30,      // minutes

  // Weather thresholds
  maxPrecipitationChance: 30, // % - don't mow if forecast exceeds this

  // Forecast lookahead (mow proactively if rain is coming in next N days)
  forecastLookaheadDays: 3,

  // Home Assistant connection (can also be set via HA_URL/HA_TOKEN env vars)
  haUrl: '',
  haToken: '',

  // Mowing time windows (will be expanded with sunset-relative notation)
  mowingWindows: {
    monday: [{ start: '08:00', end: '18:00' }],
    tuesday: [{ start: '08:00', end: '18:00' }],
    wednesday: [{ start: '08:00', end: '18:00' }],
    thursday: [{ start: '08:00', end: '18:00' }],
    friday: [{ start: '08:00', end: '18:00' }],
    saturday: [{ start: '08:00', end: '20:00' }],
    sunday: [{ start: '08:00', end: '20:00' }],
  },

  // Home Assistant entity groups - multiple sensors per metric
  // Median aggregation is used across all sensors in each group
  // to avoid outliers from individual sensors
  entityGroups: {
    // Rainfall sensors (historical, past 7 days)
    // Examples: sensor.weather_station_rain, sensor.nws_precipitation, etc.
    rainfallSensors: [],

    // Temperature sensors (historical)
    temperatureSensors: [],

    // Sunshine/UV sensors (historical)
    sunshineSensors: [],

    // Humidity sensors (historical)
    humiditySensors: [],

    // Wind speed sensors (historical) - used for drying calculation
    windSpeedSensors: [],

    // Weather forecast entity (hourly/daily forecast)
    weatherForecastEntity: 'weather.home',

    // Mower control
    mowerType: 'lawn_mower',
    mowerEntity: 'lawn_mower.navimow',
    mowerStateEntity: 'sensor.navimow_state',
    mowerBatteryEntity: 'sensor.navimow_battery',

    // Last mow time (if not available from mower entity)
    lastMowTimeEntity: '',

    // Sun entity (usually fixed, provides sunset/sunrise)
    sunEntity: 'sun.sun',
  },

  // HA Input Helpers (optional)
  haInputHelpers: {
    enabled: false,
    nextMowNumber: 'input_number.next_predicted_mow',
    growthEstimateNumber: 'input_number.growth_estimate_mm',
    rainDelayNumber: 'input_number.rain_delay_hours',
    mowRecommendedBoolean: 'input_boolean.mow_recommended',
    mowReasonSelect: 'input_select.mow_reason',
  },
};
