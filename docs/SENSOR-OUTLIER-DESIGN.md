# Sensor Outlier Analysis -- Design Plan

## 1. Problem Statement

The system ingests weather data from multiple Home Assistant sensors (rainfall, temperature, UV/sunshine) grouped by metric type. With 7+ sensors configured, some are broken: reporting zero values, stale data, or values wildly out of range compared to the rest of the fleet. Currently the median aggregation masks bad sensors, but the user has no visibility into which sensors are problematic.

Goal: Build a dedicated page that fetches per-sensor historical data, visualizes each sensor's time series, detects statistical outliers, flags broken sensors visually, makes actionable recommendations, and allows the user to remove problematic sensors directly from the UI.

---

## 2. Architecture Overview

```
Frontend (React SPA)                    Backend (Express)
+-------------------+                   +----------------------+
| SensorOutlier     |  GET /api/sensors/  | SensorOutlierService |
| Page              | <-----------------> | (new)                |
|                   |   analysis          |                      |
| - Per-metric tabs |  POST /api/config   | HAClient (existing)  |
| - Time series     | ------------------> | - getStatisticsBatch |
|   charts          |     PATCH           | - getHistoricalData  |
| - Summary table   |                     |                      |
| - Remove buttons  |  GET /api/config    | ConfigLoader         |
| - Recommendations | <------------------- | (existing)           |
+-------------------+                     +----------------------+
```

No new database tables required. The feature is stateless analysis against live HA data + existing config.

---

## 3. Backend Design

### 3.1 New Service: `src/algorithm/sensor-outlier.ts`

**Purpose:** Fetch per-sensor historical data from HA, compute statistics per sensor per metric, detect outliers, and produce recommendations.

**Public API:**

```typescript
export interface SensorReading {
  timestamp: string;       // ISO 8601
  value: number;
}

export interface SensorTimeSeries {
  entity_id: string;
  friendly_name: string | null;
  unit_of_measurement: string | null;
  readings: SensorReading[];  // 5-min interval data from HA statistics
  stats: SensorStats;
}

export interface SensorStats {
  count: number;           // total data points
  validCount: number;      // non-null, non-zero data points
  zeroCount: number;       // data points that are exactly 0
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  p10: number | null;      // 10th percentile
  p90: number | null;      // 90th percentile
  dataSpanHours: number;   // hours between first and last reading
}

export interface OutlierFlag {
  type: 'all_zeros' | 'stale' | 'statistical' | 'zero_dominant' | 'extreme_range';
  severity: 'critical' | 'warning';
  message: string;
}

export interface MetricAnalysis {
  metric: 'rainfall' | 'temperature' | 'uv_index' | 'sunshine';
  sensorCount: number;
  timeRangeHours: number;
  groupMedian: number | null;    // cross-sensor median of means
  sensors: Array<{
    entity_id: string;
    friendly_name: string | null;
    unit_of_measurement: string | null;
    stats: SensorStats;
    flags: OutlierFlag[];
    readings: SensorReading[];
    recommended: boolean;        // true = recommended for removal
  }>;
}

export interface SensorOutlierResult {
  analysisTime: string;
  metrics: MetricAnalysis[];
  totalOutliers: number;
  recommendedRemovals: Array<{
    metric: string;
    entity_id: string;
    friendly_name: string | null;
    reason: string;
  }>;
}
```

### 3.2 Outlier Detection Algorithm

The algorithm runs per-metric group. Steps:

**Phase 1 -- Data Collection**
- For each metric (rainfall, temperature, uv_index, sunshine), resolve the sensor entity IDs from config.
- Fetch HA statistics data via `HAClient.getStatisticsBatch()` for the maximum available window. Default: 240 hours (10 days). The user can specify a shorter window via query parameter `?hours=N` (min 24, max 720/30 days).
- Also fetch current state for each entity via `HAClient.getEntityState()` to get `friendly_name` and `unit_of_measurement`.

**Phase 2 -- Per-Sensor Statistics**
For each sensor's time series:
- Count total readings, valid (non-null, non-zero), and zero readings.
- Compute mean, std, min, max, median, p10, p90 over valid readings.
- Compute data span (hours between first and last reading).

**Phase 3 -- Outlier Detection** (four independent checks, any one fires a flag)

1. **All-zeros check** (`all_zeros`, critical): `validCount === 0` or `zeroCount / count > 0.95`
   - Sensor reports zeros for all or nearly all data points.

2. **Stale data check** (`stale`, critical): `dataSpanHours < hours * 0.5`
   - Sensor has stopped reporting. Less than half the expected data window.

