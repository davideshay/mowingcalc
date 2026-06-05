import pino from 'pino';
import Database from 'better-sqlite3';
import { AppConfig } from '../config/schema';
import { HAClient } from '../ha/client';
import { WeatherService, HourlyWeather } from '../weather/service';
import { GrowthModel, GrowthResult } from './growth-model';
import { RainDelayModel, RainDelayResult } from './rain-delay';

const logger = pino({ level: 'info' });

export interface DecisionResult {
  should_mow: boolean;
  reason: string;
  growth_estimate: GrowthResult;
  rain_delay: RainDelayResult;
  last_mow_time: Date | null;
  hours_since_mow: number;
  next_review_time: Date;
  forecast_safe: boolean;
}

export class DecisionEngine {
  private db: Database.Database;
  private ha: HAClient | null;
  private weather: WeatherService;
  private growth: GrowthModel;
  private rainDelay: RainDelayModel;
  private config: AppConfig;

  constructor(db: Database.Database, ha: HAClient | null, config: AppConfig) {
    this.db = db;
    this.ha = ha;
    this.config = config;
    this.weather = new WeatherService(ha!, db, config);
    this.growth = new GrowthModel(config);
    this.rainDelay = new RainDelayModel(config);
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
    this.weather.updateConfig(config);
    this.growth.updateConfig(config);
    this.rainDelay.updateConfig(config);
  }

  /**
   * Main decision logic following requirements.md algorithm steps.
   */
  public async run(): Promise<DecisionResult> {
    const { growthLowerLimit, growthUpperLimit, minTimeBetweenMows, maxTimeBetweenMows } = this.config;
    const { avgMowingDuration, maxPrecipitationChance, forecastLookaheadDays } = this.config;

    // 1. Get last mow time from HA
    const lastMowTime = await this.getLastMowTime();
    const hoursSinceMow = lastMowTime ? (Date.now() - lastMowTime.getTime()) / 3600000 : 999;

    // 2. Get weather data (past 7 days)
    const weatherSummary = await this.weather.getHistoricalWeather(168);
    const hourly = weatherSummary.hourly;

    // 3. Calculate grass growth
    const growth = this.growth.calculateGrowth(hourly, lastMowTime);

    // 4. Calculate rain delay
    const rainDelay = this.rainDelay.calculateDelay(hourly);

    // 5. Check forecast for next N hours (avg mowing duration + buffer)
    const forecastHours = Math.ceil(avgMowingDuration / 60) + 1;
    const forecastSafe = await this.checkForecast(forecastHours, maxPrecipitationChance);

    // 5b. Check weekly forecast lookahead (should we mow proactively?)
    const rainComingSoon = await this.checkForecastLookahead(forecastLookaheadDays, maxPrecipitationChance);

    // 6. Check mowing window
    const inMowingWindow = this.isInMowingWindow();

    // 7. Apply decision logic (requirements.md order)
    const decision = this.applyDecisionLogic({
      growth,
      rainDelay,
      lastMowTime,
      hoursSinceMow,
      forecastSafe,
      rainComingSoon,
      inMowingWindow,
      growthLowerLimit,
      growthUpperLimit,
      minTimeBetweenMows,
      maxTimeBetweenMows,
    });

    // 8. Persist to DB
    this.saveToDb(decision, growth, rainDelay);

    return decision;
  }

