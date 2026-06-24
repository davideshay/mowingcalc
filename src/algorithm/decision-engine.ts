import pino from 'pino';
import Database from 'better-sqlite3';
import { AppConfig } from '../config/schema';
import { HAClient } from '../ha/client';
import { WeatherService, HourlyWeather } from '../weather/service';
import { GrowthModel, GrowthResult } from './growth-model';
import { RainDelayModel, RainDelayResult } from './rain-delay';
import { SoilMoistureTracker } from './soil-moisture';
import { WeatherSummary } from '../weather/service';

const logger = pino({ level: 'info' });

export interface DecisionResult {
  should_mow: boolean;
  reason: string;
  growth_estimate: GrowthResult;
  rain_delay: RainDelayResult;
  last_mow_time: Date | null;
  hours_since_mow: number;
  next_review_time: Date;
  predicted_next_mow: Date | null;
  forecast_safe: boolean;
}

export class DecisionEngine {
  private db: Database.Database;
  private ha: HAClient | null;
  private weather: WeatherService;
  private growth: GrowthModel;
  private rainDelay: RainDelayModel;
  private soilTracker: SoilMoistureTracker;
  private config: AppConfig;

  constructor(db: Database.Database, ha: HAClient | null, config: AppConfig) {
    this.db = db;
    this.ha = ha;
    this.config = config;
    this.weather = new WeatherService(ha!, db, config);
    this.growth = new GrowthModel(config);
    this.rainDelay = new RainDelayModel(config);
    this.soilTracker = new SoilMoistureTracker(db, config);
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
    this.weather.updateConfig(config);
    this.growth.updateConfig(config);
    this.rainDelay.updateConfig(config);
    this.soilTracker.updateConfig(config);
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

    // 3. Calculate rain delay first (updates soil moisture tracker state)
    const rainDelay = this.rainDelay.calculateDelay(hourly, this.soilTracker);

    // 4. Calculate grass growth with per-hour soil moisture from tracker
    const growth = this.growth.calculateGrowth(
      hourly,
      lastMowTime,
      this.soilTracker,
    );

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

    // 7b. Estimate predicted next mow time
    decision.predicted_next_mow = decision.should_mow
      ? null // Mowing now — prediction is moot
      : this.estimateNextMow(growth, rainDelay, lastMowTime, hoursSinceMow, growthLowerLimit, minTimeBetweenMows);

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
      return this.noMow('Outside mowing time window', growth, rainDelay, params.lastMowTime, hoursSinceMow, forecastSafe);
    }

    // Check 2: Rain delay not satisfied -> wait
    if (!rainDelay.is_safe_to_mow) {
      const lastRainTs = rainDelay.details.last_significant_rain;
      const hoursSinceRain = lastRainTs
        ? (Date.now() - new Date(lastRainTs).getTime()) / 3600000
        : 0;
      const remaining = Math.max(0, rainDelay.earliest_delay_hours - hoursSinceRain);
      return this.noMow(
        `Soil still too wet. ${remaining.toFixed(1)}h remaining before safe to mow`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow, forecastSafe,
      );
    }

    // Check 3: Min time between mows not met -> wait
    if (hoursSinceMow < minTimeBetweenMows) {
      const remaining = minTimeBetweenMows - hoursSinceMow;
      return this.noMow(
        `Too soon since last mow. ${remaining.toFixed(1)}h until minimum interval met`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow, forecastSafe,
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
        growth, rainDelay, params.lastMowTime, hoursSinceMow, forecastSafe,
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
        growth, rainDelay, params.lastMowTime, hoursSinceMow, forecastSafe,
      );
    }

    if (growthMm >= growthLowerLimit && !forecastSafe) {
      return this.mow(
        `Growth ${growthMm.toFixed(1)}mm with uncertain forecast - mow before rain`,
        growth, rainDelay, params.lastMowTime, hoursSinceMow,
      );
    }

