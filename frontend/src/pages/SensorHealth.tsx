import { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  AlertTitle,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Chip,
  Stack,
} from '@mui/material';
import { TabbedPage } from '../components/layout/TabbedPage';
import { SensorTimeSeries } from '../components/sensors/SensorTimeSeries';
import { SensorHealthTable } from '../components/sensors/SensorHealthTable';
import { MetricSummary } from '../components/sensors/MetricSummary';
import { useSensorAnalysis, useConfig, useConfigUpdate } from '../hooks/useApi';
import { lengthUnit } from '../utils/units';
import { toast } from 'react-hot-toast';

// Tab icons
import WaterDrop from '@mui/icons-material/WaterDrop';
import LocalFireDepartment from '@mui/icons-material/LocalFireDepartment';
import WbSunny from '@mui/icons-material/WbSunny';
import WbCloudy from '@mui/icons-material/WbCloudy';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';

interface MetricConfig {
  unit: string;
  icon: any;
  label: string;
}

const METRIC_CONFIG: Record<string, MetricConfig> = {
  rainfall: {
    unit: '',
    icon: WaterDrop,
    label: 'Rainfall',
  },
  temperature: {
    unit: '',
    icon: LocalFireDepartment,
    label: 'Temperature',
  },
  uv_index: {
    unit: 'UV',
    icon: WbSunny,
    label: 'UV Index',
  },
  sunshine: {
    unit: 'h',
    icon: WbCloudy,
    label: 'Sunshine',
  },
};