  private applyDecisionLogic(params: {
    growth: GrowthResult;
    rainDelay: RainDelayResult;
    lastMowTime: Date | null;
    hoursSinceMow: number;
    forecastSafe: boolean;
    rainComingSoon: boolean;
    inMowingWindow: boolean;
    growthLowerLimit: number;
    growthUpperLimit: number;
    minTimeBetweenMows: number;
    maxTimeBetweenMows: number;
  }): DecisionResult {
    const { growth, rainDelay, hoursSinceMow, forecastSafe, rainComingSoon, inMowingWindow } = params;
    const { growthLowerLimit, growthUpperLimit, minTimeBetweenMows, maxTimeBetweenMows } = params;
    const growthMm = growth.growth_since_mow_mm;

    // Check 1: Not in mowing window -> wait
    if (!inMowingWindow) {
      return this.noMow('Outside mowing time window', growth, rainDelay, params.lastMowTime, hoursSinceMow);
    }

    // Check 2: Rain delay not satisfied -> wait
    if (!rainDelay.is_safe_to_mow) {
      const remaining = Math.max(0, rainDelay.earliest_delay_hours - hoursSinceMow);
      return this.noMow(
        `Soil still too wet. ${remaining.toFixed(1)}h remaining before safe to mow`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    // Check 3: Min time between mows not met -> wait
    if (hoursSinceMow < minTimeBetweenMows) {
      const remaining = minTimeBetweenMows - hoursSinceMow;
      return this.noMow(
        `Too soon since last mow. ${remaining.toFixed(1)}h until minimum interval met`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    // Check 4: Max time exceeded + forecast safe -> EMERGENCY MOW
    if (hoursSinceMow >= maxTimeBetweenMows && forecastSafe) {
      return this.mow('Maximum time since last mow exceeded - emergency mow', growth, rainDelay, params.lastMowTime, hoursSinceMow);
    }

    // Check 5: Growth below lower limit -> wait
    if (growthMm < growthLowerLimit) {
      return this.noMow(
        `Growth estimate ${growthMm.toFixed(1)}mm below lower limit ${growthLowerLimit}mm`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    // Check 6: Growth above upper limit + forecast safe -> MOW NOW
    if (growthMm >= growthUpperLimit && forecastSafe) {
      return this.mow(
        `Growth estimate ${growthMm.toFixed(1)}mm exceeds upper limit ${growthUpperLimit}mm`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    // Check 7: Growth above lower limit + rain coming soon -> MOW PROACTIVELY
    // This is the new lookahead logic: if we have enough growth AND rain is coming,
    // mow now before the rain makes the soil too wet
    if (growthMm >= growthLowerLimit && rainComingSoon) {
      return this.mow(
        `Proactive mow: growth ${growthMm.toFixed(1)}mm with rain expected - mow before soil gets wet`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    // Check 8: Growth above lower limit, predict crossing upper limit
    // If forecast safe for predicted window -> wait, else mow now
    if (growthMm >= growthLowerLimit && forecastSafe) {
      return this.noMow(
        `Growth ${growthMm.toFixed(1)}mm above lower limit but forecast is clear - will recheck`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    if (growthMm >= growthLowerLimit && !forecastSafe) {
      return this.mow(
        `Growth ${growthMm.toFixed(1)}mm with uncertain forecast - mow before rain`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    return this.noMow('Waiting for growth threshold', growth, rainDelay, params.lastMowTime, hoursSinceMow);
  }

  private mow(reason: string, growth: GrowthResult, rainDelay: RainDelayResult, lastMow: Date | null, hoursSinceMow: number): DecisionResult {
    return {
      should_mow: true,
      reason,
      growth_estimate: growth,
      rain_delay: rainDelay,
      last_mow_time: lastMow,
      hours_since_mow: hoursSinceMow,
      next_review_time: new Date(Date.now() + 30 * 60000),
      forecast_safe: true,
    };
  }

  private noMow(reason: string, growth: GrowthResult, rainDelay: RainDelayResult, lastMow: Date | null, hoursSinceMow: number): DecisionResult {
    return {
      should_mow: false,
      reason,
      growth_estimate: growth,
      rain_delay: rainDelay,
      last_mow_time: lastMow,
      hours_since_mow: hoursSinceMow,
      next_review_time: new Date(Date.now() + this.config.algorithmRunInterval * 60000),
      forecast_safe: false,
    };
  }

  private async getLastMowTime(): Promise<Date | null> {
    if (!this.ha) return null;
    try {
      const entity = this.config.entityGroups.lastMowTimeEntity;
      if (!entity) return null;
      const state = await this.ha.getEntityState(entity);
      const parsed = new Date(state.state);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  private async checkForecast(hours: number, maxChance: number): Promise<boolean> {
    if (!this.ha) return true; // No HA = assume safe
    try {
      const forecast = await this.ha.getWeatherForecast(
        this.config.entityGroups.weatherForecastEntity,
        'hourly',
      );
      for (let i = 0; i < hours && i < forecast.length; i++) {
        const p = forecast[i].precipitation_probability;
        if (p !== undefined && p > maxChance) return false;
      }
      return true;
    } catch {
      return true; // No forecast available = proceed
    }
  }

  /**
   * Look ahead using hourly forecast for first 24 hours, then daily forecast beyond that.
   * Returns true if there's a significant chance of rain, meaning we should consider
   * mowing now if growth is sufficient.
   */
  private async checkForecastLookahead(days: number, maxChance: number): Promise<boolean> {
    if (!this.ha) return false; // No HA = can't lookahead
    try {
      // Get both hourly and daily forecasts in parallel
      const [hourlyForecast, dailyForecast] = await Promise.all([
        this.ha.getWeatherForecast(this.config.entityGroups.weatherForecastEntity, 'hourly').catch(() => []),
        this.ha.getWeatherForecast(this.config.entityGroups.weatherForecastEntity, 'daily').catch(() => []),
      ]);

      // First 24 hours: use hourly forecast for precision
      const hoursToCheck = Math.min(24, Math.ceil(days * 24));
      let rainHours = 0;
      let consecutiveRainHours = 0;
      let maxConsecutiveRainHours = 0;

      for (let i = 0; i < hoursToCheck && i < hourlyForecast.length; i++) {
        const p = hourlyForecast[i].precipitation_probability;
        if (p !== undefined && p > maxChance) {
          rainHours++;
          consecutiveRainHours++;
          maxConsecutiveRainHours = Math.max(maxConsecutiveRainHours, consecutiveRainHours);
        } else {
          consecutiveRainHours = 0;
        }
      }

      // Beyond 24 hours: use daily forecast
      let rainDays = 0;
      let consecutiveRainDays = 0;
      let maxConsecutiveRainDays = 0;

      // Skip today (index 0) - we already checked 24h with hourly
      for (let i = 1; i < days && i < dailyForecast.length; i++) {
        const p = dailyForecast[i].precipitation_probability;
        if (p !== undefined && p > maxChance) {
          rainDays++;
          consecutiveRainDays++;
          maxConsecutiveRainDays = Math.max(maxConsecutiveRainDays, consecutiveRainDays);
        } else {
          consecutiveRainDays = 0;
        }
      }

      // Return true if rain is coming:
      // - At least 3 consecutive hours of rain in next 24h, OR
      // - At least 2 consecutive days of rain beyond 24h, OR
      // - More than half the daily forecast has rain
      return (
        maxConsecutiveRainHours >= 3 ||
        maxConsecutiveRainDays >= 2 ||
        (dailyForecast.length > 1 && rainDays > (days - 1) / 2)
      );
    } catch {
      return false; // No forecast available = can't lookahead
    }
  }

  private isInMowingWindow(): boolean {
    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const day = dayNames[now.getDay()];
    const windows = this.config.mowingWindows[day as keyof typeof this.config.mowingWindows];

    if (!windows || windows.length === 0) return true;

    const currentMin = now.getHours() * 60 + now.getMinutes();
    for (const w of windows) {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      if (currentMin >= sh * 60 + sm && currentMin <= eh * 60 + em) return true;
    }
    return false;
  }

  private saveToDb(result: DecisionResult, growth: GrowthResult, rainDelay: RainDelayResult): void {
    const runStmt = this.db.prepare(`
      INSERT INTO algorithm_runs (run_time, growth_estimate, rain_delay_hours, decision, decision_reason, next_run_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    runStmt.run(
      new Date().toISOString(),
      growth.growth_since_mow_mm,
      rainDelay.is_safe_to_mow ? 0 : rainDelay.earliest_delay_hours,
      result.should_mow ? 'mow' : 'wait',
      result.reason,
      result.next_review_time.toISOString(),
    );

    const growthStmt = this.db.prepare(`
      INSERT INTO growth_history (timestamp, growth_mm, since_last_mow)
      VALUES (?, ?, 1)
    `);
    growthStmt.run(new Date().toISOString(), growth.growth_since_mow_mm);
  }

  /**
   * Trigger the mower based on mower type config.
   */
  public async triggerMower(): Promise<void> {
    if (!this.ha) {
      throw new Error('HA client not available');
    }

    const { mowerType, mowerEntity } = this.config.entityGroups;

    // Record mow start event
    const eventStmt = this.db.prepare(`
      INSERT INTO mow_events (started_at, duration_minutes, decision_reason)
      VALUES (?, ?, ?)
    `);
    eventStmt.run(
      new Date().toISOString(),
      this.config.avgMowingDuration,
      'Algorithm triggered mow',
    );

    switch (mowerType) {
      case 'lawn_mower':
        await this.ha.startMowing(mowerEntity);
        break;
      case 'switch':
        await this.ha.triggerMowerOn(mowerEntity);
        break;
      case 'custom':
        // Custom - would need additional config for service call
        logger.warn('Custom mower type not yet implemented');
        break;
      default:
        throw new Error(`Unknown mower type: ${mowerType}`);
    }

    logger.info({ mowerEntity, mowerType }, 'Mower triggered successfully');
  }

  /**
   * Get current mower state.
   */
  public async getMowerState(): Promise<Record<string, unknown>> {
    if (!this.ha) {
      return { available: false };
    }

    const { mowerEntity, mowerStateEntity, mowerBatteryEntity } = this.config.entityGroups;

    const state: Record<string, unknown> = { available: true };

    try {
      const mowerState = await this.ha.getMowerState(mowerEntity);
      state.state = mowerState.state;
    } catch {
      state.state = 'unavailable';
    }

    try {
      const battery = await this.ha.getBatteryLevel(mowerBatteryEntity);
      if (battery !== null) state.battery_pct = battery;
    } catch {
      // Battery unavailable
    }

    return state;
  }

  /**
   * Write algorithm predictions to HA input helpers.
   */
  public async writeToHAHelpers(result: DecisionResult): Promise<void> {
    if (!this.ha || !this.config.haInputHelpers.enabled) {
      return;
    }

    const helpers = this.config.haInputHelpers;

    try {
      // Growth estimate
      await this.ha.writeInputNumber(helpers.growthEstimateNumber, result.growth_estimate.growth_since_mow_mm);

      // Rain delay hours
      await this.ha.writeInputNumber(helpers.rainDelayNumber, result.rain_delay.earliest_delay_hours);

      // Mow recommended
      await this.ha.writeInputBoolean(helpers.mowRecommendedBoolean, result.should_mow);

      // Mow reason
      await this.ha.writeInputSelect(helpers.mowReasonSelect, result.reason);

      logger.info('HA input helpers updated');
    } catch (err) {
      logger.warn({ err }, 'Failed to update HA input helpers');
    }
  }
}
