import { useWeatherHistory, useConfig } from '../../hooks/useApi';
import { formatTemp, formatLength } from '../../utils/units';

export function WeatherSummary() {
  const { data: weather, loading } = useWeatherHistory();
  const { data: config } = useConfig();

  const units = config?.displayUnits || 'imperial';

  if (loading) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Current Weather</h2>
        <div className="text-sm text-gray-500">Loading weather data...</div>
      </div>
    );
  }

  // Get the most recent hourly data point
  const latest = weather?.hourly?.length ? weather.hourly[weather.hourly.length - 1] : null;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Weather Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Temperature */}
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">{latest ? (latest.temperature_c > 20 ? '\u2600\uFE0F' : '\u2601\uFE0F') : '\uD83C\uDF21\uFE0F'}</div>
          <div className="text-sm text-gray-500">Temperature</div>
          <div className="text-lg font-medium">
            {latest ? formatTemp(latest.temperature_c, units) : '--'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            7d avg: {weather ? formatTemp(weather.avg_temperature_c, units) : '--'}
          </div>
        </div>

        {/* Rainfall */}
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">{weather?.total_rainfall_mm && weather.total_rainfall_mm > 0 ? '\uD83C\uDF27\uFE0F' : '\u26AA'}</div>
          <div className="text-sm text-gray-500">Rain (7 days)</div>
          <div className="text-lg font-medium">
            {weather ? formatLength(weather.total_rainfall_mm, units) : '--'}
          </div>
          {weather?.last_rain_timestamp && (
            <div className="text-xs text-gray-400 mt-1">
              Last: {formatHoursAgo(weather.last_rain_timestamp)} ({formatLength(weather.last_rain_mm, units)})
            </div>
          )}
        </div>

        {/* Sunshine */}
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">{'\u2600\uFE0F'}</div>
          <div className="text-sm text-gray-500">Sunshine (7d)</div>
          <div className="text-lg font-medium">
            {weather ? `${weather.total_sunshine_hours.toFixed(0)}h` : '--h'}
          </div>
          {latest && latest.sunshine_hours > 0 && (
            <div className="text-xs text-yellow-600 mt-1">
              Now: {latest.sunshine_hours}h sun
            </div>
          )}
        </div>

        {/* Sensors */}
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">{weather ? '\u2705' : '\u26A0\uFE0F'}</div>
          <div className="text-sm text-gray-500">Data Status</div>
          <div className="text-lg font-medium">
            {weather ? 'Connected' : 'No data'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {weather ? `${weather.hourly.length}h history` : 'Configure sensors'}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatHoursAgo(ts: string): string {
  try {
    const diff = (Date.now() - new Date(ts).getTime()) / 3600000;
    if (diff < 1) return `${Math.round(diff * 60)}m ago`;
    if (diff < 24) return `${diff.toFixed(1)}h ago`;
    return `${(diff / 24).toFixed(1)}d ago`;
  } catch {
    return 'unknown';
  }
}
