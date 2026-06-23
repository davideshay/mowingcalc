import { useState, useEffect, useRef } from 'react';
import {
  Button,
  Stack,
  Grid,
  CircularProgress,
  Divider,
  Alert,
  Box,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { TabbedPage } from '../components/layout/TabbedPage';
import { useConfig, useConfigUpdate, useValidateHA } from '../hooks/useApi';
import { GrassGrowthSection } from '../components/config/GrassGrowthSection';
import { RainDelaySection } from '../components/config/RainDelaySection';
import { MowingWindowsEditor } from '../components/config/MowingWindowsEditor';
import { EntityGroupsEditor } from '../components/config/EntityGroupsEditor';
import { HAInputHelpersEditor } from '../components/config/HAInputHelpersEditor';
import { HAConnectionSection } from '../components/config/HAConnectionSection';

// Tab icons
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Grass from '@mui/icons-material/Grass';
import WaterDrop from '@mui/icons-material/WaterDrop';
import AccessTime from '@mui/icons-material/AccessTime';
import Cloud from '@mui/icons-material/Cloud';
import HomeRepairServiceOutlined from '@mui/icons-material/HomeRepairServiceOutlined';

export function Configuration() {
  const { data: config, loading, error } = useConfig();
  const { fullSaveConfig, saving } = useConfigUpdate();
  const [draft, setDraft] = useState<any>(null);
  const initialized = useRef(false);
  const { results, haConnected, validating, validate } = useValidateHA();

  // Sync draft with loaded config
  useEffect(() => {
    if (config && !initialized.current) {
      setDraft(JSON.parse(JSON.stringify(config)));
      initialized.current = true;
    }
  }, [config]);

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 256 }}>
      <CircularProgress />
    </Box>
  );
  if (error) return (
    <Alert severity="error" sx={{ mb: 2 }}>
      <Typography variant="h6">Failed to load configuration</Typography>
      <Typography>{error}</Typography>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => window.location.reload()}>
        Retry
      </Button>
    </Alert>
  );

  const updateSection = (section: string, updates: any) => {
    setDraft((d: any) => {
      if (section === 'grass') {
        return {
          ...d,
          grassType: updates.grassType || d.grassType,
          growthLowerLimit: updates.growthLowerLimit !== undefined ? updates.growthLowerLimit : d.growthLowerLimit,
          growthUpperLimit: updates.growthUpperLimit !== undefined ? updates.growthUpperLimit : d.growthUpperLimit,
          growthModel: updates.growthModel || d.growthModel,
        };
      }
      if (section === 'rain') {
        return {
          ...d,
          rainDelayModel: {
            ...d.rainDelayModel,
            soilType: updates.soilType || d.rainDelayModel.soilType,
            minDelayAfterRain: updates.minDelayAfterRain !== undefined ? updates.minDelayAfterRain : d.rainDelayModel.minDelayAfterRain,
            heavyRainDelay: updates.heavyRainDelay !== undefined ? updates.heavyRainDelay : d.rainDelayModel.heavyRainDelay,
            sunDryingRate: updates.sunDryingRate !== undefined ? updates.sunDryingRate : d.rainDelayModel.sunDryingRate,
            tempDryingFactor: updates.tempDryingFactor !== undefined ? updates.tempDryingFactor : d.rainDelayModel.tempDryingFactor,
            mowerWeightLbs: updates.mowerWeightLbs !== undefined ? updates.mowerWeightLbs : d.rainDelayModel.mowerWeightLbs,
            compactionThreshold: updates.compactionThreshold !== undefined ? updates.compactionThreshold : d.rainDelayModel.compactionThreshold,
            surfaceDryFactor: updates.surfaceDryFactor !== undefined ? updates.surfaceDryFactor : d.rainDelayModel.surfaceDryFactor,
          },
        };
      }
      if (section === 'mowingWindows') {
        return { ...d, mowingWindows: updates };
      }
      if (section === 'entityGroups') {
        return { ...d, entityGroups: updates };
      }
      if (section === 'haInputHelpers') {
        return { ...d, haInputHelpers: updates };
      }
      if (section === 'ha') {
        return {
          ...d,
          haUrl: updates.haUrl !== undefined ? updates.haUrl : d.haUrl,
          haToken: updates.haToken !== undefined ? updates.haToken : d.haToken,
          forecastLookaheadDays: updates.forecastLookaheadDays !== undefined ? updates.forecastLookaheadDays : d.forecastLookaheadDays,
        };
      }
      if (section === 'readonly') {
        return { ...d, readonlyMode: updates.readonlyMode };
      }
      if (section === 'units') {
        return { ...d, displayUnits: updates.displayUnits };
      }
      if (section === 'debug') {
        return { ...d, lastMowTimeOverride: updates.lastMowTimeOverride };
      }
      if (section === 'time') {
        return { ...d, ...updates };
      }
      if (section === 'weather') {
        return { ...d, ...updates };
      }
      return { ...d, ...updates };
    });
  };

  const onSave = async () => {
    if (draft) {
      try {
        await fullSaveConfig(draft);
        initialized.current = false;
      } catch (err) {
        console.error('Failed to save config:', err);
      }
    }
  };

  const onReset = () => {
    if (config) {
      setDraft(JSON.parse(JSON.stringify(config)));
    }
  };

  // Sticky header action buttons
  const actionButtons = (
    <Stack direction="row" spacing={1.5}>
      <Button
        variant="outlined"
        onClick={validate}
        disabled={validating || !draft}
      >
        {validating ? 'Validating...' : 'Validate Setup'}
      </Button>
      <Button
        variant="text"
        color="inherit"
        onClick={onReset}
      >
        Reset
      </Button>
      <Button
        variant="contained"
        color="primary"
        onClick={onSave}
        disabled={saving || !draft}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </Stack>
  );

  // Validation alert
  const validationAlert = !draft ? null : (
    results.length > 0 || haConnected !== null ? (
      <Alert severity={haConnected ? 'success' : 'error'}>
        <Typography variant="h6" gutterBottom>
          {haConnected ? 'Home Assistant Connected' : 'Home Assistant Not Connected'}
        </Typography>
        {haConnected && results.length > 0 && (
          <Stack spacing={1}>
            {results.map((result, i) => {
              const dotColor = result.status === 'ok' ? 'success.main' :
                result.status === 'unavailable' ? 'warning.main' :
                result.status === 'not_found' ? 'error.main' : 'error.main';
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor }} />
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>{result.entity_id}</Typography>
                  <Typography variant="body2" color="text.secondary">({result.label})</Typography>
                  {result.state && result.status === 'ok' && (
                    <Typography variant="body2" color="text.secondary">{result.state}</Typography>
                  )}
                  {result.status === 'unavailable' && (
                    <Typography variant="body2" color="warning.main">Entity exists but is currently unavailable</Typography>
                  )}
                  {result.status === 'not_found' && (
                    <Typography variant="body2" color="error.main">Not found</Typography>
                  )}
                  {result.status === 'error' && (
                    <Typography variant="body2" color="error.main">{result.message}</Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
        {!haConnected && (
          <Typography variant="body2">
            Cannot connect to Home Assistant. Check your URL and API token settings.
          </Typography>
        )}
      </Alert>
    ) : null
  );

  if (!draft) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.secondary">Loading...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <TabbedPage
      title="Configuration"
      subtitle="Edit all mowing scheduler parameters"
      actions={actionButtons}
      alert={validationAlert}
      tabs={[
        // --- General ---
        {
          label: 'General',
          icon: SettingsOutlined,
          value: 'general',
          content: (
            <Stack spacing={3}>
              {/* Display Units */}
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="h6">Display Units</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Choose how temperatures and lengths are displayed. All internal calculations remain metric.
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', bgcolor: 'action.hover', borderRadius: 1, p: 0.5, gap: 0.5 }}>
                      <Button
                        variant={draft.displayUnits === 'metric' ? 'contained' : 'text'}
                        onClick={() => updateSection('units', { displayUnits: 'metric' })}
                        size="small"
                      >
                        Metric (C / mm)
                      </Button>
                      <Button
                        variant={draft.displayUnits === 'imperial' ? 'contained' : 'text'}
                        onClick={() => updateSection('units', { displayUnits: 'imperial' })}
                        size="small"
                      >
                        Imperial (F / in)
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Read-Only Mode Toggle */}
              <Card sx={{
                bgcolor: 'action.hover',
                borderColor: draft.readonlyMode ? 'warning.main' : 'success.main',
                borderWidth: 2,
                borderStyle: 'solid',
                borderRadius: 2,
              }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ color: draft.readonlyMode ? 'warning.main' : 'success.main' }}>
                        {draft.readonlyMode ? '\uD83D\uDD12 Read-Only Mode' : '\uD83D\uDD13 Automatic Mower Control'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        {draft.readonlyMode
                          ? 'All mower actions are blocked. The algorithm runs and monitors, but will not trigger the mower.'
                          : 'The algorithm can automatically start your mower. Review settings carefully before enabling.'}
                      </Typography>
                    </Box>
                    <Button
                      variant={draft.readonlyMode ? 'contained' : 'outlined'}
                      color={draft.readonlyMode ? 'warning' : 'success'}
                      onClick={() => updateSection('readonly', { readonlyMode: !draft.readonlyMode })}
                    >
                      {draft.readonlyMode ? 'Read-Only' : 'Auto Control'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Stack>
          ),
        },

        // --- Growth ---
        {
          label: 'Growth',
          icon: Grass,
          value: 'growth',
          content: (
            <Card>
              <CardContent>
                <GrassGrowthSection
                  grassType={draft.grassType}
                  growthLowerLimit={draft.growthLowerLimit}
                  growthUpperLimit={draft.growthUpperLimit}
                  growthModel={draft.growthModel}
                  displayUnits={draft.displayUnits}
                  onChange={(updates) => updateSection('grass', updates)}
                />
              </CardContent>
            </Card>
          ),
        },

        // --- Rain Delay ---
        {
          label: 'Rain Delay',
          icon: WaterDrop,
          value: 'rain-delay',
          content: (
            <Card>
              <CardContent>
                <RainDelaySection
                  soilType={draft.rainDelayModel?.soilType}
                  rainDelayModel={draft.rainDelayModel}
                  onChange={(updates) => updateSection('rain', updates)}
                />
              </CardContent>
            </Card>
          ),
        },

        // --- Scheduling ---
        {
          label: 'Scheduling',
          icon: AccessTime,
          value: 'scheduling',
          content: (
            <Stack spacing={3}>
              {/* Time Constraints */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Time Constraints</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <NumberInput label="Min time between mows (hours)" value={draft.minTimeBetweenMows} onChange={(v) => updateSection('time', { minTimeBetweenMows: v })} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <NumberInput label="Max time between mows (hours)" value={draft.maxTimeBetweenMows} onChange={(v) => updateSection('time', { maxTimeBetweenMows: v })} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <NumberInput label="Average mowing duration (minutes)" value={draft.avgMowingDuration} onChange={(v) => updateSection('time', { avgMowingDuration: v })} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <NumberInput label="Algorithm run interval (minutes)" value={draft.algorithmRunInterval} onChange={(v) => updateSection('time', { algorithmRunInterval: v })} />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Mowing Windows */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Mowing Windows</Typography>
                  <MowingWindowsEditor windows={draft.mowingWindows} onChange={(v) => updateSection('mowingWindows', v)} />
                </CardContent>
              </Card>
            </Stack>
          ),
        },

        // --- Weather ---
        {
          label: 'Weather',
          icon: Cloud,
          value: 'weather',
          content: (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Weather Thresholds</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <NumberInput label="Max precipitation chance (%)" value={draft.maxPrecipitationChance} onChange={(v) => updateSection('weather', { maxPrecipitationChance: v })} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <NumberInput label="Weather cache TTL (minutes)" value={draft.weatherCacheTTL} onChange={(v) => updateSection('weather', { weatherCacheTTL: v })} />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>Forecast Lookahead</Typography>
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    How many days ahead should the algorithm check for rain? It uses hourly forecasts
                    for the first 24 hours, then daily forecasts beyond that. If rain is expected and
                    grass growth is sufficient, it will mow proactively before the soil gets wet.
                  </Typography>
                </Alert>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <NumberInput
                      label="Lookahead days (1-7)"
                      value={draft.forecastLookaheadDays}
                      onChange={(v) => updateSection('weather', { forecastLookaheadDays: Math.max(1, Math.min(7, v)) })}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ),
        },

        // --- Home Assistant ---
        {
          label: 'Home Assistant',
          icon: HomeRepairServiceOutlined,
          value: 'home-assistant',
          content: (
            <Stack spacing={3}>
              {/* HA Connection */}
              <Card>
                <CardContent>
                  <HAConnectionSection
                    haUrl={draft.haUrl}
                    haToken={draft.haToken}
                    onChange={(updates) => updateSection('ha', updates)}
                  />
                </CardContent>
              </Card>

              {/* Entity Groups */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Entity Groups</Typography>
                  <EntityGroupsEditor groups={draft.entityGroups} onChange={(v) => updateSection('entityGroups', v)} />
                </CardContent>
              </Card>

              {/* HA Input Helpers */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>HA Input Helpers</Typography>
                  <HAInputHelpersEditor helpers={draft.haInputHelpers} onChange={(v) => updateSection('haInputHelpers', v)} />
                </CardContent>
              </Card>

              {/* Debug: Last Mow Time Override */}
              <Card sx={{ bgcolor: 'action.hover', borderColor: 'warning.main', borderWidth: 1, borderStyle: 'solid' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: 'warning.main' }}>Debug: Last Mow Time Override</Typography>
                  <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
                    Manually override the last mow time used by the growth model. When set, this takes
                    precedence over both Home Assistant entities. Leave empty to use the HA entity values.
                  </Typography>
                  {draft.lastMowTimeOverride ? (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 3, mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }} gutterBottom>Date</Typography>
                          <input
                            type="date"
                            value={new Date(draft.lastMowTimeOverride).toLocaleDateString('en-CA')}
                            onChange={(e) => {
                              if (e.target.value) {
                                const d = new Date(draft.lastMowTimeOverride);
                                const parts = e.target.value.split('-');
                                d.setFullYear(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                                updateSection('debug', { lastMowTimeOverride: d.toISOString() });
                              }
                            }}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }} gutterBottom>Time</Typography>
                          <input
                            type="time"
                            value={new Date(draft.lastMowTimeOverride).toLocaleTimeString('en-CA').slice(0, 5)}
                            onChange={(e) => {
                              if (e.target.value) {
                                const d = new Date(draft.lastMowTimeOverride);
                                const parts = e.target.value.split(':');
                                d.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
                                updateSection('debug', { lastMowTimeOverride: d.toISOString() });
                              }
                            }}
                          />
                        </Box>
                        <Box>
                          <Typography variant="body2" color="warning.main">
                            {new Date(draft.lastMowTimeOverride).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="warning.main">
                            {Math.round((Date.now() - new Date(draft.lastMowTimeOverride).getTime()) / 3600000)}h ago
                          </Typography>
                        </Box>
                      </Box>
                      <Stack direction="row" spacing={1.5}>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() => updateSection('debug', { lastMowTimeOverride: null })}
                        >
                          Clear Override
                        </Button>
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          onClick={() => updateSection('debug', {
                            lastMowTimeOverride: new Date().toISOString(),
                          })}
                        >
                          Set to Now
                        </Button>
                      </Stack>
                    </Box>
                  ) : (
                    <Button
                      variant="outlined"
                      color="warning"
                      onClick={() => updateSection('debug', {
                        lastMowTimeOverride: new Date().toISOString(),
                      })}
                    >
                      Set Override
                    </Button>
                  )}
                  {!draft.lastMowTimeOverride && (
                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                      No override active -- using HA entities: {draft.entityGroups.lastMowTimeEntity || '(HA: none)'} / {draft.entityGroups.lastMowDatetimeEntity || '(app: none)'}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Stack>
          ),
        },
      ]}
    />
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 'medium' }} gutterBottom>{label}</Typography>
      <input
        type="number"
        value={parseFloat(value.toFixed(2))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step="any"
      />
    </Box>
  );
}