3. **Zero-dominant check** (`zero_dominant`, warning): `zeroCount / count > 0.5` AND `validCount > 0`
   - Sensor reports zeros for more than half the time but has some valid data.

4. **Statistical outlier check** (`statistical`, warning/critical):
   - Compute the group median of per-sensor means (robust to individual outliers).
   - For each sensor, compute the absolute deviation from the group median: `|sensor_mean - group_median|`.
   - Compute the IQR of these deviations.
   - If a sensor's deviation > 1.5 * IQR, flag it. Severity: `critical` if deviation > 3 * IQR.
   - Special handling for rainfall: a sensor whose mean is > 3x the group median (always reads higher) or whose mean is < 0.3x the group median (always reads lower) is flagged regardless of IQR.

5. **Extreme range check** (`extreme_range`, warning): `max - min > 3 * group_std_of_ranges`
   - Sensor has a range 3x wider than the group average, suggesting sensor instability.

**Phase 4 -- Recommendation**
- A sensor is `recommended: true` for removal if it has at least one `critical` flag.
- Sensors with only `warning` flags are flagged but not recommended for automatic removal.

### 3.3 New API Endpoint: `GET /api/sensors/analysis`

Located in `src/index.ts`.

Query parameters:
- `hours` (optional, default 240): Time window in hours (24-720).
- `metric` (optional): Filter to a single metric. If omitted, analyzes all metrics.

Response: `SensorOutlierResult` (JSON).

Implementation notes:
- Calls `engine.getWeatherService().analyzeSensors()` or a dedicated service.
- Clears weather cache before analysis (or adds a `?clearCache=1` param) since stale cache could skew results.
- The endpoint does NOT modify any config. Removal is a separate POST/PATCH call.

### 3.4 Sensor Removal: Existing `PATCH /api/config`

Removing a sensor uses the existing config PATCH endpoint. No new endpoint needed.

Frontend sends:
```json
{
  "entityGroups": {
    "rainfallSensors": ["sensor.aw_1_hourly_rain", "sensor.aw_3_hourly_rain"],
    // ... other sensors removed
  }
}
```

After removal, frontend calls `HAClient.clearWeatherCache(db)` via the config endpoint (already done automatically).

---

## 4. Frontend Design

### 4.1 New Page: `SensorOutlier`

**Route:** `/sensors`
**Sidebar label:** "Sensor Health"
**Icon:** `MonitorHeartOutlined` (Material Icons -- sensor health monitoring)

The page uses the existing `TabbedPage` layout component with tabs per metric:
- Tab 1: "Rainfall" (icon: `WaterDrop`)
- Tab 2: "Temperature" (icon: `LocalFireDepartment` or `Thermostat`)
- Tab 3: "UV Index" (icon: `WbSunny`)
- Tab 4: "Sunshine" (icon: `WbCloudy`) -- only if sunshine sources configured

Each tab contains:
1. Summary cards (top row)
2. Per-sensor time series chart (main area)
3. Sensor health table (bottom)
4. Recommendation banner (sticky bottom or inline)

### 4.2 Tab Content -- Detailed Layout

```
+----------------------------------------------------------+
|  [Summary Cards Row]                                      |
|  +-----------+  +-----------+  +-----------+             |
|  | Total: 7  |  | Outliers: 2|  | Recommend:|             |
|  | sensors   |  | flagged    |  | 2 remove  |             |
|  +-----------+  +-----------+  +-----------+             |
+----------------------------------------------------------+
|  [Time Series Chart]                                      |
|  Recharts AreaChart/LineChart                             |
|  X-axis: time (last N hours)                              |
|  Y-axis: metric value (mm, C, UV index)                   |
|  Per-sensor: one line per sensor                          |
|    - Normal sensors: primary.main (green), opacity 0.6    |
|    - Outlier sensors: error.main (red), opacity 1.0       |
|    - Hover tooltip: shows all sensor values at cursor     |
|  Overlay: dashed line for group median                    |
|  Height: ~400px                                           |
+----------------------------------------------------------+
|  [Sensor Health Table]                                    |
|  +----------+----------+--------+--------+--------+------+
|  | Sensor   | Status   | Mean   | Min    | Max    | Flags|
|  +----------+----------+--------+--------+--------+------+
|  | sensor.. | [OK]     | 18.2C  | 5.1C   | 28.3C  |      |
|  | sensor.. | [WARN]   | 0.0C   | 0.0C   | 0.0C   | All  |
|  |          |          |        |        |        | zeros|
|  | sensor.. | [CRIT]   | 42.1C  | 38.0C  | 51.2C  | Stat |
|  |          | [Remove] |        |        |        |      |
|  +----------+----------+--------+--------+--------+------+
+----------------------------------------------------------+
|  [Action Bar]                                             |
|  "2 sensors recommended for removal"                      |
|  [Remove Selected]  [Clear Selection]  [Refresh]          |
+----------------------------------------------------------+
```

