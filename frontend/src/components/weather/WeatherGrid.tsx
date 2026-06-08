import React from 'react';
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
  significantThreshold: number;
}

function weatherIcon(sun: number): string {
  if (sun >= 0.8) return '\u2600\uFE0F';
  if (sun >= 0.3) return '\u26C5';
  return '\u2601\uFE0F';
}

function rainIcon(mm: number, t: number): string {
  if (mm <= 0) return '';
  if (mm > t * 3) return ' \uD83C\uDF27\uFE0F';
  if (mm > t) return ' \uD83D\uDCA7\uD83D\uDCA7';
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

function cell(h: HourData | null, units: DisplayUnits, t: number) {
  if (!h) return (
    <td className="py-2 px-1 text-center" style={{ minWidth: '64px', width: '64px' }}>
      <span className="text-xs text-gray-300">-</span>
    </td>
  );

  const rain = toDisplayLength(h.rainfall_mm, units);
  const temp = toDisplayTemp(h.temperature_c, units);
  const hasRain = h.rainfall_mm > 0;
  const isSignificant = h.rainfall_mm > t;
  const lenU = lengthUnit(units);
  const tmpU = tempUnit(units);
  const localHr = localHour(h.timestamp);
  const timeLabel = localHr >= 12 ? `${localHr - 12 || 12}pm` : `${localHr}am`;
  const tip = `${timeLabel} | Rain:${rain.toFixed(2)}${lenU}/h Temp:${Math.round(temp)}${tmpU} Sun:${(h.sunshine_hours * 100) | 0}%`;

  return (
    <td
      className={`py-2 px-1 text-center ${hasRain ? (isSignificant ? 'bg-red-50' : 'bg-blue-50') : ''}`}
      style={{ minWidth: '64px', width: '64px' }}
      title={tip}
    >
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center text-lg leading-none">
          <span className="text-base">{weatherIcon(h.sunshine_hours)}</span>
          {rainIcon(h.rainfall_mm, t)}
        </div>
        <span className={`text-base font-mono font-semibold ${
          isSignificant ? 'text-red-600' : hasRain ? 'text-blue-600' : 'text-gray-800'
        }`}>{Math.round(temp)}</span>
      </div>
    </td>
  );
}

export function WeatherGrid({ hourly, units, significantThreshold }: Props) {
  if (!hourly || hourly.length === 0) return <p className="text-sm text-gray-500">No weather history available.</p>;
  const sorted = [...hourly].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const cutoff = Date.now() - 5 * 24 * 3600000;
  const filtered = sorted.filter(h => new Date(h.timestamp).getTime() >= cutoff);
  if (filtered.length === 0) return <p className="text-sm text-gray-500">No data for past 5 days.</p>;

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

    // Only add day period if it has data
    if (periodHasData(hours, 6, 17)) {
      allRows.push({ key: `${dayKey}-day`, label, period: '6am-6pm', hours, start: 6, end: 17 });
    }

    // Only add night period if it has data and it's not the current day during daytime
    if (dayKey !== todayKey || !isCurrentlyDay) {
      if (periodHasData(hours, 18, 5)) {
        allRows.push({ key: `${dayKey}-night`, label, period: '6pm-6am', hours, start: 18, end: 5 });
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 w-14">Day</th>
            <th className="text-left py-2 px-1 text-xs font-semibold text-gray-500 w-16">Period</th>
            <th colSpan={12} className="py-2 px-1 text-center text-[10px] font-medium text-gray-400">Hour (local time)</th>
          </tr>
        </thead>
        <tbody>
          {allRows.map((row) => (
            <React.Fragment key={row.key}>
              <tr className="border-b border-gray-100">
                <td className="py-1 px-2 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 align-top" rowSpan={2}>{row.label}</td>
                <td className="py-0.5 px-1 text-[10px] text-gray-400 font-medium align-top" rowSpan={2}>{row.period}</td>
                {Array.from({ length: 12 }, (_, i) => {
                  const hr = row.start <= row.end ? row.start + i : (row.start + i) % 24;
                  return <td key={i} className="py-0.5 px-1 text-center text-[10px] font-medium text-gray-400" style={{ minWidth: '64px', width: '64px' }}>{hourLabel(hr)}</td>;
                })}
              </tr>
              <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                {slots(row.hours, row.start, row.end).map((h) => cell(h, units, significantThreshold))}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-4 mt-2 px-2">
        <span className="text-xs text-gray-400">Columns are 1-hour slots within the period</span>
        <span className="text-xs"><span className="inline-block w-3 h-3 bg-red-50 border border-red-200 rounded mr-1"></span>Significant rain</span>
        <span className="text-xs"><span className="inline-block w-3 h-3 bg-blue-50 border border-blue-200 rounded mr-1"></span>Any rain</span>
      </div>
    </div>
  );
}
