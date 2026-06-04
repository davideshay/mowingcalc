import { AppConfig } from '../config/schema';
import { HourlyWeather } from '../weather/service';

/**
 * Rain Delay Model (Algorithm 2)
 *
 * Research-backed calculation of how long to wait after rain before mowing.
 *
 * Key findings:
 * - Light rain (drizzle): 4-6 hours
 * - Moderate rain: 24 hours
 * - Heavy rain: 24-48 hours minimum
 * - Heavy rain + cloudy: 3-5 days
 * - Sandy soil: drains to field capacity within 24 hours
 * - Loam soil: 1-2 days
 * - Clay soil: 2-3+ days
 *
 * Formula: delay_hours = base_delay * soil_factor * weather_factor
 *   base_delay: 24h moderate, 48h heavy
 *   soil_factor: 0.5 (sand), 1.0 (loam), 1.5 (clay)
 *   weather_factor: 0.5 (sunny/warm), 1.0 (cloudy), 1.5 (cool/cloudy)
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

    return {
      earliest_delay_hours: Math.round(effectiveDelay * 10) / 10,
      optimal_delay_hours: Math.round(optimalDelay * 10) / 10,
      is_safe_to_mow: isSafe,
      estimated_soil_moisture_pct: Math.round(soilMoisture * 10) / 10,
      field_capacity_pct: fieldCapacity,
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
   * Find the last significant rain event (>0.5mm total).
   */
  private findLastSignificantRain(
    hourlyWeather: HourlyWeather[],
  ): { timestamp: Date; total_mm: number } | null {
    // Group consecutive hours with rain
    const reversed = [...hourlyWeather].reverse();
    let rainStartIdx = -1;

    for (let i = 0; i < reversed.length; i++) {
      if (reversed[i].rainfall_mm > 0.5) {
        rainStartIdx = i;
        break;
      }
    }

    if (rainStartIdx === -1) return null;

    // Sum consecutive rain hours
    let totalMm = 0;
    let lastTimestamp = reversed[0].timestamp;
    for (let i = 0; i < rainStartIdx && i < 48; i++) {
      if (reversed[i].rainfall_mm > 0) {
        totalMm += reversed[i].rainfall_mm;
        if (reversed[i].timestamp > lastTimestamp) {
          lastTimestamp = reversed[i].timestamp;
        }
      }
    }

    if (totalMm < 0.5) return null;

    return { timestamp: lastTimestamp, total_mm: totalMm };
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
   */
  private baseDelayForIntensity(intensity: string): number {
    const { rainDelayModel } = this.config;
    switch (intensity) {
      case 'light': return Math.max(6, rainDelayModel.minDelayAfterRain / 4);
      case 'moderate': return rainDelayModel.minDelayAfterRain;
      case 'heavy': return rainDelayModel.heavyRainDelay;
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

    return Math.min(0.5, totalSunHours * rainDelayModel.sunDryingRate);
  }

  /**
   * Temperature drying reduction factor (0-1).
   * Warmer = faster drying.
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

    return Math.min(0.5, warmHours);
  }

  /**
   * Hours since a given timestamp.
   */
  private hoursSince(timestamp: Date): number {
    return (Date.now() - timestamp.getTime()) / 3600000;
  }

  /**
   * Estimate current soil moisture percentage.
   */
  private estimateSoilMoisture(
    rain: { total_mm: number },
    hoursSince: number,
    sunFactor: number,
    tempFactor: number,
  ): number {
    // Base soil moisture ~20%
    // Rain adds ~5% per mm (simplified)
    // Drying reduces by sun/temp factors
    const baseMoisture = 20;
    const rainAddition = rain.total_mm * 5;
    const drying = (sunFactor + tempFactor) * hoursSince * 0.5;

    return Math.max(5, Math.min(50, baseMoisture + rainAddition - drying));
  }

  /**
   * Field capacity for soil type.
   */
  private fieldCapacity(): number {
    // Default: loam at 30%
    return 30;
  }

  /**
   * Result when there's no significant rain.
   */
  private noRainResult(): RainDelayResult {
    return {
      earliest_delay_hours: 0,
      optimal_delay_hours: 0,
      is_safe_to_mow: true,
      estimated_soil_moisture_pct: 20,
      field_capacity_pct: this.fieldCapacity(),
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