### 4.3 Time Series Chart (Recharts)

Uses `recharts` (already a dependency). Chart type: `LineChart` with multiple `Line` components.

**Color scheme:**
- Normal sensors: `primary.main` (`#16a34a` light / `#4ade80` dark), stroke width 1.5, opacity 0.5
- Warning sensors: `warning.main` (`#f59e0b` light / `#fcd34d` dark), stroke width 2, opacity 0.8
- Critical sensors: `error.main` (`#ef4444` light / `#fca5a5` dark), stroke width 2.5, opacity 1.0
- Group median: dashed line, `text.disabled`, stroke width 1

**Tooltip:** Custom tooltip component showing all sensor values at the hovered timestamp in a compact table format.

**Legend:** Compact legend at top showing sensor names (truncated entity IDs) with color dots.

**X-axis:** Time labels every 6 hours (or adaptive based on chart width). Format: "MM/dd HH:mm".

**Y-axis:** Auto-scaled with label showing unit (mm, C, UV).

**Data resolution:** HA statistics are 5-minute intervals. For display, aggregate to hourly buckets in the frontend by taking the mean per hour. This reduces chart points from ~2880 to ~240 per sensor for a 10-day window.

### 4.4 Sensor Health Table

Columns:
- **Sensor**: Entity ID (monospace font, clickable to copy) + friendly name (small, secondary color)
- **Status**: Chip component
  - Green "OK" chip for normal sensors
  - Yellow "Warning" chip for warning-only flags
  - Red "Critical" chip for critical flags
- **Mean**: Formatted value with unit
- **Min / Max**: Formatted values with unit
- **Data Points**: `validCount / totalCount`
- **Flags**: Stack of small text labels, one per flag (e.g., "All zeros", "Stale", "Statistical outlier")
- **Remove**: Checkbox for selection

### 4.5 Recommendation Banner

Appears below the table when there are critical-flagged sensors:

```
+----------------------------------------------------------+
|  [Warning icon] N sensor(s) flagged for removal:        |
|  - sensor.xxx (reason)                                   |
|  - sensor.yyy (reason)                                   |
|                                                          |
|  [Remove Selected (N)]  [Clear Selection]                |
+----------------------------------------------------------+
```

### 4.6 Remove Action Flow

1. User checks one or more sensor checkboxes in the table.
2. "Remove Selected (N)" button becomes enabled.
3. On click, confirm dialog (MUI `Dialog`):
   ```
   Title: "Remove N sensor(s)?"
   Body: "This will remove the following sensor(s) from your configuration:
          - sensor.xxx (rainfall) - reason
          - sensor.yyy (temperature) - reason
          These sensors will no longer be used for weather data analysis."
   Actions: [Cancel] [Remove]
   ```
4. On confirm, frontend sends `PATCH /api/config` with the updated sensor arrays (minus removed sensors).
5. On success: toast notification, page re-fetches analysis data, chart/table updates.
6. On failure: toast error, no state change.

### 4.7 Refresh Mechanism

- Page loads: fetches analysis on mount.
- "Refresh" button in the page header (next to title) re-fetches analysis.
- Optional: auto-refresh every 5 minutes via `usePolling` pattern (consistent with Dashboard).

### 4.8 Loading States

- Initial load: Full-page `CircularProgress` centered.
- Per-tab loading: Tab content shows skeleton/card with `CircularProgress`.
- After analysis complete: show data immediately.
- If HA is not connected: show `Alert` with severity "error" explaining the issue.

---

## 5. File Structure

New files:
```
src/
  algorithm/
    sensor-outlier.ts          # Backend analysis service

frontend/src/
  pages/
    SensorOutlier.tsx          # Main page component
  components/
    sensors/
      SensorTimeSeries.tsx     # Recharts chart component
      SensorHealthTable.tsx    # Table with status chips + checkboxes
      MetricSummary.tsx        # Summary cards row
      SensorLegend.tsx         # Compact chart legend
```

