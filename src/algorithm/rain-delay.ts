import { AppConfig } from '../config/schema';
import { HourlyWeather } from '../weather/service';

/**
 * Rain Delay Model (Algorithm 2) - Research-Backed
 *
 * Key research findings:
 * - Field capacity: sand 15-25%, loam 35-45%, clay 45-55% (Cornell Extension)
 * - Drainage time: sand ~hours, loam 1-3 days, clay 2-3 days
 * - Robot mowers: 30-60 lbs, low compaction risk (<1000 kPa at 5cm depth)
 * - Soil compaction threshold: >1035 kPa restricts roots, safe <200 PSI
 * - Light rain (<2.5mm): 4-6h delay
 * - Moderate rain (2.5-7.5mm): 24h delay
 * - Heavy rain (>7.5mm): 48h delay
 * - Soil moisture decay follows exponential: SWC = A * e^(-t/τ) + θ_res
 * - Drying time constant τ: sand ~24h, loam ~72h, clay ~168h
 *
 * Formula: delay_hours = base_delay * soil_factor * weather_factor
 *   base_delay: 12h light, 24h moderate, 48h heavy
 *   soil_factor: 0.5 (sand), 1.0 (loam), 1.5 (clay)
 *   weather_factor: 0.3-1.0 based on sun/temp drying
 */

export interface RainDelayResult {
  // Hours until earliest safe mowing time
  earliest_delay_hours: number;
  // Hours until optimal mowing time (more conservative)
  optimal_delay_hours: number;
  // Is it safe to mow now?
  is_safe_to_mow: boolean;
  // Estimated soil moisture percentage (0-100)
  estimated_soil_moisture_pct: number;
  // Field capacity for configured soil type
  field_capacity_pct: number;
  // Fixed timestamp: when soil becomes safe to mow (rain + effective delay)
  safe_to_mow_time: string | null;
  // Details about the calculation
  details: {
    last_significant_rain: string | null;
    last_rain_mm: number;
    rain_intensity: 'none' | 'light' | 'moderate' | 'heavy';
    base_delay_hours: number;
    soil_factor: number;
    weather_factor: number;
    sun_drying_reduction: number;
    temp_drying_reduction: number;
  };
}

