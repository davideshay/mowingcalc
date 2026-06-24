import { useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import { useHAEntities } from '../../hooks/useApi';
import type { WeatherSensorEntry } from '../../types/api';
import { EntityPicker } from './EntityPicker';

interface SunshineSource {
  entity_id: string;
  type: 'sunshine' | 'uv_index';
}

interface EntityGroups {
  rainfallSensors: WeatherSensorEntry[];
  rainfallUnit: 'millimeters' | 'inches';
  temperatureSensors: WeatherSensorEntry[];
  temperatureUnit: 'celsius' | 'fahrenheit';
  sunshineSources: SunshineSource[];
  weatherForecastEntity: string;
  hourlyForecastEntity: string;
  dailyForecastEntity: string;
  mowerType: 'switch' | 'lawn_mower' | 'custom';
  mowerEntity: string;
  lastMowTimeEntity: string;
  lastMowDatetimeEntity: string;
  sunEntity: string;
}

/** Extract entity_id from a WeatherSensorEntry (handles string or object). */
function sensorId(entry: WeatherSensorEntry): string {
  return typeof entry === 'string' ? entry : entry.entity_id;
}

interface Props {
  groups: EntityGroups;
  onChange: (groups: EntityGroups) => void;
}

// HA entity type (from our API)
interface HAEntity {
  entity_id: string;
  state: string;
  unit_of_measurement: string | null;
  friendly_name: string | null;
}

// Autocomplete sensor picker — selecting immediately adds the entity to a group
function SensorPicker({
  options,
  loading,
  onAdd,
  onRefresh,
  placeholder,
  exclude,
}: {
  options: HAEntity[];
  loading: boolean;
  onAdd: (entityId: string) => void;
  onRefresh: () => void;
  placeholder: string;
  exclude?: string[];
}) {
  const [inputValue, setInputValue] = useState('');
  const [selectedValue, setSelectedValue] = useState<HAEntity | string | null>(null);

  // Filter out already-selected entities
  const availableOptions = exclude
    ? options.filter((o) => !exclude.includes(o.entity_id))
    : options;

  const handleSelect = (entityId: string) => {
    if (!entityId.trim()) return;
    onAdd(entityId.trim());
    setInputValue('');
    setSelectedValue(null);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
      <Autocomplete
        freeSolo
        options={availableOptions}
        getOptionLabel={(option) => typeof option === 'string' ? option : option.entity_id}
        isOptionEqualToValue={(option, value) => option.entity_id === value}
        value={selectedValue}
        inputValue={inputValue}
        onInputChange={(_e, newValue) => setInputValue(newValue)}
        onChange={(_e, newValue) => {
          setSelectedValue(newValue as HAEntity | string | null);
          const id = typeof newValue === 'string' ? newValue : (newValue as HAEntity | null)?.entity_id || '';
          handleSelect(id);
        }}
        loading={loading}
        sx={{ flex: 1 }}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder={placeholder}
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps?.input,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={16} /> : params.slotProps?.input?.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props}>
            {typeof option === 'string' ? (
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {option}
              </Typography>
            ) : (
              <>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {option.entity_id}
                  </Typography>
                  {option.friendly_name && option.friendly_name !== option.entity_id && (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      ({option.friendly_name})
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {option.unit_of_measurement && (
                    <Typography variant="caption" color="text.secondary">
                      {option.unit_of_measurement}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      color: option.state === 'unavailable' ? 'warning.main' : 'success.main',
                      fontWeight: 600,
                    }}
                  >
                    {option.state}
                  </Typography>
                </Box>
              </>
            )}
          </Box>
        )}
      />
      <IconButton
        size="small"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh sensors"
        title="Refresh sensor list"
        sx={{ mt: 0.5 }}
      >
        <RefreshOutlined fontSize="small" />
      </IconButton>
    </Box>
  );
}

