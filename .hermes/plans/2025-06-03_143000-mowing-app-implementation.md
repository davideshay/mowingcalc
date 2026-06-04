# Lawn Mowing Calculator - Implementation Plan

## Goal
Build a containerized Node.js application with a scheduling algorithm that determines optimal lawn mowing times based on weather data, grass growth patterns, and Home Assistant integration, plus a React web UI for configuration and monitoring.

## Confirmed Architecture Decisions

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite, embedded in same repo under `frontend/` directory
- **Database**: SQLite (local storage)
- **Mower trigger**: App calls HA service directly (e.g., `switch.turn_on`)
- **Deployment**: Docker/docker-compose compatible, Kubernetes-ready
- **Repo structure**: Clearly separated `src/` (backend) and `frontend/` (web UI)

## Proposed Repo Structure
```
mowingcalc/
├── src/                    # Backend
│   ├── config/             # Config schema, defaults, loaders
│   ├── ha/                 # Home Assistant client, entity helpers
│   ├── algorithm/          # Growth model, rain-delay model, scheduler, weather
│   ├── db/                 # SQLite models, migrations
│   ├── api/                # Express routes, middleware
│   ├── scheduler/          # Background job runner
│   ├── utils/              # Shared utilities
│   └── index.ts            # Entry point
├── frontend/               # React UI
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level views
│   │   ├── hooks/          # Custom React hooks
│   │   ├── types/          # Shared TS types
│   │   └── App.tsx
│   ├── public/
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── .env.example            # Infrastructure only (HA URL, token, timezone)
├── docker-compose.yml      # Local dev with SQLite volume
├── Dockerfile              # Multi-stage build (frontend + backend)
├── Dockerfile.dev          # Dev container with hot reload
├── package.json            # Root workspace or backend-only
├── tsconfig.json
└── requirements.md
```

## Container Strategy

**Multi-stage Dockerfile:**
1. Stage 1: Build frontend (Vite) → static files in `dist/`
2. Stage 2: Backend (Node.js) → copy frontend `dist/` into Express static
3. Final: Single image running Express serving API + static UI

**Docker Compose (local/dev):**
- App container with SQLite volume mount
- Optional: HA sidecar or just external URL
- Environment variables for HA URL, token, timezone

**Kubernetes-ready:**
- ConfigMap for environment variables (HA URL, token)
- PersistentVolumeClaim for SQLite database
- Health check endpoint (`/api/health`)
- Graceful shutdown handling
- Resource limits/requests in deployment manifest

## Home Assistant Integration

**What the app reads from HA:**
- Historical rainfall (past 7 days, hourly) — from weather sensor or separate rain sensor
- Historical sunshine/temperature — from weather sensor
- Forecast data (hourly 24h, daily 2-5 days) — from weather entity forecast attribute
- Last mow time — from mower entity or helper input
- Sunset time — from sun component

**What the app writes to HA:**
- Trigger mower ON — `switch.turn_on` or mower-specific service call
- Trigger mower OFF — `switch.turn_off` (optional, after estimated duration)
- Write recommendation/prediction to input helpers (for HA dashboard display)

**Connection details:**
- Long-lived access token (passed via env var)
- REST API (no WebSocket needed for this use case)
- Retry logic with exponential backoff

## Database Schema (SQLite)

**Tables:**
- `config` — application settings (key-value with validation)
- `mow_events` — history of mowing triggers (timestamp, duration, growth_at_trigger, decision_reason)
- `weather_cache` — cached weather data with timestamps (avoids hammering HA)
- `algorithm_runs` — log of each algorithm execution (timestamp, inputs, decision, next_run)
- `growth_history` — calculated growth over time (for charting)
- `rain_delay_history` — calculated safe-to-mow times over time

## Algorithm Overview

### TWO Distinct Algorithms (per requirements)

#### Algorithm 1: Grass Growth Model
Purpose: Estimate how much the grass has grown since the last mow.

Inputs:
- Historical rainfall intensity over time (past 7 days)
- Historical sunshine conditions (past 7 days)
- Historical ambient temperature (past 7 days)
- Grass type parameters (tall fescue default)
- Time since last mow

Output: Estimated total growth in mm since last mow

Model basis (requires research):
- Tall fescue base growth: ~0.5-1mm/day under optimal conditions
- Rainfall multiplier: +0.2mm per 1mm rainfall (within 48h window, exponential decay)
- Temperature curve: optimal 15-25C, reduced below 10C and above 30C
- Sunshine factor: +10-20% with adequate sunlight
- Median filtering on weather inputs to avoid sensor outliers
- Need to research peer-reviewed grass growth models for accuracy

#### Algorithm 2: Rain Delay / Safe-to-Mow Model
Purpose: Predict when it is safe to mow after rain without damaging the grass.

This is distinct from growth — even if the grass has grown enough to mow, mowing too soon after rain causes:
- Soil compaction (heavy mower on wet soil)
- Grass tearing instead of clean cutting
- Clumping and clogging of mower deck
- Disease spread from wet clippings
- Uneven cut on soggy turf

