import React from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { toDisplayLength, toDisplayTemp, tempUnit, lengthUnit } from '../../utils/units';
import type { DisplayUnits } from '../../utils/units';

interface HourData {
  timestamp: string;
  rainfall_mm: number;
  temperature_c: number;
  sunshine_hours: number;
}

interface Props {
  hourly: HourData[];
  units: DisplayUnits;
}

function weatherIcon(sun: number): string {
  if (sun >= 0.8) return '\u2600\uFE0F';
  if (sun >= 0.3) return '\u26C5';
  return '\u2601\uFE0F';
}

function rainIcon(mm: number): string {
  if (mm <= 0) return '';
  if (mm > 10) return ' \uD83C\uDF27\uFE0F';
  if (mm > 3) return ' \uD83D\uDCA7\uD83D\uDCA7';
  return ' \uD83D\uDCA7';
}

function localHour(iso: string): number {
  return new Date(iso).getHours();
}

function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayDateStr(d: Date): string {
  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
}

function displayDayKey(iso: string): string {
  const hr = localHour(iso);
  if (hr >= 6) return localDateStr(iso);
  return yesterdayDateStr(new Date(iso));
}

/** Check if an hour bucket has real sensor data (not pre-filled zeros). */
function hasRealData(h: HourData): boolean {
  return h.temperature_c > 0 || h.rainfall_mm > 0 || h.sunshine_hours > 0;
}

function slots(hours: HourData[], start: number, end: number): (HourData | null)[] {
  const r: (HourData | null)[] = Array(12).fill(null);
  for (const h of hours) {
    const hr = localHour(h.timestamp);
    let idx = -1;
    if (start <= end) {
      if (hr >= start && hr <= end) idx = hr - start;
    } else {
      if (hr >= start) idx = hr - start;
      else if (hr <= end) idx = (24 - start) + hr;
    }
    if (idx >= 0 && idx < 12) r[idx] = h;
  }
  return r;
}

function hourLabel(hr: number): string {
  const h = hr % 12 || 12;
  return `${h}${hr >= 12 ? 'p' : 'a'}`;
}

function rainDecimalPlaces(units: DisplayUnits): number {
  // Imperial rain amounts are tiny (0.001-0.100 in), need 3 places.
  // Metric rain amounts are larger (0.1-25.0 mm), 1 place is sufficient.
  return units === 'imperial' ? 3 : 1;
}

function cell(h: HourData | null, units: DisplayUnits) {
  if (!h) return (
    <TableCell align="center" sx={{ minWidth: '64px', width: '64px', py: 1, px: 0.5 }}>
      <Typography variant="caption" color="text.disabled">-</Typography>
    </TableCell>
  );

  const rain = toDisplayLength(h.rainfall_mm, units);
  const temp = toDisplayTemp(h.temperature_c, units);
  const hasRain = h.rainfall_mm > 0;
  const isHeavy = h.rainfall_mm > 5;
  const lenU = lengthUnit(units);
  const tmpU = tempUnit(units);
  const rainPlaces = rainDecimalPlaces(units);
  const localHr = localHour(h.timestamp);
  const timeLabel = localHr >= 12 ? `${localHr - 12 || 12}pm` : `${localHr}am`;
  const tip = `${timeLabel} | Rain:${rain.toFixed(rainPlaces)}${lenU}/h Temp:${Math.round(temp)}${tmpU} Sun:${(h.sunshine_hours * 100) | 0}%`;

  return (
    <TableCell
      align="center"
      sx={{
        minWidth: '64px',
        width: '64px',
        py: 1,
        px: 0.5,
        ...(hasRain ? {
          bgcolor: alpha('#ef4444', 0.08),
          border: '2px solid',
          borderColor: 'error.light',
        } : {}),
      }}
      title={tip}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', fontSize: '1.125rem', lineHeight: 1 }}>
          <span>{weatherIcon(h.sunshine_hours)}</span>
          {rainIcon(h.rainfall_mm)}
        </Box>
        <Typography
          variant="body2"
          component="span"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 'semibold',
            color: isHeavy ? 'error.main' : hasRain ? 'info.main' : 'text.primary',
          }}
        >
          {Math.round(temp)}
        </Typography>
        {hasRain && (
          <Typography
            variant="caption"
            component="span"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 'medium',
              fontSize: '0.625rem',
              color: isHeavy ? 'error.main' : 'info.main',
            }}
            title={`${rain.toFixed(rainPlaces)}${lenU}/h rain`}
          >
            {rain.toFixed(rainPlaces)}{lenU}
          </Typography>
        )}
      </Box>
    </TableCell>
  );
}

