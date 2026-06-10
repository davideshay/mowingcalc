import { Card, CardContent, Typography, Box, Grid, CircularProgress } from '@mui/material';
import { useWeatherHistory, useConfig } from '../../hooks/useApi';
import { formatTemp, formatLength } from '../../utils/units';

export function WeatherSummary() {
  const { data: weather, loading } = useWeatherHistory();
  const { data: config } = useConfig();

  const units = config?.displayUnits || 'imperial';

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Current Weather</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Get the most recent hourly data point
  const latest = weather?.hourly?.length ? weather.hourly[weather.hourly.length - 1] : null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>Weather Summary</Typography>
        <Grid container spacing={2}>
          {/* Temperature */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Box sx={{ textAlign: 'center', bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {latest ? (latest.temperature_c > 20 ? '\u2600\uFE0F' : '\u2601\uFE0F') : '\uD83C\uDF21\uFE0F'}
              </Typography>
              <Typography variant="body2" color="text.secondary">Temperature</Typography>
              <Typography variant="h6">
                {latest ? formatTemp(latest.temperature_c, units) : '--'}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                7d avg: {weather ? formatTemp(weather.avg_temperature_c, units) : '--'}
              </Typography>
            </Box>
          </Grid>

          {/* Rainfall */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Box sx={{ textAlign: 'center', bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {weather?.total_rainfall_mm && weather.total_rainfall_mm > 0 ? '\uD83C\uDF27\uFE0F' : '\u26AA'}
              </Typography>
              <Typography variant="body2" color="text.secondary">Rain (7 days)</Typography>
              <Typography variant="h6">
                {weather ? formatLength(weather.total_rainfall_mm, units) : '--'}
              </Typography>
              {weather?.last_rain_timestamp && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                  Last: {formatHoursAgo(weather.last_rain_timestamp)} ({formatLength(weather.last_rain_mm, units)})
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Sunshine */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Box sx={{ textAlign: 'center', bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
              <Typography variant="h4" sx={{ mb: 0.5 }}>{'\u2600\uFE0F'}</Typography>
              <Typography variant="body2" color="text.secondary">Sunshine (7d)</Typography>
              <Typography variant="h6">
                {weather ? `${weather.total_sunshine_hours.toFixed(0)}h` : '--h'}
              </Typography>
              {latest && latest.sunshine_hours > 0 && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                  Now: {latest.sunshine_hours}h sun
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Sensors */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Box sx={{ textAlign: 'center', bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                {weather ? '\u2705' : '\u26A0\uFE0F'}
              </Typography>
              <Typography variant="body2" color="text.secondary">Data Status</Typography>
              <Typography variant="h6">
                {weather ? 'Connected' : 'No data'}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                {weather ? `${weather.hourly.length}h history` : 'Configure sensors'}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
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
