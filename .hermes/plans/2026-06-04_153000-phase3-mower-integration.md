# Phase 3: Mower Integration Plan

## Goal
Integrate with Segway Navimow via Home Assistant's `lawn_mower` entity, track mowing events, and expose predictions to HA dashboard.

## Segway Navimow HA Integration Details
- Repository: https://github.com/segwaynavimow/NavimowHA
- Native HA `lawn_mower` entity (not `switch`)
- Standard services: `lawn_mower.start_mowing`, `lawn_mower.dock`, `lawn_mower.pause`, `lawn_mower.resume`
- Battery sensor entity
- MQTT-based real-time state updates
- HA minimum: 2026.1.0

## Configuration Additions Needed

```typescript
// New config fields
mowerType: 'lawn_mower' | 'switch' | 'custom'  // default: 'lawn_mower'
navimowEntity: 'lawn_mower.navimow_x420'       // actual mower entity ID
navimowStateEntity: 'sensor.navimow_state'      // mower status sensor
navimowBatteryEntity: 'sensor.navimow_battery'  // battery level
haInputHelpers: {
  enabled: boolean,
  nextMowNumber: 'input_number.next_predicted_mow',
  growthEstimateNumber: 'input_number.growth_estimate_mm',
  rainDelayNumber: 'input_number.rain_delay_hours',
  mowRecommendedBoolean: 'input_boolean.mow_recommended',
  mowReasonSelect: 'input_select.mow_reason',
}
```

## Implementation Tasks

### Task 1: Update HA Client
- Add `startMowing(entityId)`, `dockMower(entityId)`, `pauseMowing(entityId)`, `resumeMowing(entityId)`
- Add `getMowerState(entityId)` for status polling
- Add `writeInputHelpers(data)` for HA dashboard exposure

### Task 2: Update Decision Engine
- Call mower services based on mower type config
- Track mow start/end times
- Persist mow events to DB with duration tracking

### Task 3: Mow Event Tracking
- Poll mower state during active mow
- Detect mow completion (state = 'docked' or 'charging')
- Calculate actual duration vs estimated
- Update running average

### Task 4: HA Input Helpers (Optional)
- Write algorithm predictions to HA input helpers
- Enable/disable via config
- Use HA REST API to update helpers

## API Endpoints
- POST `/api/mow/start` - Trigger mow (runs algorithm + calls mower)
- GET `/api/mow/status` - Current mower state
- GET `/api/mow/events` - Mow history
- POST `/api/ha/helpers/update` - Push predictions to HA input helpers

## Testing
- Verify mower starts correctly via HA API
- Verify state polling detects completion
- Verify mow events persist with accurate duration
- Verify input helpers update (if enabled)
