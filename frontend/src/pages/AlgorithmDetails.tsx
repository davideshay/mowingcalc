import React from 'react';
import { useAlgorithmState, useConfig, useForecast, useWeatherHistory } from '../hooks/useApi';
import { format } from 'date-fns';
import { WeatherSummary } from '../components/weather/WeatherSummary';
import { WeatherGrid } from '../components/weather/WeatherGrid';
import { formatLength, formatTemp, toDisplayLength } from '../utils/units';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Grid,
  LinearProgress,
  Paper,
  Divider,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';

function conditionIcon(condition: string, isDaytime?: boolean) {
  const map: Record<string, string> = {
    sunny: isDaytime === false ? '\uD83C\uDF19' : '\u2600\uFE0F',
    clear: isDaytime === false ? '\uD83C\uDF19' : '\u2600\uFE0F',
    cloudy: '\u2601\uFE0F',
    'partlycloudy': '\u26C5',
    'partly-cloudy': '\u26C5',
    'partly_cloudy': '\u26C5',
    rainy: '\uD83C\uDF27\uFE0F',
    drizzle: '\uD83C\uDF27\uFE0F',
    snowy: '\u2744\uFE0F',
    windy: '\uD83D\uDCA8',
    fog: '\uD83C\uDF2B\uFE0F',
    night: '\uD83C\uDF19',
    'clear-night': '\uD83C\uDF19',
    'sunny-night': '\uD83C\uDF19',
    'cloudy-night': '\u2601\uFE0F',
    'partlycloudy-night': '\u26C5',
  };
  return map[condition.toLowerCase()] || (isDaytime === false ? '\uD83C\uDF19' : '\uD83C\uDF24\uFE0F');
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'N/A';
  try {
    return format(new Date(ts), 'EEE MMM d, h:mm a');
  } catch {
    return ts;
  }
}

function hoursAgo(ts: string | null): string {
  if (!ts) return 'N/A';
  try {
    const diff = (Date.now() - new Date(ts).getTime()) / 3600000;
    if (diff < 1) return `${Math.round(diff * 60)}m ago`;
    if (diff < 24) return `${diff.toFixed(1)}h ago`;
    return `${(diff / 24).toFixed(1)}d ago`;
  } catch {
    return 'N/A';
  }
}

function intensityColor(intensity: string): string {
  switch (intensity) {
    case 'none': return 'text.disabled';
    case 'light': return 'info.main';
    case 'moderate': return 'warning.main';
    case 'heavy': return 'error.main';
    default: return 'text.disabled';
  }
}

