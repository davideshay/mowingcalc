import { AppConfig } from '../config/schema';
import { HourlyWeather } from '../weather/service';
import { SoilMoistureTracker } from './soil-moisture';

// Research-backed grass growth model based on:
// 1. GCSAA Growth Potential (temperature response curve) - PACE Turf / Gelernter & Stowell
// 2. Asian Turfgrass Center (rainfall/moisture effect) - Micah Woods
// 3. USGA Crop Coefficients (species-specific scaling)
// 4. Soil texture effects (nutrient/water holding)
// 5. Photoperiod/seasonal dormancy (latitude-based)
// 6. Solar radiation (sunshine hours)

export interface GrowthResult {
  daily_growth_mm: number;
  growth_since_mow_mm: number;
  gp_factor: number;
  moisture_factor: number;
  sun_factor: number;
  soil_factor: number;
  seasonal_factor: number;
  // NEW: Temperature diagnostics
  avg_temperature_c: number;
  min_temperature_c: number;
  max_temperature_c: number;
  gp_sd: number;
  gp_optimal_temp: number;
  // NEW: Growth formula breakdown
  base_rate_daily: number;
  total_hours_processed: number;
  hourly_breakdown: HourlyGrowth[];
}

export interface HourlyGrowth {
  timestamp: Date;
  growth_mm: number;
  temperature_c: number;
  rainfall_mm: number;
  gp_factor: number;
  moisture_factor: number;
  sun_factor: number;
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
   * Model: daily_growth_mm = baseRate * GP_factor * moisture_factor * sun_factor * soil_factor * seasonal_factor
   *
   * GP_factor: GCSAA Growth Potential from temperature (primary driver)
   *   GP = exp(-0.5 * ((obsT - optT) / sd)^2)
   *   Cool-season: optT=20C, sd=5.56C (10F)
   *   Warm-season: optT=31C, sd=7.3C (12F)
   *
   * moisture_factor: Per-hour soil moisture effect (0.3-1.5)
   *   When a SoilMoistureTracker is provided, computes moisture at each hour.
   *   Otherwise uses the current snapshot as a constant (less accurate).
   *   Below wilting point: 0.3 (severe stress)
   *   Wilting point to field capacity: linear interpolation
   *   At field capacity: 1.0 (optimal)
   *   Above field capacity: up to 1.5 (post-rain boost)
   *
   * sun_factor: Solar radiation boost (1.0 to 1.0 + sunGrowthBoost)
   *   Based on hourly sunshine_hours data
   *
   * soil_factor: Soil type x species interaction (0.7-1.2)
   *   Sand: 0.85 (poor nutrient retention)
   *   Loam: 1.00 (optimal balance)
   *   Clay: 0.90 (good nutrients, poor drainage)
   *
   * seasonal_factor: Photoperiod/dormancy adjustment (0.0-1.0)
   *   Computed per-hour based on day-of-year
   *   Cool-season: bimodal (spring/fall peaks, summer/winter dormancy)
   *   Warm-season: unimodal (summer peak, winter dormancy)
   */
  public calculateGrowth(
    hourlyWeather: HourlyWeather[],
    lastMowTime: Date | null,
    soilTracker?: SoilMoistureTracker,
  ): GrowthResult {
    const { growthModel } = this.config;
    const { baseRatePerDay, rainMultiplier, sunGrowthBoost, soilType, latitude } = growthModel;

    const hourlyBreakdown: HourlyGrowth[] = [];
    let totalGrowth = 0;
    let sumTemp = 0;
    let minTemp = Infinity;
    let maxTemp = -Infinity;

    // Research-backed sd and optimal temp
    const isWarmSeason = growthModel.tempOptimalMin >= 25;
    const sd = isWarmSeason ? 7.3 : 5.56;
    const optT =
      growthModel.tempOptimalMin +
      (growthModel.tempOptimalMax - growthModel.tempOptimalMin) / 2;

    // Pre-calculate factors that are the same for all hours
    const seasonalFactorToday = this.calculateSeasonalFactor(latitude);
    const soilFactor = this.calculateSoilFactor(soilType);

    // Fallback moisture factor (constant, when no tracker provided)
    // Defaults to wilting point (conservative = drought) when no data available.
    const fallbackMoistureFactor = (() => {
      const { fc, wp } = this.getSoilMoistureBounds(growthModel.soilType);
      return this.moistureFactorFromVWC(wp);
    })();

    // Pre-pass: compute average temperature from buckets that have real sensor data.
    // Uninitialized hourly buckets are filled with all zeros (temp=0, rain=0, sun=0).
    // Checking whether ANY field is non-zero distinguishes real data from blanks,
    // and avoids excluding legitimate cold readings (-2C to 1C) in winter.
    const hasRealData = (h: HourlyWeather) =>
      h.temperature_c > 0 || h.temperature_c < -1 || h.rainfall_mm > 0 || h.sunshine_hours > 0;
    const validTemps = hourlyWeather.filter(hasRealData);
    const avgTemp = validTemps.length > 0
      ? validTemps.reduce((sum, h) => sum + h.temperature_c, 0) / validTemps.length
      : optT;

    // GCSAA Growth Potential is designed for daily average temperature, not hourly.
    // The original research (Gelernter & Stowell) used daily mean temp to compute GP,
    // which naturally smooths out diurnal variation. Applying GP hourly with sd=5.56
    // penalizes every nighttime hour (15-18C is 2-5C from optimal 20C), suppressing
    // growth by 10-40% per hour and producing unrealistically low daily totals.
    const gpFactorDaily = this.calculateGPFactor(avgTemp);

    for (const hour of hourlyWeather) {
      // Track temperature stats (replace blank-bucket values with avg)
      const temp = (hour.temperature_c >= -1 && hour.temperature_c <= 0 && hour.rainfall_mm === 0 && hour.sunshine_hours === 0)
        ? avgTemp : hour.temperature_c;
      sumTemp += temp;
      if (temp < minTemp) minTemp = temp;
      if (temp > maxTemp) maxTemp = temp;

      // Sun factor varies hourly
      const sunFactor = this.calculateSunFactor(hour.sunshine_hours, sunGrowthBoost);

      // Seasonal factor varies by day-of-year — compute per-hour for accuracy
      // during spring/fall transitions (can shift 5-15% over a week)
      const seasonalFactor = this.calculateSeasonalFactor(latitude, hour.timestamp);

      // Moisture factor: per-hour when tracker available, constant fallback otherwise
      const moistureFactor = soilTracker
        ? this.moistureFactorFromVWC(soilTracker.computeMoistureAt(hourlyWeather, hour.timestamp))
        : fallbackMoistureFactor;

      // Hourly growth rate using the DAILY GP factor (not per-hour GP).
      // GP captures overall temperature suitability — it does not fluctuate hourly.
      const hourlyGrowth =
        (baseRatePerDay / 24) *
        gpFactorDaily *
        moistureFactor *
        sunFactor *
        soilFactor *
        seasonalFactor;

      // Rainfall-driven growth: each mm of rain adds direct growth
      // (separate from moisture factor which captures ongoing soil moisture effect)
      const rainGrowth = hour.rainfall_mm * rainMultiplier;

      const totalHourlyGrowth = hourlyGrowth + rainGrowth;

      hourlyBreakdown.push({
        timestamp: hour.timestamp,
        growth_mm: Math.round(totalHourlyGrowth * 1000) / 1000,
        temperature_c: hour.temperature_c,
        rainfall_mm: hour.rainfall_mm,
        gp_factor: Math.round(gpFactorDaily * 1000) / 1000,
        moisture_factor: Math.round(moistureFactor * 1000) / 1000,
        sun_factor: Math.round(sunFactor * 1000) / 1000,
      });

      if (lastMowTime === null || hour.timestamp >= lastMowTime) {
        totalGrowth += totalHourlyGrowth;
      }
    }

    // Daily growth rate (average over hours since last mow)
    let activeHours = hourlyWeather.length || 1;
    if (lastMowTime) {
      activeHours = hourlyWeather.filter((h) => h.timestamp >= lastMowTime).length || 1;
    }
    const dailyGrowth = (totalGrowth / activeHours) * 24;

    const n = hourlyWeather.length || 1;

    return {
      daily_growth_mm: Math.round(dailyGrowth * 100) / 100,
      growth_since_mow_mm: Math.round(totalGrowth * 100) / 100,
      gp_factor: Math.round(gpFactorDaily * 1000) / 1000,
      moisture_factor: Math.round(fallbackMoistureFactor * 1000) / 1000,
      sun_factor: Math.round(
        this.calculateSunFactor(
          hourlyWeather[hourlyWeather.length - 1]?.sunshine_hours ?? 0,
          sunGrowthBoost,
        ) * 1000,
      ) / 1000,
      soil_factor: Math.round(soilFactor * 1000) / 1000,
      seasonal_factor: Math.round(seasonalFactorToday * 1000) / 1000,
      // NEW diagnostics
      avg_temperature_c: Math.round((sumTemp / n) * 10) / 10,
      min_temperature_c: Math.round(minTemp * 10) / 10,
      max_temperature_c: Math.round(maxTemp * 10) / 10,
      gp_sd: sd,
      gp_optimal_temp: Math.round(optT * 10) / 10,
      base_rate_daily: baseRatePerDay,
      total_hours_processed: n,
      hourly_breakdown: hourlyBreakdown,
    };
  }