Modified files:
```
src/
  index.ts                     # Add GET /api/sensors/analysis endpoint

frontend/src/
  App.tsx                      # Add Route /sensors
  components/Layout.tsx        # Add nav item "Sensors"
  hooks/useApi.ts              # Add useSensorAnalysis() hook
  types/api.ts                 # Add SensorOutlierResult types
```

---

## 6. Data Flow -- Step by Step

1. User navigates to `/sensors`.
2. `SensorOutlier` page mounts, calls `useSensorAnalysis(240)` hook.
3. Hook fetches `GET /api/sensors/analysis?hours=240`.
4. Backend:
   a. Reads config to get entity groups.
   b. For each metric, resolves entity IDs.
   c. Calls `HAClient.getStatisticsBatch()` for each entity over 240h window.
   d. Calls `HAClient.getEntityState()` for friendly names.
   e. Computes per-sensor statistics.
   f. Runs outlier detection algorithm.
   g. Returns `SensorOutlierResult` JSON.
5. Frontend renders tabbed page with per-metric data.
6. User can check boxes, click "Remove Selected", confirm in dialog.
7. Frontend sends `PATCH /api/config` with updated entity groups.
8. Backend saves config, clears weather cache.
9. Frontend re-fetches analysis, updates display.

---

## 7. Edge Cases and Error Handling

- **No sensors configured for a metric**: Show empty state card with "No {metric} sensors configured" message. Tab is still present but shows guidance to configure sensors in the Configuration page.
- **HA not connected**: Show error banner at top. All tabs show "Cannot fetch data -- HA not connected".
- **Partial sensor failure**: Some sensors return data, others throw. Gracefully handle per-sensor failures -- show "Error fetching data" in that sensor's row, don't crash the whole analysis.
- **Statistics API not available for an entity**: Fall back to raw history API (existing HAClient pattern). If both fail, show zero readings and flag as "No data".
- **Single sensor in a group**: Outlier detection requires at least 3 sensors for statistical comparison. With < 3 sensors, only run the all-zeros, stale, and zero-dominant checks. Show a note: "Statistical outlier detection requires 3+ sensors."
- **Time window exceeds HA retention**: HA typically retains 10 days of statistics. If the user requests more, return whatever is available and show the actual time range in the summary.

---

## 8. Visual Design Consistency

Following existing project patterns:
- **Cards**: MUI `Card` + `CardContent` with `borderRadius: 12` (from theme).
- **Colors**: Theme tokens (`primary.main`, `error.main`, `warning.main`) for automatic dark/light mode support.
- **Typography**: `h4` for page titles, `subtitle1` for section headers, `body2` for table cells, `caption` for helper text.
- **Dark mode**: All colors use theme tokens. No hardcoded hex values except for the alpha-based rain highlighting pattern (`alpha('#ef4444', 0.08)`).
- **Charts**: Recharts with theme-aware colors. Chart background matches `background.paper`.
- **Tables**: MUI `Table` with `size="small"`, consistent with History page.
- **Chips**: Rounded (`borderRadius: 16` from theme), used for status indicators.
- **Alerts**: Default MUI `Alert` styling (dark-mode-aware).
- **Buttons**: `variant="contained"` for primary actions, `variant="outlined"` for secondary. `color="error"` for destructive actions (remove).
- **Spacing**: `Stack spacing={3}` for page-level, `Grid spacing={2}` for card grids.
- **Page layout**: Uses `TabbedPage` component (existing) for the metric tabs.

---

## 9. Implementation Order

Recommended order for implementation:

1. **Backend service** (`sensor-outlier.ts`) -- pure logic, testable in isolation.
2. **Backend endpoint** (`GET /api/sensors/analysis`) in `index.ts`.
3. **Frontend types** in `types/api.ts` and API hook in `useApi.ts`.
4. **Chart component** (`SensorTimeSeries.tsx`) -- the most visually complex piece.
5. **Table component** (`SensorHealthTable.tsx`) with status chips and checkboxes.
6. **Summary cards** (`MetricSummary.tsx`).
7. **Main page** (`SensorOutlier.tsx`) wiring everything together with TabbedPage.
8. **Navigation** -- add route to `App.tsx`, nav item to `Layout.tsx`.
9. **Remove action flow** -- checkbox selection, confirm dialog, PATCH request, refresh.
10. **Testing** -- verify with actual HA data, test both light and dark mode.

---

## 10. Estimated Effort

- Backend service + endpoint: ~200 lines
- Frontend page + components: ~600 lines
- Types + hook + routing: ~100 lines
- Total: ~900 lines across 8 files (5 new, 3 modified)