export function AlgorithmDetails() {
  const { data: algo, loading: algoLoading } = useAlgorithmState();
  const { data: config, loading: configLoading } = useConfig();
  const { data: forecast, loading: forecastLoading } = useForecast();
  const { data: weatherHistory, loading: weatherLoading } = useWeatherHistory();

  if (algoLoading || configLoading || forecastLoading || weatherLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 256 }}>
        <CircularProgress />
      </Box>
    );
  }

  const growthModel = config?.growthModel || {};
  const rainModel = config?.rainDelayModel || {};
  const details = algo?.rain_delay_details;
  const units = config?.displayUnits || 'metric';

  const upperLimit = config?.growthUpperLimit ?? 6;
  const lowerLimit = config?.growthLowerLimit ?? 3;
  const growthValue = Math.min(100, ((algo?.growth_mm ?? 0) / upperLimit) * 100);
  const lowerPct = Math.min(100, (lowerLimit / upperLimit) * 100);
  const growthBarColor = algo?.growth_mm != null && algo.growth_mm >= upperLimit
    ? 'error.main'
    : algo?.growth_mm != null && algo.growth_mm >= lowerLimit
      ? 'primary.main'
      : 'action.disabledBackground';

  const safeThreshold = details?.safe_moisture_threshold ?? algo?.field_capacity_pct ?? 0;
  const moistureValue = Math.min(100, (algo?.estimated_soil_moisture_pct || 0));
  const moistureBarColor = algo?.estimated_soil_moisture_pct && algo.estimated_soil_moisture_pct > safeThreshold
    ? 'error.main'
    : 'success.main';

  return (
    <Stack spacing={3}>
      {/* Page Header */}
      <Box>
        <Typography variant="h4">Algorithm Details</Typography>
        <Typography variant="body2" color="text.secondary">
          Growth model breakdown and current calculations
        </Typography>
      </Box>

      {/* Growth Model - FULL BREAKDOWN */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Growth Model</Typography>

          {/* Growth estimate banner */}
          <Card
            sx={{
              mb: 2,
              bgcolor: 'action.hover',
              borderColor: algo?.should_mow ? 'success.main' : 'info.main',
              borderWidth: 1,
              borderStyle: 'solid',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Estimated growth since last mow
                  </Typography>
                  <Typography variant="h4">
                    {formatLength(algo?.growth_mm ?? 0, units)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    daily rate: {toDisplayLength(algo?.daily_growth_mm ?? 0, units).toFixed(2)} {units === 'imperial' ? 'in' : 'mm'}/day
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" color="text.secondary">Hours since mow</Typography>
                  <Typography variant="h5">{algo?.hours_since_mow?.toFixed(0)}h</Typography>
                  <Typography variant="caption" color="text.disabled">
                    Last: {algo?.last_mow_time ? new Date(algo.last_mow_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A'}
                  </Typography>
                </Box>
              </Box>

              {/* Growth progress bar */}
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.disabled">
                    Lower limit: {formatLength(lowerLimit, units)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Upper limit: {formatLength(upperLimit, units)}
                  </Typography>
                </Box>
                <Box sx={{ position: 'relative' }}>
                  <LinearProgress
                    variant="determinate"
                    value={growthValue}
                    sx={{
                      height: 12,
                      borderRadius: 6,
                      bgcolor: 'action.disabledBackground',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 6,
                        backgroundColor: growthBarColor,
                      },
                    }}
                  />
                  {/* Lower threshold marker */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${lowerPct}%`,
                      width: 1,
                      bgcolor: 'primary.main',
                      zIndex: 10,
                    }}
                    title={`Lower limit: ${formatLength(lowerLimit, units)}`}
                  />
                  {/* Upper threshold marker */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      right: 0,
                      width: 1,
                      bgcolor: 'error.main',
                      zIndex: 10,
                    }}
                    title={`Upper limit: ${formatLength(upperLimit, units)}`}
                  />
                </Box>
                {/* Legend */}
                <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                    Lower: {formatLength(lowerLimit, units)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
                    Upper: {formatLength(upperLimit, units)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.disabledBackground' }} />
                    Current: {formatLength(algo?.growth_mm ?? 0, units)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            {/* Calculation Breakdown */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium', color: 'text.secondary' }}>
                Calculation Breakdown
              </Typography>
              <Stack spacing={1}>
                {/* Temperature stats */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Avg temperature:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{formatTemp(algo?.avg_temperature_c ?? 0, units)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Min temperature:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{formatTemp(algo?.min_temperature_c ?? 0, units)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Max temperature:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{formatTemp(algo?.max_temperature_c ?? 0, units)}</Typography>
                </Box>
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 'medium', color: 'text.secondary' }}>
                  Growth Factors (each 0-1.5)
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">GP factor (temp):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(algo?.gp_factor ?? 0).toFixed(3)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Moisture factor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(algo?.moisture_factor ?? 0).toFixed(3)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Sun factor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(algo?.sun_factor ?? 0).toFixed(3)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Soil factor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(algo?.soil_factor ?? 0).toFixed(3)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Seasonal factor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(algo?.seasonal_factor ?? 0).toFixed(3)}</Typography>
                </Box>
                <Typography variant="caption" color="text.disabled">
                  Combined: {((algo?.gp_factor ?? 0) * (algo?.moisture_factor ?? 0) * (algo?.sun_factor ?? 0) * (algo?.soil_factor ?? 0) * (algo?.seasonal_factor ?? 0)).toFixed(3)} → scaled daily rate
                </Typography>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Hours processed:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{algo?.total_hours_processed ?? 0}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">GP optimal temp:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{formatTemp(algo?.gp_optimal_temp ?? 20, units)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">GP standard deviation:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{algo?.gp_sd?.toFixed(1)}°C</Typography>
                </Box>
              </Stack>
            </Grid>

            {/* Model Parameters */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium', color: 'text.secondary' }}>
                Model Parameters
              </Typography>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Base rate:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{toDisplayLength(algo?.base_rate_daily ?? 0, units).toFixed(2)} {units === 'imperial' ? 'in' : 'mm'}/day</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Optimal temp range:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{formatTemp(growthModel.tempOptimalMin, units)}-{formatTemp(growthModel.tempOptimalMax, units)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Rain multiplier:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{growthModel.rainMultiplier}x</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Sun growth boost:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>+{(growthModel.sunGrowthBoost ?? 0).toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Soil type:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium', textTransform: 'capitalize' }}>{growthModel.soilType || 'loam'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Latitude:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{growthModel.latitude || 40}°</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Grass type:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium', textTransform: 'capitalize' }}>{config?.grassType || 'tall_fescue'}</Typography>
                </Box>

                {/* How the formula works */}
                <Paper elevation={0} sx={{ mt: 2, bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'medium', color: 'text.secondary', display: 'block', mb: 1 }}>
                    Formula (GCSAA Growth Potential + Environmental Factors)
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}>
                    daily_growth = baseRate × GP × moisture × sun × soil × seasonal
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    GP = exp(-0.5 × ((T - T<sub>opt</sub>) / σ)²)
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    T<sub>opt</sub> = {growthModel.tempOptimalMin}-{growthModel.tempOptimalMax}°C, σ = {algo?.gp_sd ?? 5.56}°C
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    moisture = f(VWC, soil_type) — VWC from SoilMoistureTracker
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    sun = 1 + sunshine_fraction × {growthModel.sunGrowthBoost}
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    soil = {growthModel.soilType === 'sand' ? 0.85 : growthModel.soilType === 'clay' ? 0.90 : 1.00} ({growthModel.soilType})
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    seasonal = photoperiod curve (lat {growthModel.latitude}°)
                  </Typography>
                </Paper>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Rain Delay Model - FULL BREAKDOWN */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Rain Delay Model</Typography>

          {/* Safe to mow banner */}
          <Card
            sx={{
              mb: 2,
              bgcolor: 'action.hover',
              borderColor: algo?.is_safe_to_mow ? 'success.main' : 'warning.main',
              borderWidth: 1,
              borderStyle: 'solid',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Safe to mow?</Typography>
                  <Typography
                    variant="h5"
                    sx={{ color: algo?.is_safe_to_mow ? 'success.main' : 'warning.main' }}
                  >
                    {algo?.is_safe_to_mow ? 'Yes' : 'No'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  {!algo?.is_safe_to_mow && (
                    <>
                      <Typography variant="body2" color="text.secondary">Earliest safe in</Typography>
                      <Typography variant="h5" sx={{ color: 'warning.main' }}>{algo?.rain_delay_hours?.toFixed(0)}h</Typography>
                      <Typography variant="caption" color="text.disabled">Optimal: {algo?.optimal_delay_hours?.toFixed(0)}h</Typography>
                    </>
                  )}
                  {algo?.is_safe_to_mow && algo?.safe_to_mow_time && (
                    <>
                      <Typography variant="body2" color="text.secondary">Safe to mow since</Typography>
                      {(() => {
                        const safeSince = new Date(algo.safe_to_mow_time);
                        const hoursAgo = (Date.now() - safeSince.getTime()) / 3600000;
                        return (
                          <>
                            <Typography variant="h5" sx={{ color: 'success.main' }}>
                              {hoursAgo < 1
                                ? `${Math.round(hoursAgo * 60)}m ago`
                                : hoursAgo < 24
                                  ? `${hoursAgo.toFixed(1)}h ago`
                                  : `${(hoursAgo / 24).toFixed(1)}d ago`}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                              {format(safeSince, 'EEE MMM d, h:mm a')}
                            </Typography>
                          </>
                        );
                      })()}
                    </>
                  )}
                  {algo?.is_safe_to_mow && !details?.last_significant_rain && (
                    <Typography variant="body2" color="success.main">Soil moisture OK</Typography>
                  )}
                </Box>
              </Box>

              {/* Soil moisture bar with safe/optimal/FC markers */}
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.disabled">
                    Current: {algo?.estimated_soil_moisture_pct?.toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Field capacity: {algo?.field_capacity_pct}%
                  </Typography>
                </Box>
                <Box sx={{ position: 'relative' }}>
                  <LinearProgress
                    variant="determinate"
                    value={moistureValue}
                    sx={{
                      height: 12,
                      borderRadius: 6,
                      bgcolor: 'action.disabledBackground',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 6,
                        backgroundColor: moistureBarColor,
                      },
                    }}
                  />
                  {/* Safe threshold marker (for robot mowers, above FC) */}
                  {details?.safe_moisture_threshold != null && details.safe_moisture_threshold > 0 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${Math.min(100, details.safe_moisture_threshold)}%`,
                        width: 1,
                        bgcolor: 'success.main',
                        zIndex: 10,
                      }}
                      title={`Safe threshold: ${details.safe_moisture_threshold.toFixed(0)}%`}
                    />
                  )}
                  {/* Optimal threshold marker */}
                  {details?.optimal_moisture_threshold != null && details.optimal_moisture_threshold > 0 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${Math.min(100, details.optimal_moisture_threshold)}%`,
                        width: 1,
                        bgcolor: 'primary.main',
                        zIndex: 10,
                      }}
                      title={`Optimal threshold: ${details.optimal_moisture_threshold.toFixed(0)}%`}
                    />
                  )}
                </Box>
                {/* Threshold legend */}
                <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.625rem' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                    Optimal: {details?.optimal_moisture_threshold?.toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.625rem' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                    Safe: {details?.safe_moisture_threshold?.toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.625rem' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.disabledBackground' }} />
                    FC: {algo?.field_capacity_pct}%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            {/* Calculation breakdown */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium', color: 'text.secondary' }}>
                Calculation Breakdown
              </Typography>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Last rain:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium', textAlign: 'right' }}>
                    {details?.last_significant_rain
                      ? `${hoursAgo(details.last_significant_rain)} (${formatTimestamp(details.last_significant_rain)})`
                      : 'None detected'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Rainfall amount:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{formatLength(details?.last_rain_mm ?? 0, units)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Rain intensity:</Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 'medium', textTransform: 'capitalize', color: intensityColor(details?.rain_intensity || 'none') }}
                  >
                    {details?.rain_intensity || 'none'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Hours since rain:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.hours_since_rain?.toFixed(1)}h</Typography>
                </Box>
                <Divider />
                <Typography variant="caption" sx={{ fontWeight: 'medium', color: 'text.secondary' }}>
                  Model Output
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Time to safe (model):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.time_to_safe_hours?.toFixed(1)}h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Time to optimal (model):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.time_to_optimal_hours?.toFixed(1)}h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Min delay floor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.min_delay_floor_hours}h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Max delay ceiling:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.max_delay_ceil_hours}h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Current moisture (estimated):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{algo?.estimated_soil_moisture_pct?.toFixed(1)}%</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography variant="body2" color="text.secondary">Drying time constant (tau)</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.drying_time_constant}h</Typography>
                </Box>
                <Typography variant="caption" color="text.disabled">Base soil drying rate (sand:24h, loam:72h, clay:168h)</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Typography variant="body2" color="text.secondary">Effective tau</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.effective_tau?.toFixed(1)}h</Typography>
                </Box>
                <Typography variant="caption" color="text.disabled">Actual drying rate = base tau adjusted by sun &amp; temperature modifiers. When both modifiers are 0 (no sun/warmth since last rain), effective tau equals base tau. Lower values mean faster drying.</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Sun drying effect:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(details?.sun_drying_modifier ?? 0).toFixed(3)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Temp drying effect:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{(details?.temp_drying_modifier ?? 0).toFixed(3)}</Typography>
                </Box>
              </Stack>
            </Grid>

            {/* Model Parameters */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium', color: 'text.secondary' }}>
                Model Parameters
              </Typography>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Mower weight:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{rainModel.mowerWeightLbs ?? 65} lbs</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Soil type:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium', textTransform: 'capitalize' }}>{rainModel.soilType}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Compaction threshold:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{((details?.compaction_threshold ?? 1.05) * 100).toFixed(0)}% of FC</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Surface dry factor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{((details?.surface_dry_factor ?? 0.3) * 100).toFixed(0)}%</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Safe threshold:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.safe_moisture_threshold?.toFixed(0)}%</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Optimal threshold:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{details?.optimal_moisture_threshold?.toFixed(0)}%</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Min delay (floor):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{rainModel.minDelayAfterRain}h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Max delay (ceiling):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{rainModel.heavyRainDelay}h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Sun drying:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{rainModel.sunDryingRate}/h</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Temp factor:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{rainModel.tempDryingFactor}</Typography>
                </Box>

                {/* How the formula works */}
                <Paper elevation={0} sx={{ mt: 2, bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'medium', color: 'text.secondary', display: 'block', mb: 1 }}>
                    Formula (Exponential Decay + Robot Mower Model)
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}>
                    SWC(t) = &theta;_res + (SWC<sub>0</sub> - &theta;_res) &times; e<sup>-t/&tau;</sup>
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    t_safe = -&tau; &times; ln((C&times;FC - &theta;_res) / (SWC<sub>0</sub> - &theta;_res))
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    C = compaction threshold (1.05 for robot, 1.0 for conventional)
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    t_optimal = -&tau; &times; ln(((1-SD)&times;FC - &theta;_res) / (SWC<sub>0</sub> - &theta;_res))
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    SD = surface dry factor (0.3 default = 30% extra drying for cut quality)
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                    effective &tau; = &tau; &times; max(0.5, 1 - (sun + temp) &times; 0.2)
                  </Typography>
                </Paper>

                {/* Expected safe time */}
                {!algo?.is_safe_to_mow && algo?.safe_to_mow_time && (
                  <Paper elevation={0} sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'medium', color: 'warning.main', display: 'block', mb: 0.5 }}>
                      Earliest safe to mow
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                      {format(new Date(algo.safe_to_mow_time), 'EEE MMM d, h:mm a')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: 0.5 }}>
                      (Optimal: {format(new Date(new Date(algo.safe_to_mow_time).getTime() + (algo?.optimal_delay_hours - algo?.rain_delay_hours || 0) * 3600000), 'EEE MMM d, h:mm a')})
                    </Typography>
                  </Paper>
                )}
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Weather History - compact grid */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="h6">Weather History (5 days)</Typography>
            {weatherHistory && (
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                {formatLength(weatherHistory.total_rainfall_mm ?? 0, units)} rain &middot; {formatTemp(weatherHistory.avg_temperature_c ?? 0, units)} avg &middot; {weatherHistory.total_sunshine_hours?.toFixed(0)}h sun
              </Typography>
            )}
          </Box>
          <WeatherGrid
            hourly={weatherHistory?.hourly || []}
            units={units}
          />
        </CardContent>
      </Card>

      {/* Decision Info */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Decision Summary</Typography>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Decision:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'medium', mt: 0.5 }}>{algo?.reason}</Typography>
            </Paper>
            {algo?.next_review && (
              <Paper elevation={0} sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">Next review:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'medium', mt: 0.5 }}>{format(new Date(algo.next_review), 'EEEE, MMMM d, yyyy h:mm a')}</Typography>
              </Paper>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Hourly Forecast - compact grid, 4 rows x 12 cols = 48 hours */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Hourly Forecast (next 48h)</Typography>
          {forecast?.hourly && forecast.hourly.length > 0 ? (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableBody>
                  {[0, 12, 24, 36].map((offset) => {
                    const chunk = forecast.hourly.slice(offset, offset + 12);
                    if (chunk.length === 0) return null;
                    const startDate = new Date(chunk[0].datetime);
                    const startDateLabel = format(startDate, 'EEE MMM d');
                    return (
                      <React.Fragment key={offset}>
                        {/* Time header row */}
                        <TableRow sx={{ borderBottom: 1, borderColor: 'divider' }}>
                          <TableCell sx={{ py: 0.5, px: 0.5, fontSize: '0.625rem', fontWeight: 'medium', color: 'text.disabled', minWidth: '72px', width: '72px' }}>
                            {offset === 0 ? 'Today' : offset === 36 ? 'Day 3' : offset === 24 ? 'Day 2' : 'Day 1'} ({startDateLabel})
                          </TableCell>
                          {chunk.map((hour, i) => {
                            const time = new Date(hour.datetime);
                            const hr = time.getHours();
                            const h = hr % 12 || 12;
                            const timeLabel = `${h}${hr >= 12 ? 'p' : 'a'}`;
                            return (
                              <TableCell key={i} sx={{ py: 0.5, px: 0.5, textAlign: 'center', fontSize: '0.625rem', fontWeight: 'medium', color: 'text.disabled', minWidth: '56px', width: '56px' }}>
                                {timeLabel}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                        {/* Data row */}
                        <TableRow
                          sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            '&:hover': { bgcolor: 'action.hover' },
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <TableCell sx={{ py: 0.5, px: 0.5, fontSize: '0.625rem', color: 'text.disabled', minWidth: '72px', width: '72px' }}></TableCell>
                          {chunk.map((hour, i) => {
                            const time = new Date(hour.datetime);
                            const precipHigh = hour.precipitation_probability > (config?.maxPrecipitationChance || 30);
                            const tip = `${time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} | Precip:${hour.precipitation_probability}% Temp:${Math.round(hour.temperature)}°F`;
                            return (
                              <TableCell
                                key={i}
                                sx={{
                                  py: 0.75,
                                  px: 0.5,
                                  textAlign: 'center',
                                  minWidth: '56px',
                                  width: '56px',
                                  ...(precipHigh ? { bgcolor: 'error.hover', border: '2px solid', borderColor: 'error.light' } : {}),
                                }}
                                title={tip}
                              >
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', lineHeight: 1 }}>
                                    <span>{precipHigh ? '\uD83C\uDF27\uFE0F' : conditionIcon(hour.condition, hour.is_daytime)}</span>
                                    {hour.precipitation_probability > 0 && !precipHigh && <span style={{ fontSize: '0.625rem' }}>💧</span>}
                                  </Box>
                                  <Typography
                                    variant="body2"
                                    component="span"
                                    sx={{
                                      fontFamily: 'monospace',
                                      fontWeight: 'semibold',
                                      color: precipHigh ? 'error.main' : 'text.primary',
                                    }}
                                  >
                                    {Math.round(hour.temperature)}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    component="span"
                                    sx={{
                                      fontWeight: 'medium',
                                      fontSize: '0.625rem',
                                      color: precipHigh ? 'error.main' : 'text.secondary',
                                    }}
                                  >
                                    {hour.precipitation_probability}%
                                  </Typography>
                                </Box>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, px: 1 }}>
                <Typography variant="caption" color="text.disabled">
                  Precipitation &gt;{config?.maxPrecipitationChance || 30}% highlighted in red
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">No hourly forecast available</Typography>
          )}
        </CardContent>
      </Card>

      {/* Daily Forecast */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Daily Forecast</Typography>
          {forecast?.daily && forecast.daily.length > 0 ? (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <TableCell sx={{ color: 'text.secondary' }}>Day</TableCell>
                    <TableCell align="center" sx={{ color: 'text.secondary' }}>Period</TableCell>
                    <TableCell align="center" sx={{ color: 'text.secondary' }}>Condition</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>Temp (F)</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>Precip %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {forecast.daily.slice(0, 16).map((day, i) => {
                    const date = new Date(day.datetime);
                    const precipHigh = day.precipitation_probability > (config?.maxPrecipitationChance || 30);
                    const isDaytime = day.is_daytime;
                    // Override icon to rain cloud when precip exceeds threshold
                    const icon = precipHigh ? '\uD83C\uDF27\uFE0F' : conditionIcon(day.condition, isDaytime);
                    return (
                      <TableRow
                        key={i}
                        sx={{
                          borderBottom: 1,
                          borderColor: 'divider',
                          ...(precipHigh ? { bgcolor: 'error.hover' } : {}),
                        }}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{format(date, 'EEE, MMM d')}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                          {isDaytime != null ? (isDaytime ? '\u2600\uFE0F Day' : '\uD83C\uDF19 Night') : '-'}
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '1.25rem' }}>{icon}</TableCell>
                        <TableCell align="right">
                          {Math.round(day.temperature)}°
                          {day.templow != null && <Typography variant="body2" component="span" color="text.disabled"> / {Math.round(day.templow)}°</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'medium', color: precipHigh ? 'error.main' : 'inherit' }}>
                          {day.precipitation_probability}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">No daily forecast available</Typography>
          )}
        </CardContent>
      </Card>

      {/* Weather Summary */}
      <WeatherSummary />
    </Stack>
  );
}