  /**
   * GCSAA Growth Potential factor from temperature.
   * GP = exp(-0.5 * ((obsT - optT) / sd)^2)
   * Returns value 0-1 (normalized from 0-100 scale).
   *
   * Uses research-backed standard deviations:
   * - Cool-season: sd = 5.56C (10F)
   * - Warm-season: sd = 7.3C (12F)
   */
  private calculateGPFactor(tempC: number): number {
    const { growthModel } = this.config;
    const optT =
      growthModel.tempOptimalMin +
      (growthModel.tempOptimalMax - growthModel.tempOptimalMin) / 2;

    // Research-backed sd: use 5.56C for cool-season, 7.3C for warm-season
    // Determine season type based on optimal temp range
    const isWarmSeason = growthModel.tempOptimalMin >= 25;
    const sd = isWarmSeason ? 7.3 : 5.56;

    const gp = Math.exp(-0.5 * Math.pow((tempC - optT) / sd, 2));
    return Math.min(1, Math.max(0, gp));
  }

  /**
   * Moisture factor from current VWC estimate.
   *
   * vwcPct can be either:
   * - A number: the current VWC percentage from SoilMoistureTracker
   * - A soil type string: fallback when no tracker available
   */
  private moistureFactorFromVWC(vwcPct: number | string): number {
    // If vwcPct is a string (soil type), default to field capacity
    const soilType = typeof vwcPct === 'string' ? vwcPct : this.config.growthModel.soilType;
    const { fc, wp } = this.getSoilMoistureBounds(soilType);

    const vwc = typeof vwcPct === 'number' ? vwcPct : fc;

    // Map VWC to growth factor
    if (vwc <= wp) {
      return 0.3; // Severe water stress
    } else if (vwc >= fc) {
      // At or above field capacity - post-rain growth boost
      const excess = Math.min((vwc - fc) / fc, 0.5); // Cap at 50% excess
      return Math.min(1.0 + excess * 0.5, 1.5); // Up to 1.5x boost
    } else {
      // Between wilting point and field capacity - linear interpolation
      const ratio = (vwc - wp) / (fc - wp);
      return 0.3 + ratio * 0.7; // 0.3 to 1.0
    }
  }