    return this.noMow('Waiting for growth threshold', growth, rainDelay, params.lastMowTime, hoursSinceMow, params.forecastSafe);
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
      predicted_next_mow: null,
      forecast_safe: true,
    };
  }

  private noMow(reason: string, growth: GrowthResult, rainDelay: RainDelayResult, lastMow: Date | null, hoursSinceMow: number, forecastSafe: boolean): DecisionResult {
    return {
      should_mow: false,
      reason,
      growth_estimate: growth,
      rain_delay: rainDelay,
      last_mow_time: lastMow,
      hours_since_mow: hoursSinceMow,
      next_review_time: new Date(Date.now() + this.config.algorithmRunInterval * 60000),
      predicted_next_mow: null,
      forecast_safe: forecastSafe,
    };
  }

  private async getLastMowTime(): Promise<Date | null> {
    // Check config override first (takes precedence over HA entities)
    if (this.config.lastMowTimeOverride) {
      const parsed = new Date(this.config.lastMowTimeOverride);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (!this.ha) return null;

    // Read from both entities in parallel and pick the later one:
    // - lastMowTimeEntity: HA-managed entity (e.g., input_datetime set by HA automations)
    // - lastMowDatetimeEntity: App-managed entity (written by app when mow is initiated)
    const times: Date[] = [];

    const entities = [
      this.config.entityGroups.lastMowTimeEntity,
      this.config.entityGroups.lastMowDatetimeEntity,
    ].filter(Boolean);

    if (entities.length === 0) return null;

    try {
      const results = await Promise.allSettled(
        entities.map((entity) => this.ha!.getEntityState(entity)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          // HA input_datetime returns a naive datetime string (e.g. "2025-07-15T14:30:00")
          // with no timezone suffix. HA stores internally in UTC, so we need to append
          // 'Z' so JavaScript parses it as UTC rather than the server's local timezone.
          let stateStr = result.value.state;
          if (!stateStr.endsWith('Z') && !stateStr.includes('+') && !stateStr.includes('[')) {
            stateStr = stateStr + 'Z';
          }
          const parsed = new Date(stateStr);
          if (!isNaN(parsed.getTime())) {
            times.push(parsed);
          }
        }
      }

      // Return the latest (most recent) timestamp
      if (times.length > 0) {
        return times.reduce((latest, t) => (t > latest ? t : latest));
      }
    } catch {
      // Fall through to null
    }

    return null;
  }

  private getHourlyForecastEntity(): string {
    return this.config.entityGroups.hourlyForecastEntity || this.config.entityGroups.weatherForecastEntity;
  }

  private getDailyForecastEntity(): string {
    return this.config.entityGroups.dailyForecastEntity || this.config.entityGroups.weatherForecastEntity;
  }

  private async checkForecast(hours: number, maxChance: number): Promise<boolean> {
    if (!this.ha) return true; // No HA = assume safe
    try {
      const forecast = await this.ha.getWeatherForecast(
        this.getHourlyForecastEntity(),
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
      // Get both hourly and daily forecasts in parallel - may use different entities
      const [hourlyForecast, dailyForecast] = await Promise.all([
        this.ha.getWeatherForecast(this.getHourlyForecastEntity(), 'hourly').catch(() => []),
        this.ha.getWeatherForecast(this.getDailyForecastEntity(), 'daily').catch(() => []),
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

  /**
   * Estimate when the next mow is likely to happen.
   * Considers: growth threshold, rain delay, min interval, mowing windows.
   * Returns null if we're already at a mow decision.
   */
  private estimateNextMow(
    growth: GrowthResult,
    rainDelay: RainDelayResult,
    lastMowTime: Date | null,
    hoursSinceMow: number,
    growthLowerLimit: number,
    minTimeBetweenMows: number,
  ): Date | null {
    const now = Date.now();
    const growthMm = growth.growth_since_mow_mm;
    const dailyGrowth = growth.daily_growth_mm;

    // Hours until growth reaches lower limit (using current daily rate)
    const growthRemaining = Math.max(0, growthLowerLimit - growthMm);
    const hoursUntilGrowthReady = dailyGrowth > 0
      ? (growthRemaining / dailyGrowth) * 24
      : Infinity;

    // Hours until rain delay clears
    const hoursUntilRainCleared = rainDelay.is_safe_to_mow
      ? 0
      : rainDelay.earliest_delay_hours - (rainDelay.details.hours_since_rain || 0);

    // Hours until min interval is met
    const hoursUntilMinInterval = Math.max(0, minTimeBetweenMows - hoursSinceMow);

    // The predicted time is the max of the three constraints
    let hoursUntilReady = Math.max(hoursUntilGrowthReady, hoursUntilRainCleared, hoursUntilMinInterval);
    if (hoursUntilReady === Infinity || hoursUntilReady > 720) {
      // More than 30 days away — don't show a prediction
      return null;
    }

    let predictedTime = new Date(now + hoursUntilReady * 3600000);

    // Adjust for mowing windows — if the predicted time falls outside a window,
    // bump it forward to the next valid window start time.
    predictedTime = this.adjustToMowingWindow(predictedTime);

    return predictedTime;
  }

  /**
   * If the given time falls outside all mowing windows, advance it to the
   * start of the next valid window (may be the same day or a later day).
   */
  private adjustToMowingWindow(time: Date): Date {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Check up to 7 days ahead
    for (let d = 0; d < 7; d++) {
      const checkDate = new Date(time);
      checkDate.setDate(time.getDate() + d);
      const day = dayNames[checkDate.getDay()];
      const windows = this.config.mowingWindows[day as keyof typeof this.config.mowingWindows];

      if (!windows || windows.length === 0) {
        // No window restriction for this day — any time is valid
        // Return the original time shifted to this day
        return checkDate;
      }

      if (d === 0) {
        // Same day — check if the original time falls within any window
        const currentMin = time.getHours() * 60 + time.getMinutes();
        for (const w of windows) {
          const [sh, sm] = w.start.split(':').map(Number);
          const [eh, em] = w.end.split(':').map(Number);
          if (currentMin >= sh * 60 + sm && currentMin <= eh * 60 + em) {
            return time;
          }
        }
        // Time is outside all windows today — try tomorrow
      } else {
        // Different day — use the earliest window start on that day
        const [sh, sm] = windows[0].start.split(':').map(Number);
        const result = new Date(checkDate);
        result.setHours(sh, sm, 0, 0);
        return result;
      }
    }

    // Fallback: 7 days from now
    return new Date(time.getTime() + 7 * 24 * 3600000);
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
      INSERT INTO growth_history (timestamp, growth_mm)
      VALUES (?, ?)
    `);
    growthStmt.run(new Date().toISOString(), growth.growth_since_mow_mm);
  }

  /**
   * Trigger the mower based on mower type config.
   * BLOCKED when readonlyMode is true - only logs the action.
   */
  public async triggerMower(): Promise<void> {
    if (this.config.readonlyMode) {
      logger.warn('READONLY MODE: mower trigger blocked - would have started mower');
      return;
    }

    if (!this.ha) {
      throw new Error('HA client not available');
    }

    const { mowerType, mowerEntity } = this.config.entityGroups;
    const mowTime = new Date();

    // Record mow start event
    const eventStmt = this.db.prepare(`
      INSERT INTO mow_events (started_at, duration_minutes)
      VALUES (?, ?)
    `);
    eventStmt.run(
      mowTime.toISOString(),
      this.config.avgMowingDuration,
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

    // Write last mow time to app-managed datetime entity
    const lastMowDatetimeEntity = this.config.entityGroups.lastMowDatetimeEntity;
    if (lastMowDatetimeEntity) {
      try {
        await this.ha.writeInputDatetime(lastMowDatetimeEntity, mowTime);
        logger.info({ entity: lastMowDatetimeEntity, time: mowTime.toISOString() }, 'Updated last mow datetime entity');
      } catch (err) {
        logger.warn({ err, entity: lastMowDatetimeEntity }, 'Failed to update last mow datetime entity');
      }
    }

    logger.info({ mowerEntity, mowerType }, 'Mower triggered successfully');
  }

  /**
   * Get current mower state.
   * Reads everything from the single lawn_mower entity:
   *   - state: mower state (mowing, docking, error, charging, etc.)
   *   - battery_pct: from attributes.battery_level
   *   - last_mowed: from attributes.last_mowed (if available)
   */
  public async getMowerState(): Promise<Record<string, unknown>> {
    if (!this.ha) {
      return { available: false };
    }

    const { mowerEntity } = this.config.entityGroups;

    const state: Record<string, unknown> = { available: true };

    try {
      const mowerEntityState = await this.ha.getMowerState(mowerEntity);
      state.state = mowerEntityState.state;
      const attrs = mowerEntityState.attributes as Record<string, unknown>;

      // Battery level from lawn_mower attributes (Navimow uses "battery" key)
      if (typeof attrs['battery'] === 'number') {
        state.battery_pct = attrs['battery'];
      }

      // Navimow integration does NOT expose last_mowed as an attribute.
      // The app tracks this locally via mow_events table, or user can
      // provide a template sensor via lastMowTimeEntity config.
    } catch {
      state.state = 'unavailable';
    }

    return state;
  }

  /**
   * Write algorithm predictions to HA input helpers.
   * Not blocked by readonlyMode - helpers are informational, not mower control.
   */
  public async writeToHAHelpers(result: DecisionResult): Promise<void> {
    if (!this.ha || !this.config.haInputHelpers.enabled) {
      return;
    }

    const helpers = this.config.haInputHelpers;

    try {
      // Growth estimate
      await this.ha.writeInputNumber(helpers.growthEstimateNumber, result.growth_estimate.growth_since_mow_mm);

      // Rain delay hours (remaining, 0 when safe — matches DB logic)
      const remainingDelay = result.rain_delay.is_safe_to_mow
        ? 0
        : Math.max(0, result.rain_delay.earliest_delay_hours - (result.rain_delay.details.hours_since_rain || 0));
      await this.ha.writeInputNumber(helpers.rainDelayNumber, remainingDelay);

      // Mow recommended
      await this.ha.writeInputBoolean(helpers.mowRecommendedBoolean, result.should_mow);

      // Mow reason
      await this.ha.writeInputText(helpers.mowReasonText, result.reason);

      // Predicted next mow time (datetime for input_datetime)
      if (result.predicted_next_mow) {
        await this.ha.writeInputDatetime(helpers.nextMowDateTime, result.predicted_next_mow);
      }

      logger.info('HA input helpers updated');
    } catch (err) {
      logger.warn({ err }, 'Failed to update HA input helpers');
    }
  }

  /**
   * Get current weather history used by the algorithm.
   * Returns hourly weather data for the past 168 hours.
   */
  public async getWeatherHistory(): Promise<WeatherSummary> {
    return this.weather.getHistoricalWeather(168);
  }
}