export function WeatherGrid({ hourly, units }: Props) {
  if (!hourly || hourly.length === 0) return <Typography variant="body2" color="text.secondary">No weather history available.</Typography>;
  const sorted = [...hourly].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const cutoff = Date.now() - 5 * 24 * 3600000;
  const filtered = sorted.filter(h => new Date(h.timestamp).getTime() >= cutoff);
  if (filtered.length === 0) return <Typography variant="body2" color="text.secondary">No data for past 5 days.</Typography>;

  // Only include days that have at least one hour of real sensor data
  // (excludes pre-filled zero buckets from the weather service)
  const validDayKeys = new Set<string>();
  for (const h of filtered) {
    if (hasRealData(h)) {
      validDayKeys.add(displayDayKey(h.timestamp));
    }
  }

  // Group by display day
  const byDay = new Map<string, HourData[]>();
  for (const h of filtered) {
    const key = displayDayKey(h.timestamp);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(h);
  }

  const dayKeys = Array.from(byDay.keys())
    .filter(k => validDayKeys.has(k))
    .sort((a, b) => b.localeCompare(a));

  const nowHr = new Date().getHours();
  const isCurrentlyDay = nowHr >= 6 && nowHr < 18;
  const todayKey = localDateStr(new Date().toISOString());

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const allRows: { key: string; label: string; period: string; hours: HourData[]; start: number; end: number }[] = [];
  /** Check if a period (day/night) has any real data. */
  function periodHasData(hours: HourData[], start: number, end: number): boolean {
    for (const h of hours) {
      const hr = localHour(h.timestamp);
      let inPeriod = false;
      if (start <= end) {
        inPeriod = hr >= start && hr <= end;
      } else {
        inPeriod = hr >= start || hr <= end;
      }
      if (inPeriod && hasRealData(h)) return true;
    }
    return false;
  }

  for (const dayKey of dayKeys) {
    const hours = byDay.get(dayKey)!;
    const labelDate = new Date(dayKey + 'T12:00:00');
    const label = `${dayNames[labelDate.getDay()]} ${labelDate.getMonth() + 1}/${labelDate.getDate()}`;

    // Night period first (more recent in reverse-chronological order)
    // Only add night period if it has data and it's not the current day during daytime
    if (dayKey !== todayKey || !isCurrentlyDay) {
      if (periodHasData(hours, 18, 5)) {
        allRows.push({ key: `${dayKey}-night`, label, period: '6pm-6am', hours, start: 18, end: 5 });
      }
    }

    // Day period second
    if (periodHasData(hours, 6, 17)) {
      allRows.push({ key: `${dayKey}-day`, label, period: '6am-6pm', hours, start: 6, end: 17 });
    }
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
            <TableCell sx={{ py: 1, px: 1, fontSize: '0.75rem', fontWeight: 'semibold', color: 'text.secondary', width: '56px' }}>Day</TableCell>
            <TableCell sx={{ py: 1, px: 0.5, fontSize: '0.75rem', fontWeight: 'semibold', color: 'text.secondary', width: '64px' }}>Period</TableCell>
            <TableCell colSpan={12} sx={{ py: 1, px: 0.5, textAlign: 'center', fontSize: '0.625rem', fontWeight: 'medium', color: 'text.disabled' }}>Hour (local time)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {allRows.map((row) => (
            <React.Fragment key={row.key}>
              <TableRow sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <TableCell sx={{ py: 0.5, px: 1, fontSize: '0.75rem', fontWeight: 'semibold', color: 'text.primary', whiteSpace: 'nowrap', borderRight: 1, borderColor: 'divider', align: 'top' }} rowSpan={2}>{row.label}</TableCell>
                <TableCell sx={{ py: 0.5, px: 0.5, fontSize: '0.625rem', color: 'text.disabled', fontWeight: 'medium', align: 'top' }} rowSpan={2}>{row.period}</TableCell>
                {Array.from({ length: 12 }, (_, i) => {
                  const hr = row.start <= row.end ? row.start + i : (row.start + i) % 24;
                  return (
                    <TableCell key={i} sx={{ py: 0.5, px: 0.5, textAlign: 'center', fontSize: '0.625rem', fontWeight: 'medium', color: 'text.disabled', minWidth: '64px', width: '64px' }}>
                      {hourLabel(hr)}
                    </TableCell>
                  );
                })}
              </TableRow>
              <TableRow
                sx={{
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s',
                }}
              >
                {slots(row.hours, row.start, row.end).map((h, idx) => (
                  <React.Fragment key={idx}>{cell(h, units)}</React.Fragment>
                ))}
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, px: 1 }}>
        <Typography variant="caption" color="text.disabled">Columns are 1-hour slots within the period</Typography>
        <Typography variant="caption">
          <Box component="span" sx={{ display: 'inline-block', width: 12, height: 12, bgcolor: alpha('#ef4444', 0.08), border: '1px solid', borderColor: 'error.light', borderRadius: 0.5, mr: 0.5 }} />
          Rain
        </Typography>
      </Box>
    </Box>
  );
}