export class RainDelayModel {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
  }

  /**
   * Calculate rain delay based on weather history.
   */
  public calculateDelay(hourlyWeather: HourlyWeather[]): RainDelayResult {
    const { rainDelayModel } = this.config;

    // Find last significant rain event
    const lastRain = this.findLastSignificantRain(hourlyWeather);

    if (!lastRain) {
      return this.noRainResult();
    }

    // Calculate rain intensity
    const intensity = this.classifyRainIntensity(lastRain.total_mm);

    // Base delay from rain intensity
    const baseDelay = this.baseDelayForIntensity(intensity);

    // Soil type factor
    const soilFactor = this.soilFactor();

    // Weather drying factors
    const hoursSinceRain = this.hoursSince(lastRain.timestamp);
    const sunFactor = this.sunDryingFactor(hourlyWeather, lastRain.timestamp);
    const tempFactor = this.tempDryingFactor(hourlyWeather, lastRain.timestamp);

    // Calculate effective delay
    const rawDelay = baseDelay * soilFactor;
    const weatherReduction = sunFactor + tempFactor;
    const weatherFactor = Math.max(0.3, 1 - weatherReduction);
    const effectiveDelay = rawDelay * weatherFactor;

    // Optimal delay is more conservative (1.5x)
    const optimalDelay = effectiveDelay * 1.5;

    // Is it safe to mow now?
    const isSafe = hoursSinceRain >= effectiveDelay;

    // Estimate current soil moisture
    const soilMoisture = this.estimateSoilMoisture(lastRain, hoursSinceRain, sunFactor, tempFactor);
    const fieldCapacity = this.fieldCapacity();

    // Compute safe-to-mow timestamp (rain_time + effective_delay)
    const safeToMowTime = new Date(lastRain.timestamp.getTime() + effectiveDelay * 3600000);

    return {
      earliest_delay_hours: Math.round(effectiveDelay * 10) / 10,
      optimal_delay_hours: Math.round(optimalDelay * 10) / 10,
      is_safe_to_mow: isSafe,
      estimated_soil_moisture_pct: Math.round(soilMoisture * 10) / 10,
      field_capacity_pct: fieldCapacity,
      safe_to_mow_time: safeToMowTime.toISOString(),
      details: {
        last_significant_rain: lastRain.timestamp.toISOString(),
        last_rain_mm: Math.round(lastRain.total_mm * 100) / 100,
        rain_intensity: intensity,
        base_delay_hours: baseDelay,
        soil_factor: soilFactor,
        weather_factor: Math.round(weatherFactor * 1000) / 1000,
        sun_drying_reduction: Math.round(sunFactor * 1000) / 1000,
        temp_drying_reduction: Math.round(tempFactor * 1000) / 1000,
      },
    };
  }

  /**
   * Find the last significant rain event (uses configurable threshold).
   */
  private findLastSignificantRain(
    hourlyWeather: HourlyWeather[],
  ): { timestamp: Date; total_mm: number } | null {
    const threshold = this.config.rainDelayModel.significantRainThreshold;

    // Group consecutive hours with rain
    const reversed = [...hourlyWeather].reverse();
    let rainStartIdx = -1;

    for (let i = 0; i < reversed.length; i++) {
      if (reversed[i].rainfall_mm > threshold) {
        rainStartIdx = i;
        break;
      }
    }

    if (rainStartIdx === -1) return null;

    // Sum consecutive rain hours INCLUDING the significant one (i <= rainStartIdx)
    // Track the timestamp of the most recent rain hour (reversed[0] is newest)
    let totalMm = 0;
    let lastTimestamp = reversed[rainStartIdx].timestamp;
    for (let i = 0; i <= rainStartIdx && i < 48; i++) {
      if (reversed[i].rainfall_mm > 0) {
        totalMm += reversed[i].rainfall_mm;
        // reversed[0] is most recent, so earlier indices = newer timestamps
        if (reversed[i].timestamp > lastTimestamp) {
          lastTimestamp = reversed[i].timestamp;
        }
      }
    }

    if (totalMm < threshold) return null;

    // Round timestamp to the top of the hour to avoid drift from bucket alignment
    const rounded = new Date(lastTimestamp);
    rounded.setUTCMinutes(0, 0, 0);

    return { timestamp: rounded, total_mm: totalMm };
  }

  /**
   * Classify rain intensity.
   */
  private classifyRainIntensity(totalMm: number): 'none' | 'light' | 'moderate' | 'heavy' {
    if (totalMm < 2.5) return 'light';
    if (totalMm < 7.5) return 'moderate';
    return 'heavy';
  }

  /**
   * Base delay in hours for rain intensity.
   * Research: light rain 4-6h, moderate 24h, heavy 48h
   * Scaled by soil type drainage characteristics.
   */
  private baseDelayForIntensity(intensity: string): number {
    const { rainDelayModel } = this.config;
    const soilFactor = this.soilFactor();
    switch (intensity) {
      case 'light': return Math.max(6, 12 * soilFactor);  // 12h base, sand=6h, loam=12h, clay=18h
      case 'moderate': return Math.max(24 * soilFactor, rainDelayModel.minDelayAfterRain);  // 24h base
      case 'heavy': return rainDelayModel.heavyRainDelay * soilFactor;  // 48h base
      default: return 0;
    }
  }

  /**
   * Soil type factor.
   * Sand: 0.5, Loam: 1.0, Clay: 1.5
   */
  private soilFactor(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 0.5;
      case 'clay': return 1.5;
      case 'loam':
      default: return 1.0;
    }
  }

  /**
   * Sun drying reduction factor (0-1).
   * More sun = faster drying = less delay needed.
   * Research: solar radiation is primary driver of evapotranspiration.
   * Reference ET: 0.25-0.5 inches/day (6-12mm/day) in summer.
   */
  private sunDryingFactor(
    hourlyWeather: HourlyWeather[],
    rainTimestamp: Date,
  ): number {
    const { rainDelayModel } = this.config;
    let totalSunHours = 0;

    for (const hour of hourlyWeather) {
      if (hour.timestamp < rainTimestamp) continue;
      // Each hour of sunshine contributes to drying
      totalSunHours += hour.sunshine_hours;
    }

    // Increased rate: 0.12 per sun hour (was 0.1)
    // Caps at 0.6 for sunny conditions (was 0.5)
    return Math.min(0.6, totalSunHours * rainDelayModel.sunDryingRate * 1.2);
  }

  /**
   * Temperature drying reduction factor (0-1).
   * Warmer = faster drying.
   * Research: ET increases ~10% per 3°C above 15°C.
   */
  private tempDryingFactor(
    hourlyWeather: HourlyWeather[],
    rainTimestamp: Date,
  ): number {
    const { rainDelayModel } = this.config;
    let warmHours = 0;

    for (const hour of hourlyWeather) {
      if (hour.timestamp < rainTimestamp) continue;
      if (hour.temperature_c > 15) {
        warmHours += (hour.temperature_c - 15) * rainDelayModel.tempDryingFactor;
      }
    }

    // Increased cap: 0.4 (was 0.5) - more realistic for typical conditions
    return Math.min(0.4, warmHours);
  }

  /**
   * Hours since a given timestamp.
   */
  private hoursSince(timestamp: Date): number {
    return (Date.now() - timestamp.getTime()) / 3600000;
  }

  /**
   * Estimate current soil moisture percentage using exponential decay model.
   * Research: SWC(t) = A * e^(-t/τ) + θ_res
   * - A = initial soil water increase from rainfall
   * - τ = drying time constant (soil-specific)
   * - θ_res = residual moisture at ~50% field capacity
   * - Weather factors modify the effective drying rate
   */
  private estimateSoilMoisture(
    rain: { total_mm: number },
    hoursSince: number,
    sunFactor: number,
    tempFactor: number,
  ): number {
    const fc = this.fieldCapacity();
    const tau = this.dryingTimeConstant();
    const thetaRes = fc * 0.5;  // Residual moisture at ~50% of field capacity

    // Initial moisture increase: ~0.5% per mm of rainfall
    const initialIncrease = rain.total_mm * 0.5;

    // Weather-modified drying rate (faster drying = smaller effective tau)
    // Sun and temp increase evapotranspiration, accelerating drying
    const weatherModifier = Math.max(0.5, 1 - (sunFactor + tempFactor) * 0.2);
    const effectiveTau = tau * weatherModifier;

    // Exponential decay model
    const currentMoisture = thetaRes + initialIncrease * Math.exp(-hoursSince / effectiveTau);

    return Math.max(5, Math.min(fc + 10, currentMoisture));
  }

  /**
   * Field capacity for soil type.
   * Research: sand 15-25%, loam 35-45%, clay 45-55% (Cornell Extension)
   */
  private fieldCapacity(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 20;  // 15-25% range
      case 'loam': return 40;  // 35-45% range
      case 'clay': return 50;  // 45-55% range
      default: return 40;
    }
  }

  /**
   * Drying time constant (tau) for exponential decay model.
   * Research: sand ~24h, loam ~72h, clay ~168h
   */
  private dryingTimeConstant(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 24;   // 1 day
      case 'loam': return 72;   // 3 days
      case 'clay': return 168;  // 7 days
      default: return 72;
    }
  }

  /**
   * Result when there's no significant rain.
   */
  private noRainResult(): RainDelayResult {
    const fc = this.fieldCapacity();
    return {
      earliest_delay_hours: 0,
      optimal_delay_hours: 0,
      is_safe_to_mow: true,
      estimated_soil_moisture_pct: fc * 0.5,  // ~50% of field capacity when dry
      field_capacity_pct: fc,
      safe_to_mow_time: null,
      details: {
        last_significant_rain: null,
        last_rain_mm: 0,
        rain_intensity: 'none',
        base_delay_hours: 0,
        soil_factor: this.soilFactor(),
        weather_factor: 1,
        sun_drying_reduction: 0,
        temp_drying_reduction: 0,
      },
    };
  }
}
