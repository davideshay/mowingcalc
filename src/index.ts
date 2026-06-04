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

const logger = pino({
  level: process.env.APP_LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});

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
      res.json(config);
    } catch (err) {
      res.status(400).json({ error: 'Invalid configuration', details: String(err) });
    }
  });

  // Placeholder routes for future implementation
  app.get('/api/mow-history', (_req, res) => {
    res.json([]);
  });

  app.get('/api/algorithm-state', (_req, res) => {
    res.json({
      status: 'initialized',
      message: 'Algorithm not yet implemented - Phase 2',
    });
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
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
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
