# MowingCalc - Session Summary (2025-06-03)

## Status
Phase 1 (Foundation) is COMPLETE and VERIFIED.
Next: Phase 2 (Algorithm Research & Core)

## What's Built

### Backend (`src/`)
- Express + TypeScript server with health endpoint
- SQLite database with 6 tables (config, mow_events, weather_cache, algorithm_runs, growth_history, rain_delay_history)
- Config system: stored in DB (not env vars), supports GET/PATCH/PUT at `/api/config`
- Home Assistant client: entity reads, forecasts, history, service calls, median aggregation across multiple sensors
- Graceful shutdown (SIGTERM/SIGINT)

### Frontend (`frontend/`)
- React + Vite scaffold with Tailwind CSS
- Placeholder UI showing system status
- API proxy configured for `/api` routes

### DevOps
- Multi-stage Dockerfile (frontend + backend in single image)
- Dockerfile.dev (hot reload)
- docker-compose.yml (local dev with volume mount)
- .env.example (infrastructure vars only: HA_URL, HA_TOKEN, APP_PORT, etc.)
- .gitignore

### Config Architecture
- Entity groups (rainfallSensors, temperatureSensors, etc.) are stored in DB as config
- Multiple sensors per metric — algorithm uses median aggregation
- Env vars are infrastructure-only (HA URL/token, port, timezone)
- Config API: GET /api/config, PATCH /api/config, PUT /api/config

## Key Design Decisions
- Express + embedded React (not separate repos)
- SQLite for local storage, hybrid approach with HA
- App triggers mower via HA service calls
- Containerized (docker/docker-compose, K8s-ready)
- TWO distinct algorithms: grass growth model AND rain delay model
- Multiple entity IDs per metric with median aggregation

## What's NOT Built Yet
- Phase 2: Algorithm research (grass growth + rain delay models)
- Phase 3: Mower integration (HA service calls for ON/OFF)
- Phase 4: Full web UI (config forms, history, dashboard, predictions)
- Phase 5: K8s manifests, testing suite, monitoring

## How to Continue
```bash
# Install deps
npm install
cd frontend && npm install && cd ..

# Dev mode
npm run dev

# Build frontend for production
cd frontend && npm run build && cd ..

# Docker
docker compose up --build

# Verify
curl http://localhost:3000/api/health
curl http://localhost:3000/api/config
```

## Open Questions for Next Session
- Discover HA entity IDs for rain/sunshine/mower on actual instance
- Research tall fescue growth models (scientific literature)
- Research rain delay / safe-to-mow models (lawn care guidelines, agronomy)
- What mower integration? (Husqvarna, Worx, generic switch?)
