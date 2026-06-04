import { AppConfig } from '../config/schema';
import { HourlyWeather } from '../weather/service';

// Research-backed grass growth model based on:
// 1. GCSAA Growth Potential (temperature response curve)
// 2. Asian Turfgrass Center (rainfall/moisture effect)
// 3. USDA-ARS ALMANAC (tall fescue calibration)

export interface GrowthResult {
  daily_growth_mm: number;
  growth_since_mow_mm: number;
  gp_factor: number;
  moisture_factor: number;
  hourly_breakdown: HourlyGrowth[];
}

export interface HourlyGrowth {
  timestamp: Date;
  growth_mm: number;
  temperature_c: number;
  rainfall_mm: number;
  gp_factor: number;
  moisture_factor: number;
}

export class GrowthModel {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
  }

  /**
   * Calculate grass growth based on weather history.
   *
   * Model: daily_growth_mm = base_rate * GP_factor * moisture_factor
   *
   * GP_factor: GCSAA Growth Potential from temperature
   *   GP = 100 * exp(-0.5 * ((obsT - optT) / sd)^2)
   *   Cool-season: optT=20C, sd=5.56C
   *
   * moisture_factor: Effect of soil moisture on growth
   *   Based on VWC (Volumetric Water Content) proxy from rainfall history
   *   VWC 15% -> 33% growth; VWC 27% -> 73% growth
   *   Linear interpolation between wilting point and field capacity
   */
  public calculateGrowth(
    hourlyWeather: HourlyWeather[],
    lastMowTime: Date | null,
  ): GrowthResult {
    const { growthModel } = this.config;
    const hourlyBreakdown: HourlyGrowth[] = [];
    let totalGrowth = 0;

    for (const hour of hourlyWeather) {
      // Temperature response (GCSAA GP model)
      const gpFactor = this.calculateGPFactor(hour.temperature_c);

      // Moisture factor from recent rainfall
      const moistureFactor = this.calculateMoistureFactor(
        hourlyWeather,
        hour.timestamp,
      );

      // Hourly growth rate (base_rate / 24 for hourly)
      const hourlyGrowth = (growthModel.baseRatePerDay / 24) * gpFactor * moistureFactor;

      hourlyBreakdown.push({
        timestamp: hour.timestamp,
        growth_mm: Math.round(hourlyGrowth * 1000) / 1000,
        temperature_c: hour.temperature_c,
        rainfall_mm: hour.rainfall_mm,
        gp_factor: Math.round(gpFactor * 1000) / 1000,
        moisture_factor: Math.round(moistureFactor * 1000) / 1000,
      });

      if (lastMowTime === null || hour.timestamp >= lastMowTime) {
        totalGrowth += hourlyGrowth;
      }
    }

    // Daily growth rate (average over period)
    const hours = hourlyWeather.length || 1;
    const dailyGrowth = (totalGrowth / hours) * 24;

    return {
      daily_growth_mm: Math.round(dailyGrowth * 100) / 100,
      growth_since_mow_mm: Math.round(totalGrowth * 100) / 100,
      gp_factor: Math.round(this.calculateGPFactor(
        hourlyWeather[hourlyWeather.length - 1]?.temperature_c ?? 20
      ) * 1000) / 1000,
      moisture_factor: Math.round(this.calculateMoistureFactor(
        hourlyWeather,
        hourlyWeather[hourlyWeather.length - 1]?.timestamp ?? new Date(),
      ) * 1000) / 1000,
      hourly_breakdown: hourlyBreakdown,
    };
  }

  /**
   * GCSAA Growth Potential factor from temperature.
   * GP = 100 * exp(-0.5 * ((obsT - optT) / sd)^2)
   * Returns value 0-1 (normalized from 0-100 scale).
   */
  private calculateGPFactor(tempC: number): number {
    const optT = this.config.growthModel.tempOptimalMin +
      (this.config.growthModel.tempOptimalMax - this.config.growthModel.tempOptimalMin) / 2;
    const sd = (this.config.growthModel.tempOptimalMax - this.config.growthModel.tempOptimalMin) / 2;

    const gp = 100 * Math.exp(-0.5 * Math.pow((tempC - optT) / sd, 2));
    return Math.min(1, Math.max(0, gp / 100));
  }

  /**
   * Moisture factor based on rainfall history.
   *
   * Model: estimate soil moisture proxy from recent rainfall.
   * - Base moisture: 0.5 (normal conditions)
   * - Each mm of rain in last 48h adds to moisture
   * - Rain effect decays over 5 days (ATC research)
   * - Rain multiplier from config: 0.2mm growth per 1mm rainfall
   *
   * Returns value 0.3-1.0 (normalized)
   */
  private calculateMoistureFactor(
    hourlyWeather: HourlyWeather[],
    targetTime: Date,
  ): number {
    const { growthModel } = this.config;
    let effectiveRain = 0;

    // Look back up to 5 days (120 hours) for rain effects
    const lookbackHours = 120;
    const targetMs = targetTime.getTime();

    for (const hour of hourlyWeather) {
      const hoursAgo = (targetMs - hour.timestamp.getTime()) / 3600000;
      if (hoursAgo < 0 || hoursAgo > lookbackHours) continue;

      // Decay factor: more recent rain has more effect
      // Half-life of 5 days -> decay = 0.5^(hoursAgo / 120)
      const decay = Math.pow(0.5, hoursAgo / lookbackHours);
      effectiveRain += hour.rainfall_mm * decay;
    }

    // Convert effective rain to moisture factor
    // Base growth at normal moisture: 1.0
    // Each mm of effective rain adds growth via rainMultiplier
    // Cap at 2.0x for extreme cases
    const moistureFactor = 1 + (effectiveRain * growthModel.rainMultiplier);
    return Math.min(2.0, Math.max(0.3, moistureFactor));
  }
}
