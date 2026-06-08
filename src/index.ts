import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import * as http from 'node:http';
import pino from 'pino';

import { HAClient } from './ha/client';
import { initializeDatabase } from './db/initialize';
import { ConfigLoader } from './config/loader';
import { AppConfig } from './config/schema';
import { DecisionEngine } from './algorithm/decision-engine';
import { AlgorithmScheduler } from './algorithm/scheduler';

const logger = pino({
  level: process.env.APP_LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});

let engine: DecisionEngine | null = null;
let scheduler: AlgorithmScheduler | null = null;
let currentConfig: AppConfig | null = null;

function createApp(): express.Application {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Initialize database
  const dbPath = process.env.DB_PATH || './mowingcalc.db';
  const db = initializeDatabase(dbPath);
  logger.info({ dbPath }, 'Database initialized');

  // Initialize config loader (seeds defaults, then loads from DB)
  const configLoader = new ConfigLoader(db);
  configLoader.seedDefaults();
  let config = configLoader.load();
  logger.info('Configuration loaded from database');

  // Initialize HA client
  const haUrl = process.env.HA_URL || config.haUrl;
  const haToken = process.env.HA_TOKEN || config.haToken;

  if (!haUrl || !haToken) {
    logger.warn('HA_URL/HA_TOKEN not set - HA integration will be unavailable');
  }

  const ha = haUrl && haToken ? new HAClient(haUrl, haToken, config.readonlyMode) : null;

  // Initialize algorithm engine and scheduler
  engine = new DecisionEngine(db, ha, config);
  scheduler = new AlgorithmScheduler(engine);
  currentConfig = config;
  scheduler.start(config.algorithmRunInterval);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    const health: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      ha_connected: false,
    };

    if (ha) {
      ha.healthCheck()
        .then((connected) => { health.ha_connected = connected; })
        .catch(() => { health.ha_connected = false; });
    }

    res.json(health);
  });

  // Config endpoints
  app.get('/api/config', (_req, res) => {
    res.json(config);
  });

  app.put('/api/config', (req, res) => {
    try {
      configLoader.save({ ...config, ...req.body });
      config = configLoader.load();
      if (engine) engine.updateConfig(config);
      if (currentConfig) currentConfig = config;
      // Clear weather cache when config changes (rainfall unit/aggregation may have changed)
      HAClient.clearWeatherCache(db);
      res.json(config);
    } catch (err) {
      res.status(400).json({ error: 'Invalid configuration', details: String(err) });
    }
  });

  app.patch('/api/config', (req, res) => {
    try {
      // Partial update: merge incoming with existing
      const merged = req.body;
      for (const [key, value] of Object.entries(merged)) {
        configLoader.update(key, value);
      }
      config = configLoader.load();
      if (engine) engine.updateConfig(config);
      if (currentConfig) currentConfig = config;
      // Clear weather cache when config changes (rainfall unit/aggregation may have changed)
      HAClient.clearWeatherCache(db);
      res.json(config);
    } catch (err) {
      res.status(400).json({ error: 'Invalid configuration', details: String(err) });
    }
  });

  // Algorithm state endpoint
  app.get('/api/algorithm-state', async (_req, res) => {
    try {
      const result = await engine!.run();
      res.json({
        status: 'ok',
        should_mow: result.should_mow,
        reason: result.reason,
        growth_mm: result.growth_estimate.growth_since_mow_mm,
        daily_growth_mm: result.growth_estimate.daily_growth_mm,
        rain_delay_hours: result.rain_delay.earliest_delay_hours,
        optimal_delay_hours: result.rain_delay.optimal_delay_hours,
        is_safe_to_mow: result.rain_delay.is_safe_to_mow,
        safe_to_mow_time: result.rain_delay.safe_to_mow_time,
        estimated_soil_moisture_pct: result.rain_delay.estimated_soil_moisture_pct,
        field_capacity_pct: result.rain_delay.field_capacity_pct,
        rain_delay_details: result.rain_delay.details,
        hours_since_mow: result.hours_since_mow,
        last_mow_time: result.last_mow_time,
        next_review: result.next_review_time.toISOString(),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: 'Algorithm run failed', details: String(err) });
    }
  });

  // Run algorithm manually and trigger mower if needed
  app.post('/api/algorithm/run', async (_req, res) => {
    if (config.readonlyMode) {
      return res.status(501).json({ error: 'Read-only mode is enabled', message: 'Set readonlyMode to false to allow mower actions' });
    }
    try {
      const result = await engine!.run();
      if (result.should_mow && ha) {
        await engine!.triggerMower();
        logger.info({ reason: result.reason }, 'Mower triggered');
      }
      res.json({ success: true, should_mow: result.should_mow, reason: result.reason });
    } catch (err) {
      res.status(500).json({ error: 'Failed to run algorithm', details: String(err) });
    }
  });

  // Trigger mower directly
  app.post('/api/mow/start', async (_req, res) => {
    if (config.readonlyMode) {
      return res.status(501).json({ error: 'Read-only mode is enabled', message: 'Set readonlyMode to false to allow mower actions' });
    }
    try {
      await engine!.triggerMower();
      res.json({ success: true, message: 'Mower started' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to start mower', details: String(err) });
    }
  });

  // Get mower status
  app.get('/api/mow/status', async (_req, res) => {
    try {
      const state = await engine!.getMowerState();
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get mower status', details: String(err) });
    }
  });

  // Mow event history
  app.get('/api/mow/events', (_req, res) => {
    try {
      const events = db.prepare(`
        SELECT * FROM mow_events
        ORDER BY started_at DESC
        LIMIT 50
      `).all();
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get mow events', details: String(err) });
    }
  });

  // Recent algorithm run history
  app.get('/api/algorithm/history', (_req, res) => {
    try {
      const runs = db.prepare(`
        SELECT * FROM algorithm_runs
        ORDER BY run_time DESC
        LIMIT 50
      `).all();
      res.json(runs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get history', details: String(err) });
    }
  });

  // Growth history for charting
  app.get('/api/growth-history', (_req, res) => {
    try {
      const history = db.prepare(`
        SELECT * FROM growth_history
        ORDER BY timestamp DESC
        LIMIT 100
      `).all();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get growth history', details: String(err) });
    }
  });

  // Debug: show raw forecast data via weather.get_forecasts service
  app.get('/api/debug/forecast', async (_req, res) => {
    if (!ha) {
      return res.json({ error: 'HA not connected' });
    }
    const hourlyEntity = config.entityGroups.hourlyForecastEntity || config.entityGroups.weatherForecastEntity;
    const dailyEntity = config.entityGroups.dailyForecastEntity || config.entityGroups.weatherForecastEntity;
    try {
      const [hourlyState, dailyState] = await Promise.all([
        ha.getEntityState(hourlyEntity).catch(() => ({ entity_id: hourlyEntity, state: 'error', attributes: {} })),
        ha.getEntityState(dailyEntity).catch(() => ({ entity_id: dailyEntity, state: 'error', attributes: {} })),
      ]);
      const [hourly, daily] = await Promise.all([
        ha.getWeatherForecast(hourlyEntity, 'hourly').catch((e: any) => ({ error: String(e) })),
        ha.getWeatherForecast(dailyEntity, 'daily').catch((e: any) => ({ error: String(e) })),
      ]);
      res.json({
        hourly_entity: hourlyEntity,
        hourly_state: hourlyState.state,
        daily_entity: dailyEntity,
        daily_state: dailyState.state,
        hourly_count: Array.isArray(hourly) ? hourly.length : 0,
        hourly: Array.isArray(hourly) ? hourly : [],
        daily_count: Array.isArray(daily) ? daily.length : 0,
        daily: Array.isArray(daily) ? daily : [],
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get forecast', hourly_entity: hourlyEntity, daily_entity: dailyEntity, details: String(err) });
    }
  });

  // Debug: list all weather entities and their forecast capabilities
  app.get('/api/debug/weather-entities', async (_req, res) => {
    if (!ha) {
      return res.json({ error: 'HA not connected' });
    }
    try {
      // Try common weather entity names
      const candidates = [
        'weather.home',
        'weather.openweathermap',
        'weather.openweathermap_home',
        'weather.home_weather',
      ];
      const results = [];
      for (const id of candidates) {
        try {
          const state = await ha.getEntityState(id);
          const attrs = state.attributes as Record<string, unknown>;
          results.push({
            entity_id: id,
            state: state.state,
            has_hourly: 'hourly' in attrs,
            has_daily: 'daily' in attrs,
            hourly_count: Array.isArray(attrs['hourly']) ? (attrs['hourly'] as unknown[]).length : 0,
            daily_count: Array.isArray(attrs['daily']) ? (attrs['daily'] as unknown[]).length : 0,
            attribute_keys: Object.keys(attrs),
          });
        } catch {
          results.push({ entity_id: id, error: 'not found or unavailable' });
        }
      }
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list weather entities', details: String(err) });
    }
  });

  // Debug: show hourly weather history used by the algorithm (past 168 hours)
  app.get('/api/debug/weather-history', async (_req, res) => {
    try {
      const weatherSummary = await engine!.getWeatherHistory();
      // Serialize Dates for JSON
      const serialized = {
        ...weatherSummary,
        hourly: weatherSummary.hourly.map((h) => ({
          ...h,
          timestamp: h.timestamp.toISOString(),
        })),
        last_rain_timestamp: weatherSummary.last_rain_timestamp,
      };
      res.json(serialized);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get weather history', details: String(err) });
    }
  });

  // Debug: show raw HA history response for a single entity
  app.get('/api/debug/raw-history', async (req, res) => {
    if (!ha) {
      return res.json({ error: 'HA not connected' });
    }
    const entityId = (req.query.entity_id as string) || '';
    const hours = parseInt((req.query.hours as string) || '24', 10);
    if (!entityId) {
      return res.json({ error: 'entity_id query param required', example: '?entity_id=sensor.aw_1_hourly_rain&hours=24' });
    }
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() - hours * 3600000);
      const rawData = await ha.getHistoricalData([entityId], startTime, now);
      const entries = Array.from(rawData.values()).flat();
      res.json({
        entity_id: entityId,
        period_hours: hours,
        entry_count: entries.length,
        first_entry: entries[0] || null,
        last_entry: entries[entries.length - 1] || null,
        sample_entries: entries.slice(0, 5),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get raw history', details: String(err) });
    }
  });

  // Debug: show raw HA statistics response for a single entity
  app.get('/api/debug/raw-statistics', async (req, res) => {
    if (!ha) {
      return res.json({ error: 'HA not connected' });
    }
    const entityId = (req.query.entity_id as string) || '';
    const hours = parseInt((req.query.hours as string) || '24', 10);
    if (!entityId) {
      return res.json({ error: 'entity_id query param required' });
    }
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() - hours * 3600000);
      const stats = await ha.getStatistics(entityId, startTime, now);
      res.json({
        entity_id: entityId,
        period_hours: hours,
        entry_count: stats.length,
        first_entry: stats[0] || null,
        last_entry: stats[stats.length - 1] || null,
        sample_entries: stats.slice(0, 3),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get statistics', details: String(err) });
    }
  });

  // Validate HA setup - check all configured entities exist and are accessible
  app.get('/api/validate-ha', async (_req, res) => {
    if (!ha) {
      return res.json({ ha_connected: false, results: [] });
    }

    const results: Array<{ entity_id: string; label: string; status: 'ok' | 'unavailable' | 'not_found' | 'error'; state?: string; message?: string }> = [];

    // Check HA connection first
    const connected = await ha.healthCheck();
    if (!connected) {
      return res.json({ ha_connected: false, results: [] });
    }

    // Collect all entities to check
    const entitiesToCheck: Array<{ entity_id: string; label: string }> = [];

    // Weather sensors
    for (const id of config.entityGroups.rainfallSensors) {
      entitiesToCheck.push({ entity_id: id, label: 'Rainfall' });
    }
    for (const id of config.entityGroups.temperatureSensors) {
      entitiesToCheck.push({ entity_id: id, label: 'Temperature' });
    }
    for (const source of config.entityGroups.sunshineSources) {
      entitiesToCheck.push({ entity_id: source.entity_id, label: `Sunshine (${source.type})` });
    }

    // Single entities
    if (config.entityGroups.weatherForecastEntity) {
      entitiesToCheck.push({ entity_id: config.entityGroups.weatherForecastEntity, label: 'Forecast (default)' });
    }
    if (config.entityGroups.hourlyForecastEntity) {
      entitiesToCheck.push({ entity_id: config.entityGroups.hourlyForecastEntity, label: 'Forecast (hourly)' });
    }
    if (config.entityGroups.dailyForecastEntity) {
      entitiesToCheck.push({ entity_id: config.entityGroups.dailyForecastEntity, label: 'Forecast (daily)' });
    }
    if (config.entityGroups.mowerEntity) {
      entitiesToCheck.push({ entity_id: config.entityGroups.mowerEntity, label: 'Mower' });
    }
    if (config.entityGroups.lastMowTimeEntity) {
      entitiesToCheck.push({ entity_id: config.entityGroups.lastMowTimeEntity, label: 'Last Mow Time' });
    }
    if (config.entityGroups.sunEntity) {
      entitiesToCheck.push({ entity_id: config.entityGroups.sunEntity, label: 'Sun' });
    }

    // Check each entity
    const checks = entitiesToCheck.map(async ({ entity_id, label }) => {
      try {
        const state = await ha.getEntityState(entity_id);
        return {
          entity_id,
          label,
          status: state.state === 'unavailable' ? 'unavailable' : 'ok' as const,
          state: state.state,
        };
      } catch (err: any) {
        if (err.message?.includes('404') || err.message?.includes('not found')) {
          return {
            entity_id,
            label,
            status: 'not_found' as const,
            message: 'Entity not found in Home Assistant',
          };
        }
        return {
          entity_id,
          label,
          status: 'error' as const,
          message: err.message || 'Unknown error',
        };
      }
    });

    const entityResults = await Promise.all(checks);

    res.json({ ha_connected: true, results: entityResults });
  });

  // Serve React frontend (built static files)
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));

  // Catch-all for SPA routing
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  return app;
}

async function main(): Promise<void> {
  const app = createApp();
  const port = parseInt(process.env.APP_PORT || '3000', 10);

  const server = http.createServer(app);

  server.listen(port, () => {
    logger.info({ port }, 'MowingCalc server started');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    scheduler?.stop();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    scheduler?.stop();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