export function EntityGroupsEditor({ groups, onChange }: Props) {
  // Fetch entities from multiple domains
  const { entities: sensorEntities, loading: sensorsLoading, error: sensorsError, refetch: refetchSensors } = useHAEntities('sensor');
  const { entities: mowerEntities, loading: mowersLoading, refetch: refetchMowers } = useHAEntities('lawn_mower');
  const { entities: switchEntities, loading: switchesLoading, refetch: refetchSwitches } = useHAEntities('switch');
  const { entities: datetimeEntities, loading: datetimesLoading, refetch: refetchDatetimes } = useHAEntities('input_datetime');
  const { entities: weatherEntities, loading: weathersLoading, refetch: refetchWeathers } = useHAEntities('weather');
  const { entities: sunEntities, loading: sunsLoading, refetch: refetchSuns } = useHAEntities('sun');

  // Combine mower + switch entities for mower picker based on type
  const mowerOptions = groups.mowerType === 'switch' ? switchEntities : mowerEntities;
  const mowerLoading = groups.mowerType === 'switch' ? switchesLoading : mowersLoading;
  const refetchMowerOptions = groups.mowerType === 'switch' ? refetchSwitches : refetchMowers;

  const removeSensor = (group: string, index: number) => {
    const current = groups[group as keyof EntityGroups] as WeatherSensorEntry[];
    onChange({
      ...groups,
      [group]: current.filter((_, i) => i !== index),
    });
  };

  const addSensorToGroup = (group: string, entityId: string) => {
    if (!entityId.trim()) return;
    const current = groups[group as keyof EntityGroups] as WeatherSensorEntry[];
    // Check if already exists (compare by entity_id)
    if (current.some((s) => sensorId(s) === entityId.trim())) return;
    // Detect unit from HA entity
    const haEntity = sensorEntities.find((e) => e.entity_id === entityId.trim());
    const unitOfMeasurement = haEntity?.unit_of_measurement || '';
    let unit: string | undefined;
    if (group === 'temperatureSensors') {
      unit = unitOfMeasurement.includes('F') ? 'fahrenheit' : 'celsius';
    } else if (group === 'rainfallSensors') {
      unit = unitOfMeasurement.includes('in') ? 'inches' : 'millimeters';
    }
    // Auto-timestamp new sensor entry
    const entry: { entity_id: string; added_at: string; unit?: string } = {
      entity_id: entityId.trim(),
      added_at: new Date().toISOString(),
    };
    if (unit) {
      entry.unit = unit;
    }
    onChange({
      ...groups,
      [group]: [...current, entry],
    });
  };

  // Sunshine sources
  const [sunshineType, setSunshineType] = useState<'sunshine' | 'uv_index'>('uv_index');

  const addSunshineSource = (entityId: string) => {
    if (!entityId.trim()) return;
    onChange({
      ...groups,
      sunshineSources: [
        ...groups.sunshineSources,
        { entity_id: entityId.trim(), type: sunshineType },
      ],
    });
  };

  const removeSunshineSource = (index: number) => {
    onChange({
      ...groups,
      sunshineSources: groups.sunshineSources.filter((_, i) => i !== index),
    });
  };

  const updateSingle = (key: string, value: string) => {
    onChange({
      ...groups,
      [key]: value,
    });
  };

  // Status text
  const sensorStatusText = sensorsError
    ? `Cannot load sensors: ${sensorsError}`
    : sensorsLoading
      ? 'Loading sensors...'
      : `${sensorEntities.length} sensors found`;

  return (
    <Stack spacing={3}>
      {/* Sensor groups */}
      <Grid container spacing={2}>
        {
          [{ key: 'rainfallSensors', label: 'Rainfall Sensors' },
            { key: 'temperatureSensors', label: 'Temperature Sensors' },
          ].map(({ key, label }) => (
            <Grid size={{ xs: 12, md: 6 }} key={key}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Chip
                      label={(groups[key as keyof EntityGroups] as string[]).length}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </Box>

                  <Stack spacing={1} sx={{ mb: 2 }}>
                    {(groups[key as keyof EntityGroups] as WeatherSensorEntry[]).map((sensor, index) => (
                      <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {sensorId(sensor)}
                        </Typography>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeSensor(key, index)}
                          aria-label={`Remove ${sensor}`}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>

                  <SensorPicker
                    options={sensorEntities}
                    loading={sensorsLoading}
                    onAdd={(entityId) => addSensorToGroup(key, entityId)}
                    onRefresh={refetchSensors}
                    placeholder={key === 'rainfallSensors' ? 'Select or type sensor.rainfall...' : 'Select or type sensor.temperature...'}
                    exclude={(groups[key as keyof EntityGroups] as WeatherSensorEntry[]).map(sensorId)}
                  />

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {sensorStatusText}
                  </Typography>

                  {key === 'rainfallSensors' && (
                    <Box sx={{ mt: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Sensor Unit</InputLabel>
                        <Select
                          value={groups.rainfallUnit}
                          label="Sensor Unit"
                          onChange={(e) => onChange({ ...groups, rainfallUnit: e.target.value as 'millimeters' | 'inches' })}
                        >
                          <MenuItem value="millimeters">Millimeters (mm)</MenuItem>
                          <MenuItem value="inches">Inches (in)</MenuItem>
                        </Select>
                      </FormControl>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        WeatherFlow AWS hourly_rain sensors report in inches. Set to "Inches" if your sensor uses imperial units.
                      </Typography>
                    </Box>
                  )}

                  {key === 'temperatureSensors' && (
                    <Box sx={{ mt: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Sensor Unit</InputLabel>
                        <Select
                          value={groups.temperatureUnit}
                          label="Sensor Unit"
                          onChange={(e) => onChange({ ...groups, temperatureUnit: e.target.value as 'celsius' | 'fahrenheit' })}
                        >
                          <MenuItem value="celsius">Celsius (&deg;C)</MenuItem>
                          <MenuItem value="fahrenheit">Fahrenheit (&deg;F)</MenuItem>
                        </Select>
                      </FormControl>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        WeatherFlow AWS sensors report in Fahrenheit by default.
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))
        }

        {/* Sunshine Sources */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
                  Sunshine Sources
                </Typography>
                <Chip label={groups.sunshineSources.length} size="small" color="primary" variant="outlined" />
              </Box>

              <Stack spacing={1} sx={{ mb: 2 }}>
                {groups.sunshineSources.map((source, index) => (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={source.type === 'uv_index' ? 'UV' : 'Sun'}
                      size="small"
                      sx={{ minWidth: 40 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {source.entity_id}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeSunshineSource(index)}
                      aria-label={`Remove ${source.entity_id}`}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>

              <Alert severity="info" sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                Add UV index sensors (e.g. from Ambient Weather). The app converts these to sunshine hours: UV &gt; 0.5 counts as 1 hour of sun.
              </Alert>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', width: '100%' }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Source Type</InputLabel>
                  <Select
                    value={sunshineType}
                    label="Source Type"
                    onChange={(e) => setSunshineType(e.target.value as 'sunshine' | 'uv_index')}
                  >
                    <MenuItem value="uv_index" sx={{ minHeight: 36 }}>
                      <Typography variant="body2">UV Index</Typography>
                    </MenuItem>
                    <MenuItem value="sunshine" sx={{ minHeight: 36 }}>
                      <Typography variant="body2">Sunshine</Typography>
                    </MenuItem>
                  </Select>
                </FormControl>

                <Box sx={{ flex: 1 }}>
                  <SensorPicker
                    options={sensorEntities}
                    loading={sensorsLoading}
                    onAdd={(entityId) => addSunshineSource(entityId)}
                    onRefresh={refetchSensors}
                    placeholder="Select or type sensor..."
                    exclude={groups.sunshineSources.map((s) => s.entity_id)}
                  />
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {sensorStatusText}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Mower Entity section */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Mower Entity
          </Typography>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              The Segway Navimow integration creates a <code>lawn_mower</code> entity in Home Assistant.
              Find it under Devices in HA - the entity ID will look like <code>lawn_mower.navimow</code> or
              <code>lawn_mower.your_mower_name</code>. The app reads state, battery, and last mowed time
              directly from this entity&apos;s attributes.
            </Typography>
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Mower Type</InputLabel>
                <Select
                  value={groups.mowerType}
                  label="Mower Type"
                  onChange={(e) => updateSingle('mowerType', e.target.value)}
                >
                  <MenuItem value="lawn_mower">Lawn Mower (Navimow)</MenuItem>
                  <MenuItem value="switch">Switch</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {groups.mowerType !== 'custom' ? (
                <EntityPicker
                  options={mowerOptions}
                  loading={mowerLoading}
                  value={groups.mowerEntity}
                  onChange={(id) => updateSingle('mowerEntity', id)}
                  onRefresh={refetchMowerOptions}
                  placeholder={groups.mowerType === 'lawn_mower' ? 'Select lawn_mower...' : 'Select switch...'}
                  label="Mower Entity"
                />
              ) : (
                <TextField
                  fullWidth
                  label="Mower Entity ID"
                  value={groups.mowerEntity}
                  onChange={(e) => updateSingle('mowerEntity', e.target.value)}
                  placeholder="lawn_mower.navimow"
                  helperText="Custom mower type — enter the entity ID manually."
                />
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <EntityPicker
                options={datetimeEntities}
                loading={datetimesLoading}
                value={groups.lastMowTimeEntity}
                onChange={(id) => updateSingle('lastMowTimeEntity', id)}
                onRefresh={refetchDatetimes}
                placeholder="Select input_datetime..."
                label="HA-Managed Last Mow Entity"
                helperText="Entity updated by HA automations or the mower itself. The calculator reads this and the app-managed entity, using whichever is more recent."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <EntityPicker
                options={datetimeEntities}
                loading={datetimesLoading}
                value={groups.lastMowDatetimeEntity}
                onChange={(id) => updateSingle('lastMowDatetimeEntity', id)}
                onRefresh={refetchDatetimes}
                placeholder="Select input_datetime..."
                label="App-Controlled Last Mow Entity"
                helperText="This app writes to this input_datetime whenever a mow is initiated. Create it in HA as an input_datetime helper."
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Weather section */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" sx={{ mb: 2 }}>
            Weather Forecasts
          </Typography>

          <Alert severity="warning" sx={{ mb: 3, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
            Use separate weather providers for hourly and daily forecasts. For example, use NWS for hourly (48h) and OpenWeatherMap for daily (8 days). Leave a field empty to use the default forecast entity below.
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <EntityPicker
                options={weatherEntities}
                loading={weathersLoading}
                value={groups.weatherForecastEntity}
                onChange={(id) => updateSingle('weatherForecastEntity', id)}
                onRefresh={refetchWeathers}
                placeholder="Select weather..."
                label="Default Forecast Entity"
                helperText="Fallback entity if hourly/daily fields are empty."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <EntityPicker
                options={weatherEntities}
                loading={weathersLoading}
                value={groups.hourlyForecastEntity || ''}
                onChange={(id) => updateSingle('hourlyForecastEntity', id)}
                onRefresh={refetchWeathers}
                placeholder="Select weather..."
                label="Hourly Forecast Entity"
                helperText="Entity for 48-hour hourly forecast. Leave empty to use default."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <EntityPicker
                options={weatherEntities}
                loading={weathersLoading}
                value={groups.dailyForecastEntity || ''}
                onChange={(id) => updateSingle('dailyForecastEntity', id)}
                onRefresh={refetchWeathers}
                placeholder="Select weather..."
                label="Daily Forecast Entity"
                helperText="Entity for 7-day daily forecast. Leave empty to use default."
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <EntityPicker
                options={sunEntities}
                loading={sunsLoading}
                value={groups.sunEntity}
                onChange={(id) => updateSingle('sunEntity', id)}
                onRefresh={refetchSuns}
                placeholder="Select sun..."
                label="Sun Entity"
                helperText="Usually sun.sun - provides sunrise/sunset times."
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
}