  /**
   * Field capacity and wilting point by soil type.
   * From USGA and extension service research.
   */
  private getSoilMoistureBounds(soilType: string): { fc: number; wp: number } {
    switch (soilType) {
      case 'sand':
        return { fc: 20, wp: 5 }; // Low water holding
      case 'clay':
        return { fc: 50, wp: 20 }; // High water holding, high wilting point
      case 'loam':
      default:
        return { fc: 40, wp: 12 }; // Optimal balance
    }
  }

  /**
   * Sun factor from sunshine hours.
   * Applies sunGrowthBoost based on current sunshine.
   *
   * sunshine_hours = 1 (sunny) -> full boost
   * sunshine_hours = 0 (cloudy) -> no boost
   * Partial values -> proportional boost
   */
  private calculateSunFactor(sunshineHours: number, sunGrowthBoost: number): number {
    const sunFraction = Math.min(sunshineHours, 1); // Normalize to 0-1
    return 1 + sunFraction * sunGrowthBoost;
  }

  /**
   * Soil factor based on soil type.
   * Accounts for nutrient availability and drainage effects on growth.
   *
   * Sand: 0.85 - poor nutrient retention, but good drainage/aeration
   * Loam: 1.00 - optimal balance of nutrients, water, and aeration
   * Clay: 0.90 - good nutrient retention, but poor drainage/aeration
   */
  private calculateSoilFactor(soilType: string): number {
    switch (soilType) {
      case 'sand':
        return 0.85;
      case 'clay':
        return 0.90;
      case 'loam':
      default:
        return 1.0;
    }
  }

  /**
   * Seasonal factor based on photoperiod/dormancy.
   *
   * Uses a bimodal curve for cool-season grasses (spring/fall peaks)
   * and unimodal curve for warm-season grasses (summer peak).
   *
   * Based on latitude and day of year.
   * At latitude 0 (equator): no seasonal variation (factor = 1.0 always)
   * At higher latitudes: more pronounced seasonal variation
   */
  private calculateSeasonalFactor(latitude: number, date?: Date): number {
    // Determine grass season type based on optimal temp range
    const isWarmSeason = this.config.growthModel.tempOptimalMin >= 25;

    // Use provided date (for historical hours) or current time
    const now = date ?? new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Latitude effect: higher latitudes = more seasonal variation
    const latFactor = Math.min(Math.abs(latitude) / 60, 1); // 0 at equator, 1 at 60+

    if (isWarmSeason) {
      // Warm-season: unimodal curve (summer peak)
      // Peak at day 180 (June solstice), dormant in winter
      const peakDay = 180;
      const daysFromPeak = Math.abs(dayOfYear - peakDay);
      // Gaussian with wide spread (90 days)
      const seasonalFactor = Math.exp(
        -0.5 * Math.pow(daysFromPeak / 90, 2),
      );

      // Blend with no-seasonal based on latitude
      return 1 - latFactor * (1 - seasonalFactor);
    } else {
      // Cool-season: bimodal curve (spring and fall peaks)
      // Spring peak: day 125 (late April) — tall fescue/KY bluegrass peak growth period
      // Fall peak: day 295 (late October) — second growth surge
      const springPeak = 125;
      const fallPeak = 295;

      const springFactor = Math.exp(
        -0.5 * Math.pow((dayOfYear - springPeak) / 60, 2),
      );
      const fallFactor = Math.exp(
        -0.5 * Math.pow((dayOfYear - fallPeak) / 60, 2),
      );

      // Combine peaks with baseline
      const bimodal = 0.4 + 0.6 * Math.max(springFactor, fallFactor);

      // Blend with no-seasonal based on latitude
      return 1 - latFactor * (1 - bimodal);
    }
  }
}
