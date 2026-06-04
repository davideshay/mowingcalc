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
  const haUrl = process.env.HA_URL;
  const haToken = process.env.HA_TOKEN;

  if (!haUrl || !haToken) {
    logger.warn('HA_URL or HA_TOKEN not set - HA integration will be unavailable');
  }

  const ha = haUrl && haToken ? new HAClient(haUrl, haToken) : null;

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
        is_safe_to_mow: result.rain_delay.is_safe_to_mow,
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

  // Serve React frontend (built static files)
  const frontendDist = path.join(__dirname, '../frontend-dist');
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
