import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
} from '@mui/material';
import DeviceHubOutlined from '@mui/icons-material/DeviceHubOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import { MetricAnalysis } from '../../types/api';

interface Props {
  analysis: MetricAnalysis;
}

function countSeverity(sensors: Array<{ flags: Array<{ severity: string }> }>, severity: string): number {
  return sensors.filter((s) => s.flags.some((f) => f.severity === severity)).length;
}

export function MetricSummary({ analysis }: Props) {
  const criticalCount = countSeverity(analysis.sensors, 'critical');
  const warningCount = countSeverity(analysis.sensors, 'warning');
  const okCount = analysis.sensorCount - criticalCount - warningCount;

  return (
    <Grid container spacing={2}>
      {/* Total sensors */}
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
            <Box sx={{ bgcolor: 'primary.light', borderRadius: '50%', p: 1.5 }}>
              <DeviceHubOutlined sx={{ color: 'primary.main', width: 24, height: 24 }} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Total Sensors</Typography>
              <Typography variant="h5">{analysis.sensorCount}</Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* OK */}
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
            <Box sx={{ bgcolor: 'success.light', borderRadius: '50%', p: 1.5 }}>
              <Typography variant="h6" sx={{ color: 'success.main', fontSize: '1rem', lineHeight: 1.5 }}>
                {okCount}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Healthy</Typography>
              <Typography variant="h5">{okCount}</Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Warnings */}
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
            <Box sx={{ bgcolor: 'warning.light', borderRadius: '50%', p: 1.5 }}>
              <WarningAmberOutlined sx={{ color: 'warning.main', width: 24, height: 24 }} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Warnings</Typography>
              <Typography variant="h5" sx={{ color: warningCount > 0 ? 'warning.main' : 'text.secondary' }}>
                {warningCount}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Critical */}
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
            <Box sx={{ bgcolor: 'error.light', borderRadius: '50%', p: 1.5 }}>
              <ReportProblemOutlined sx={{ color: 'error.main', width: 24, height: 24 }} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Critical</Typography>
              <Typography variant="h5" sx={{ color: criticalCount > 0 ? 'error.main' : 'text.secondary' }}>
                {criticalCount}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Time range */}
      <Grid size={{ xs: 12 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
          <AccessTimeOutlined sx={{ color: 'text.disabled', fontSize: 16 }} />
          <Typography variant="caption" color="text.secondary">
            Data spans {analysis.timeRangeHours}h ({Math.round(analysis.timeRangeHours / 24)} days)
            {analysis.groupMedian !== null && (
              <span>
                {' '}
                | Group median mean: {analysis.groupMedian.toFixed(2)}
              </span>
            )}
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
}
