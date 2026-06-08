import { AppConfig } from '../config/schema';
import { HourlyWeather } from '../weather/service';

export interface RainDelayResult {
  earliest_delay_hours: number;
  optimal_delay_hours: number;
  is_safe_to_mow: boolean;
  estimated_soil_moisture_pct: number;
  field_capacity_pct: number;
  safe_to_mow_time: string | null;
  details: {
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
}

export class RainDelayModel {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
  }

  public calculateDelay(hourlyWeather: HourlyWeather[]): RainDelayResult {
    const lastRain = this.findLastSignificantRain(hourlyWeather);

    if (!lastRain) {
      return this.noRainResult();
    }

    const intensity = this.classifyRainIntensity(hourlyWeather, lastRain.timestamp);
    const hoursSinceRain = this.hoursSince(lastRain.timestamp);
    const sunFactor = this.sunDryingFactor(hourlyWeather, lastRain.timestamp);
    const tempFactor = this.tempDryingFactor(hourlyWeather, lastRain.timestamp);

    const fieldCapacity = this.fieldCapacity();
    const tau = this.dryingTimeConstant();
    const thetaRes = fieldCapacity * 0.5;

    const weatherModifier = Math.max(0.5, 1 - (sunFactor + tempFactor) * 0.2);
    const effectiveTau = tau * weatherModifier;

    const initialMoisture = fieldCapacity + lastRain.total_mm * 0.5;

    const compactionThreshold = this.getCompactionThreshold();
    const safeMoistureThreshold = compactionThreshold * fieldCapacity;

    const surfaceDryFactor = this.config.rainDelayModel.surfaceDryFactor;
    const optimalMoistureThreshold = (1 - surfaceDryFactor) * fieldCapacity;

    const safeRatio = (safeMoistureThreshold - thetaRes) / (initialMoisture - thetaRes);
    const timeToSafe = safeRatio > 0 ? -effectiveTau * Math.log(safeRatio) : 0;

    const optimalRatio = (optimalMoistureThreshold - thetaRes) / (initialMoisture - thetaRes);
    const timeToOptimal = optimalRatio > 0 ? -effectiveTau * Math.log(optimalRatio) : 0;

    // Apply absolute bounds: floor and ceiling on the model output
    const minDelay = this.config.rainDelayModel.minDelayAfterRain;
    const maxDelay = this.config.rainDelayModel.heavyRainDelay;
    const effectiveDelay = Math.min(maxDelay, Math.max(minDelay, timeToSafe));
    const optimalDelay = Math.min(maxDelay, Math.max(minDelay * 1.25, timeToOptimal));

    const isSafe = hoursSinceRain >= effectiveDelay;
    const currentMoisture = thetaRes + (initialMoisture - thetaRes) * Math.exp(-hoursSinceRain / effectiveTau);
    const safeToMowTime = new Date(lastRain.timestamp.getTime() + effectiveDelay * 3600000);

    return {
      earliest_delay_hours: Math.round(effectiveDelay * 10) / 10,
      optimal_delay_hours: Math.round(optimalDelay * 10) / 10,
      is_safe_to_mow: isSafe,
      estimated_soil_moisture_pct: Math.round(Math.max(5, Math.min(fieldCapacity + 20, currentMoisture)) * 10) / 10,
      field_capacity_pct: fieldCapacity,
      safe_to_mow_time: safeToMowTime.toISOString(),
      details: {
        last_significant_rain: lastRain.timestamp.toISOString(),
        last_rain_mm: Math.round(lastRain.total_mm * 100) / 100,
        rain_intensity: intensity,
        hours_since_rain: Math.round(hoursSinceRain * 10) / 10,
        initial_soil_moisture_pct: Math.round(initialMoisture * 10) / 10,
        drying_time_constant: tau,
        effective_tau: Math.round(effectiveTau * 10) / 10,
        sun_drying_modifier: Math.round(sunFactor * 1000) / 1000,
        temp_drying_modifier: Math.round(tempFactor * 1000) / 1000,
        sun_drying_reduction: Math.round(sunFactor * 1000) / 1000,
        temp_drying_reduction: Math.round(tempFactor * 1000) / 1000,
        mower_weight_lbs: this.config.rainDelayModel.mowerWeightLbs,
        compaction_threshold: compactionThreshold,
        safe_moisture_threshold: Math.round(safeMoistureThreshold * 10) / 10,
        optimal_moisture_threshold: Math.round(optimalMoistureThreshold * 10) / 10,
        surface_dry_factor: surfaceDryFactor,
        time_to_safe_hours: Math.round(timeToSafe * 10) / 10,
        time_to_optimal_hours: Math.round(timeToOptimal * 10) / 10,
        min_delay_floor_hours: minDelay,
        max_delay_ceil_hours: maxDelay,
      },
    };
  }