Inputs:
- Recent rainfall intensity and timing (past 24-48 hours)
- Cumulative rainfall amount
- Current soil moisture conditions (if available)
- Sunshine exposure since last rain (drying effect)
- Ambient temperature and humidity (evaporation rate)
- Wind conditions (drying effect)
- Grass type (tall fescue root structure, leaf thickness)
- Configurable minimum delay after rain

Output:
- Earliest safe time to mow (grass won't be damaged)
- Optimal time to mow (grass fully recovered)
- Confidence level in the prediction

Model basis (requires research):
- Research lawn care industry guidelines for mowing after rain
- Typical recommendations: 24-48 hours after light rain, 48-72 hours after heavy rain
- Evaporation rate models (PET — Potential Evapotranspiration)
- Soil type factors (clay drains slower than sandy soil)
- Sun exposure and wind acceleration of drying
- Need to research agronomic literature on turf moisture and mowing damage

#### Mowing Decision Engine (combines both algorithms)
1. Are we in a configured mowing window for this day/time? If not, reschedule.
2. Has minimum time since last mow passed? If not, reschedule.
3. Calculate estimated growth since last mow (Algorithm 1).
4. Calculate rain delay / safe-to-mow time (Algorithm 2).
5. If growth < lower limit: don't mow, reschedule.
6. If not yet safe to mow per rain delay: calculate when it will be safe, check forecast, reschedule.
7. If growth > upper limit AND maximum time between mows exceeded: trigger immediately (emergency override).
8. If growth > lower limit AND safe to mow: predict when growth crosses upper limit, check forecast window. If window exists, schedule. If not, trigger now.
9. If growth > upper limit AND safe to mow AND forecast clear: trigger immediately.
10. Check precipitation forecast for average mowing duration — only trigger if below configured threshold.

### Configuration Parameters
- Grass type (tall fescue default, extensible)
- Growth lower limit (mm)
- Growth upper limit (mm)
- Minimum time after rain (hours) — configurable baseline
- Minimum time between mows (hours)
- Maximum time between mows (hours)
- Average mowing duration (minutes)
- Algorithm re-run interval (minutes)
- Minimum precipitation % to prevent mowing
- Mowing time windows per day (supporting "sunset +/- X" notation)
- Rain delay model parameters (soil type, drain rate, etc.)

## Phased Implementation

### Phase 1: Foundation ✅ CURRENT
- Project scaffold (TS, Express, Vite + React)
- Docker setup (Dockerfile, docker-compose.yml)
- SQLite database setup with migrations
- HA client module (connect, auth, basic entity read)
- Configuration system (schema, defaults, env var loading)

### Phase 2: Algorithm Research & Core
- Weather data retrieval and caching from HA
- RESEARCH: Grass growth models (literature review)
- RESEARCH: Rain delay / safe-to-mow models (lawn care guidelines, agronomy papers)
- Grass growth calculation model (Algorithm 1)
- Rain delay / safe-to-mow model (Algorithm 2)
- Decision engine combining both algorithms
- Algorithm scheduler (background runner)

### Phase 3: Mower Integration
- HA service call to trigger mower ON
- Optional: trigger OFF after estimated duration
- Mow event tracking and history storage
- Write predictions to HA input helpers

### Phase 4: Web UI
- Configuration page (forms for all parameters)
- History view (calendar/timeline of mows)
- Algorithm dashboard (key data, decision log, growth chart, rain delay chart)
- Next mow prediction display
- Real-time status

### Phase 5: Hardening & Kubernetes
- Health check and readiness endpoints
- Graceful shutdown
- K8s deployment manifests (Deployment, Service, ConfigMap, PVC)
- Logging and monitoring
- Testing suite

## Files to Create (Phase 1)
- `package.json` (root)
- `tsconfig.json`
- `.env.example`
- `Dockerfile`
- `Dockerfile.dev`
- `docker-compose.yml`
- `src/index.ts`
- `src/config/schema.ts`
- `src/config/defaults.ts`
- `src/ha/client.ts`
- `src/db/initialize.ts`
- `frontend/` (Vite + React scaffold)
- `frontend/package.json`
- `frontend/vite.config.ts`

## Risks & Open Questions
- HA entity IDs for rain/sunshine/mower are unknown — need to discover
- Exact mower trigger service call varies by integration (Husqvarna, Worx, etc.)
- Timezone handling for sunset-relative windows
- Growth model accuracy will need real-world calibration
- Rain delay model needs agronomic research — industry guidelines vs. scientific models
- Soil type at the property affects drainage — should this be configurable?
- Two separate algorithms means twice the research/calibration effort

## Timeline Estimate
- Phase 1 (Foundation): 2-3 days
- Phase 2 (Algorithm Research + Core): 4-5 days (research-heavy)
- Phase 3 (Mower Integration): 1-2 days
- Phase 4 (Web UI): 4-5 days
- Phase 5 (Hardening + K8s): 2-3 days
- Total: 3-4 weeks for MVP
