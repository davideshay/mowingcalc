import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import {
  Box,
  Typography,
  Chip,
  useTheme,
} from '@mui/material';
import { SensorAnalysis } from '../../types/api';

interface Props {
  sensors: SensorAnalysis[];
  unit: string;
}

/**
 * Aggregate 5-min readings to hourly buckets.
 * Reduces ~2880 points to ~240 for 10-day window.
 */
function aggregateToHourly(readings: Array<{ timestamp: string; value: number }>): Array<{ time: string; value: number }> {
  const hourlyMap = new Map<string, number[]>();

  for (const r of readings) {
    const ts = new Date(r.timestamp);
    const hourKey = format(ts, 'yyyy-MM-dd HH:00');
    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, []);
    }
    hourlyMap.get(hourKey)!.push(r.value);
  }

  return Array.from(hourlyMap.entries())
    .map(([time, values]) => ({
      time,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Build a merged dataset with all sensors aligned by time. */
function buildChartData(sensors: SensorAnalysis[]): Record<string, unknown>[] {
  // Collect all hourly time keys
  const allTimeKeys = new Set<string>();
  const sensorHourly = sensors.map((sensor) => {
    const hourly = aggregateToHourly(
      sensor.readings.map((r) => ({ timestamp: r.timestamp, value: r.value })),
    );
    hourly.forEach((h) => allTimeKeys.add(h.time));
    return { entity_id: sensor.entity_id, hourly };
  });

  // Build a map: time -> { entity_id -> value }
  const dataMap = new Map<string, Record<string, number>>();
  sensorHourly.forEach(({ entity_id, hourly }) => {
    // Index by short entity name
    const shortName = entity_id.split('.').pop() || entity_id;
    hourly.forEach((h) => {
      if (!dataMap.has(h.time)) dataMap.set(h.time, {});
      (dataMap.get(h.time) as Record<string, number>)[shortName] = h.value;
    });
  });

  // Sort by time and build chart rows
  const sortedTimes = Array.from(allTimeKeys).sort();
  return sortedTimes.map((time) => ({
    time,
    ...dataMap.get(time),
  }));
}

function sensorColor(severity: string, theme: any): string {
  if (severity === 'critical') return theme.palette.error.main;
  if (severity === 'warning') return theme.palette.warning.main;
  return theme.palette.primary.main;
}

function maxSeverity(flags: Array<{ severity: string }>): string {
  if (flags.some((f) => f.severity === 'critical')) return 'critical';
  if (flags.some((f) => f.severity === 'warning')) return 'warning';
  return 'ok';
}

/** Custom legend content */
function CustomLegend({ sensors, colorMap }: { sensors: SensorAnalysis[]; colorMap: Record<string, string> }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', pt: 1 }}>
      {sensors.map((sensor) => {
        const shortName = sensor.entity_id.split('.').pop() || sensor.entity_id;
        const severity = maxSeverity(sensor.flags);
        const color = colorMap[shortName];
        return (
          <Box key={sensor.entity_id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 3, bgcolor: color, borderRadius: 1 }} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
              {shortName}
            </Typography>
            {severity !== 'ok' && (
              <Chip
                label={severity.toUpperCase()}
                size="small"
                color={severity === 'critical' ? 'error' : 'warning'}
                sx={{ fontSize: '0.5rem', height: 16, minWidth: 24, ml: 0.5 }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export function SensorTimeSeries({ sensors, unit }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const chartData = useMemo(() => buildChartData(sensors), [sensors]);

  // Build color map: entity short name -> color
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sensor of sensors) {
      const shortName = sensor.entity_id.split('.').pop() || sensor.entity_id;
      const severity = maxSeverity(sensor.flags);
      map[shortName] = sensorColor(severity, theme);
    }
    return map;
  }, [sensors, theme]);

  if (sensors.length === 0) {
    return (
      <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">No sensor data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#e5e7eb'} />
            <XAxis
              dataKey="time"
              tickFormatter={(val) => format(new Date(val), 'MM/dd HH:mm')}
              stroke={isDark ? '#9ca3af' : '#6b7280'}
              fontSize={11}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke={isDark ? '#9ca3af' : '#6b7280'}
              fontSize={11}
              tickFormatter={(val) => `${val}${unit}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#1f2937' : '#fff',
                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(label) => format(new Date(label as string), 'MM/dd HH:mm')}
            />
            <Legend
              wrapperStyle={{
                fontSize: 11,
                paddingTop: 8,
              }}
              formatter={() => ''}
              content={() => <CustomLegend sensors={sensors} colorMap={colorMap} />}
            />

            {/* Group median reference line */}
            {sensors.length > 0 && (() => {
              const means = sensors
                .map((s) => s.stats.mean)
                .filter((m) => m !== null && m > 0) as number[];
              if (means.length > 0) {
                const sorted = [...means].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                const medianVal = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                return (
                  <ReferenceLine
                    y={medianVal}
                    stroke={isDark ? '#6b7280' : '#9ca3af'}
                    strokeDasharray="4 4"
                    label={{
                      value: `Median ${medianVal.toFixed(2)}${unit}`,
                      position: 'right',
                      fill: isDark ? '#9ca3af' : '#6b7280',
                      fontSize: 10,
                      offset: 4,
                    }}
                  />
                );
              }
              return null;
            })()}

            {/* One line per sensor */}
            {sensors.map((sensor) => {
              const shortName = sensor.entity_id.split('.').pop() || sensor.entity_id;
              const severity = maxSeverity(sensor.flags);
              const color = colorMap[shortName];
              return (
                <Line
                  key={sensor.entity_id}
                  type="monotone"
                  dataKey={shortName}
                  stroke={color}
                  strokeWidth={severity === 'critical' ? 2.5 : severity === 'warning' ? 2 : 1.5}
                  opacity={severity === 'critical' ? 1 : severity === 'warning' ? 0.85 : 0.55}
                  dot={false}
                  connectNulls
                  name={shortName}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