  private getCompactionThreshold(): number {
    const weight = this.config.rainDelayModel.mowerWeightLbs;
    if (weight <= 100) return 1.05;
    if (weight >= 200) return 1.0;
    return 1.05 - (weight - 100) * 0.0005;
  }

  private findLastSignificantRain(
    hourlyWeather: HourlyWeather[],
  ): { timestamp: Date; total_mm: number } | null {
    const thresholdIn = this.config.rainDelayModel.significantRainThreshold;
    const thresholdMm = this.config.entityGroups.rainfallUnit === 'inches'
      ? thresholdIn * 25.4
      : thresholdIn;

    const reversed = [...hourlyWeather].reverse();
    let totalMm = 0;
    let lastTimestamp: Date | null = null;
    const lookbackHours = Math.min(168, reversed.length);

    for (let i = 0; i < lookbackHours; i++) {
      if (reversed[i].rainfall_mm > 0.1) {
        totalMm += reversed[i].rainfall_mm;
        if (lastTimestamp === null || reversed[i].timestamp > lastTimestamp) {
          lastTimestamp = reversed[i].timestamp;
        }
      }
    }

    if (totalMm < thresholdMm || lastTimestamp === null) return null;

    const rounded = new Date(lastTimestamp);
    rounded.setUTCMinutes(0, 0, 0);
    return { timestamp: rounded, total_mm: totalMm };
  }

  private classifyRainIntensity(
    hourlyWeather: HourlyWeather[],
    rainTimestamp: Date,
  ): 'none' | 'light' | 'moderate' | 'heavy' {
    let peakMm = 0;
    for (const h of hourlyWeather) {
      if (h.timestamp <= rainTimestamp && h.rainfall_mm > peakMm) {
        peakMm = h.rainfall_mm;
      }
    }
    if (peakMm < 2.5) return 'light';
    if (peakMm < 7.5) return 'moderate';
    return 'heavy';
  }

  private sunDryingFactor(
    hourlyWeather: HourlyWeather[],
    rainTimestamp: Date,
  ): number {
    const { rainDelayModel } = this.config;
    let totalSunHours = 0;
    for (const hour of hourlyWeather) {
      if (hour.timestamp < rainTimestamp) continue;
      totalSunHours += hour.sunshine_hours;
    }
    return Math.min(0.6, totalSunHours * rainDelayModel.sunDryingRate);
  }

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
    return Math.min(0.4, warmHours);
  }

  private hoursSince(timestamp: Date): number {
    return (Date.now() - timestamp.getTime()) / 3600000;
  }

  private fieldCapacity(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 20;
      case 'loam': return 40;
      case 'clay': return 50;
      default: return 40;
    }
  }

  private dryingTimeConstant(): number {
    const soilType = this.config.rainDelayModel.soilType;
    switch (soilType) {
      case 'sand': return 24;
      case 'loam': return 72;
      case 'clay': return 168;
      default: return 72;
    }
  }

  private noRainResult(): RainDelayResult {
    const fc = this.fieldCapacity();
    const compactionThreshold = this.getCompactionThreshold();
    const surfaceDryFactor = this.config.rainDelayModel.surfaceDryFactor;
    return {
      earliest_delay_hours: 0,
      optimal_delay_hours: 0,
      is_safe_to_mow: true,
      estimated_soil_moisture_pct: fc * 0.5,
      field_capacity_pct: fc,
      safe_to_mow_time: null,
      details: {
        last_significant_rain: null,
        last_rain_mm: 0,
        rain_intensity: 'none',
        hours_since_rain: 0,
        initial_soil_moisture_pct: 0,
        drying_time_constant: this.dryingTimeConstant(),
        effective_tau: this.dryingTimeConstant(),
        sun_drying_modifier: 0,
        temp_drying_modifier: 0,
        sun_drying_reduction: 0,
        temp_drying_reduction: 0,
        mower_weight_lbs: this.config.rainDelayModel.mowerWeightLbs,
        compaction_threshold: compactionThreshold,
        safe_moisture_threshold: Math.round(compactionThreshold * fc * 10) / 10,
        optimal_moisture_threshold: Math.round((1 - surfaceDryFactor) * fc * 10) / 10,
        surface_dry_factor: surfaceDryFactor,
        time_to_safe_hours: 0,
        time_to_optimal_hours: 0,
        min_delay_floor_hours: 0,
        max_delay_ceil_hours: 0,
      },
    };
  }
}