export function SensorHealth() {
  const { data: analysis, loading, error, refetch } = useSensorAnalysis(240);
  const { data: config } = useConfig();
  const { updateConfig } = useConfigUpdate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const units = config?.displayUnits || 'metric';

  // Build remove candidates from selected sensors
  const removeCandidates = useMemo(() => {
    if (!analysis) return [];
    const candidates: Array<{ metric: string; entity_id: string; reason: string }> = [];
    for (const m of analysis.metrics) {
      for (const s of m.sensors) {
        if (selectedIds.has(s.entity_id)) {
          candidates.push({
            metric: m.metricLabel,
            entity_id: s.entity_id,
            reason: s.flags
              .filter((f) => f.severity === 'critical')
              .map((f) => f.message)
              .join('; ') || s.flags.map((f) => f.message).join('; '),
          });
        }
      }
    }
    return candidates;
  }, [analysis, selectedIds]);

  const handleToggleSelect = (entityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const handleSelectAll = (entityIds: string[]) => {
    setSelectedIds(new Set(entityIds));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const groups = config?.entityGroups;
      if (!groups) throw new Error('Config not loaded');

      const updatedGroups = { ...groups };

      for (const candidate of removeCandidates) {
        const entityId = candidate.entity_id;
        if (candidate.metric === 'Rainfall') {
          updatedGroups.rainfallSensors = (updatedGroups.rainfallSensors || []).filter(
            (id: string) => id !== entityId,
          );
        } else if (candidate.metric === 'Temperature') {
          updatedGroups.temperatureSensors = (updatedGroups.temperatureSensors || []).filter(
            (id: string) => id !== entityId,
          );
        } else if (candidate.metric === 'UV Index') {
          updatedGroups.sunshineSources = (updatedGroups.sunshineSources || []).filter(
            (s: any) => s.entity_id !== entityId,
          );
        } else if (candidate.metric === 'Sunshine') {
          updatedGroups.sunshineSources = (updatedGroups.sunshineSources || []).filter(
            (s: any) => s.entity_id !== entityId,
          );
        }
      }

      await updateConfig({ entityGroups: updatedGroups });
      setSelectedIds(new Set());
      setRemoveDialogOpen(false);
      refetch();
      toast.success(`Removed ${removeCandidates.length} sensor(s)`);
    } catch (err) {
      toast.error(`Failed to remove sensors: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 256 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4">Sensor Health</Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          <AlertTitle>Analysis Failed</AlertTitle>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!analysis || analysis.metrics.length === 0) {
    return (
      <Box>
        <Typography variant="h4">Sensor Health</Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          <AlertTitle>No sensor data</AlertTitle>
          Home Assistant is not connected or no weather sensors are configured.
          Configure sensors in the Configuration page first.
        </Alert>
      </Box>
    );
  }

  const hasHAError = analysis.error !== undefined;

  // Build tabs per metric
  const tabs = analysis.metrics.map((metric) => {
    const mConfig = METRIC_CONFIG[metric.metric];
    const IconComponent = mConfig.icon;

    // Determine unit string for display
    let unit = '';
    if (metric.metric === 'rainfall') {
      unit = lengthUnit(units);
    } else if (metric.metric === 'temperature') {
      unit = units === 'imperial' ? 'F' : 'C';
    } else if (metric.metric === 'uv_index') {
      unit = 'UV';
    } else if (metric.metric === 'sunshine') {
      unit = 'h';
    }

    return {
      label: mConfig.label,
      icon: IconComponent,
      value: metric.metric,
      content: (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Summary cards */}
          <MetricSummary analysis={metric} />

          {/* Time series chart */}
          <Card>
            <CardContent>
              <Typography variant="subtitle1" component="h2" sx={{ mb: 2 }}>
                {mConfig.label} - Per-Sensor Time Series
              </Typography>
              <SensorTimeSeries sensors={metric.sensors} unit={unit} />
            </CardContent>
          </Card>

          {/* Sensor health table */}
          <Card>
            <CardContent>
              <Typography variant="subtitle1" component="h2" sx={{ mb: 2 }}>
                Sensor Details
              </Typography>
              {metric.sensors.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No {mConfig.label.toLowerCase()} sensors configured.
                  {' '}
                  <Box
                    component="span"
                    sx={{
                      color: 'primary.main',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                    onClick={() => window.location.href = '/config'}
                  >
                    Go to Configuration
                  </Box>
                  {' '}to add sensors.
                </Typography>
              ) : (
                <SensorHealthTable
                  sensors={metric.sensors}
                  unit={unit}
                  selectedIds={Array.from(selectedIds).filter((id) =>
                    metric.sensors.some((s) => s.entity_id === id),
                  )}
                  onToggleSelect={handleToggleSelect}
                  onSelectAll={() => handleSelectAll(metric.sensors.map((s) => s.entity_id))}
                  onDeselectAll={handleDeselectAll}
                />
              )}
            </CardContent>
          </Card>

          {/* Statistical note if fewer than 3 sensors */}
          {metric.sensorCount > 0 && metric.sensorCount < 3 && (
            <Alert severity="info">
              <Typography variant="body2">
                Statistical outlier detection requires 3+ sensors. With {metric.sensorCount} sensor(s),
                only zero/stale data checks are active.
              </Typography>
            </Alert>
          )}
        </Box>
      ),
    };
  });

  // Action bar for selected sensors
  const selectedCount = selectedIds.size;

  return (
    <>
      <TabbedPage
        title="Sensor Health"
        subtitle="Analyze sensor data for outliers, broken sensors, and stale readings"
        tabs={tabs}
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {selectedCount > 0 && (
              <Chip
                label={`${selectedCount} selected`}
                color="error"
                variant="outlined"
                onDelete={() => setSelectedIds(new Set())}
              />
            )}
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineOutlined />}
              onClick={() => setRemoveDialogOpen(true)}
              disabled={selectedCount === 0 || removing}
            >
              {removing ? 'Removing...' : `Remove Selected (${selectedCount})`}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshOutlined />}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
          </Box>
        }
        alert={
          hasHAError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>Home Assistant Not Connected</AlertTitle>
              Cannot fetch sensor data. Check your HA connection in Configuration.
            </Alert>
          )
        }
      />

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialogOpen} onClose={() => !removing && setRemoveDialogOpen(false)}>
        <DialogTitle>Remove {removeCandidates.length} sensor(s)?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This will remove the following sensor(s) from your configuration. They will no longer be used
            for weather data analysis.
          </DialogContentText>
          <Stack spacing={1}>
            {removeCandidates.map((candidate) => (
              <Box
                key={candidate.entity_id}
                sx={{
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                  {candidate.entity_id}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {candidate.metric}
                </Typography>
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                  {candidate.reason}
                </Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialogOpen(false)} disabled={removing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? 'Removing...' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
