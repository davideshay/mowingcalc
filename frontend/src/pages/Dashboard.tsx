import { useAlgorithmState, useMowerStatus, useMowerControl, useConfig } from '../hooks/useApi';
import { format, formatDistanceToNow } from 'date-fns';
import { formatLength, toDisplayLength, lengthUnit } from '../utils/units';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Typography,
  Alert,
  AlertTitle,
} from '@mui/material';
import LockOutlined from '@mui/icons-material/Lock';

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

export function Dashboard() {
  const { data: algo, loading: algoLoading } = useAlgorithmState();
  const { data: mower } = useMowerStatus();
  const { startMow, triggering } = useMowerControl();
  const { data: config } = useConfig();
  const isReadonly = config?.readonlyMode === true;
  const units = config?.displayUnits || 'metric';
  const unit = lengthUnit(units);

  if (algoLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '256px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Page header */}
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Current algorithm decision and system status
        </Typography>
      </Box>

      {/* Read-only mode banner */}
      {isReadonly && (
        <Alert severity="warning" icon={<LockOutlined />}>
          <AlertTitle>Read-Only Mode Enabled</AlertTitle>
          The mower is connected in read-only mode. All mower actions (start, stop, pause) are blocked.
          The algorithm will still run and recommend mowing, but no actions will be taken.
          Disable this in Configuration to enable automatic mower control.
        </Alert>
      )}

      {/* Main decision card */}
      <Card sx={{ borderLeft: algo?.should_mow ? '4px solid #22c55e' : '4px solid #d1d5db' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" component="h2">
                {algo?.should_mow ? '🌱 Mow Now Recommended' : '⏰ Wait - No Mow Needed'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {algo?.reason}
              </Typography>
            </Box>
            {!isReadonly && algo?.should_mow && (
              <Button
                variant="contained"
                color="primary"
                onClick={startMow}
                disabled={triggering}
              >
                {triggering ? 'Starting...' : 'Start Mower'}
              </Button>
            )}
            {isReadonly && algo?.should_mow && (
              <Chip label="Action blocked (read-only)" color="warning" size="small" />
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <Grid container spacing={2}>
        {/* Growth estimate */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Growth Since Last Mow
              </Typography>
              <Typography variant="h3" component="div">
                {toDisplayLength(algo?.growth_mm ?? 0, units).toFixed(1)}
                <Typography component="span" variant="h4" color="text.secondary" sx={{ ml: 0.5 }}>
                  {unit}
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Daily rate: {toDisplayLength(algo?.daily_growth_mm ?? 0, units).toFixed(2)} {unit}/day
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Rain delay */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Rain Delay
              </Typography>
              <Typography variant="h4" component="div">
                {algo?.is_safe_to_mow ? (
                  <Chip label="Safe" color="success" size="small" />
                ) : (
                  <>
                    {algo?.rain_delay_hours?.toFixed(0)}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                      hours
                    </Typography>
                  </>
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {algo?.is_safe_to_mow
                  ? 'Soil moisture OK'
                  : algo?.rain_delay_details?.last_significant_rain
                    ? `Rain ${hoursAgo(algo.rain_delay_details.last_significant_rain)} (${formatLength(algo.rain_delay_details.last_rain_mm, units)})`
                    : 'Wait for drying'}
              </Typography>
              {!algo?.is_safe_to_mow && algo?.rain_delay_details?.last_significant_rain && (
                <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                  Safe at {format(new Date(Date.now() + (algo.rain_delay_hours || 0) * 3600000), 'h:mm a')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Hours since mow */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Hours Since Last Mow
              </Typography>
              <Typography variant="h4" component="div">
                {algo?.hours_since_mow?.toFixed(0)}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                  h
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {algo?.last_mow_time ? (
                  <>Last: {formatDistanceToNow(new Date(algo.last_mow_time), { addSuffix: true })}</>
                ) : (
                  'No previous mow recorded'
                )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Mower status */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Mower Status
              </Typography>
              <Typography variant="h4" component="div">
                {mower?.available ? (
                  <Chip
                    label={mower.state?.replace('_', ' ') || 'Unknown'}
                    color={mower.state === 'mowing' ? 'success' : 'default'}
                    size="small"
                  />
                ) : (
                  <Chip label="Unavailable" color="warning" size="small" />
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {mower?.battery_pct !== undefined && `Battery: ${mower.battery_pct}%`}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Next review */}
      {algo?.next_review && (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Next Algorithm Review
            </Typography>
            <Typography variant="h6" component="div">
              {format(new Date(algo.next_review), 'EEEE, MMMM d, yyyy h:mm a')}
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
