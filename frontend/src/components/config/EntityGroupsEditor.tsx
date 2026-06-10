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
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Chip from '@mui/material/Chip';

interface SunshineSource {
  entity_id: string;
  type: 'sunshine' | 'uv_index';
}

interface EntityGroups {
  rainfallSensors: string[];
  rainfallUnit: 'millimeters' | 'inches';
  temperatureSensors: string[];
  temperatureUnit: 'celsius' | 'fahrenheit';
  sunshineSources: SunshineSource[];
  weatherForecastEntity: string;
  hourlyForecastEntity: string;
  dailyForecastEntity: string;
  mowerType: 'switch' | 'lawn_mower' | 'custom';
  mowerEntity: string;
  lastMowTimeEntity: string;
  sunEntity: string;
}

interface Props {
  groups: EntityGroups;
  onChange: (groups: EntityGroups) => void;
}

export function EntityGroupsEditor({ groups, onChange }: Props) {
  const [newSensor, setNewSensor] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const addSensor = (group: string) => {
    if (!newSensor.trim()) return;
    const current = groups[group as keyof EntityGroups] as string[];
    onChange({
      ...groups,
      [group]: [...current, newSensor.trim()],
    });
    setNewSensor('');
  };

  const removeSensor = (group: string, index: number) => {
    const current = groups[group as keyof EntityGroups] as string[];
    onChange({
      ...groups,
      [group]: current.filter((_, i) => i !== index),
    });
  };

  // Sunshine sources: combined add with type selector
  const [sunshineType, setSunshineType] = useState<'sunshine' | 'uv_index'>('uv_index');
  const addSunshineSource = () => {
    if (!newSensor.trim()) return;
    onChange({
      ...groups,
      sunshineSources: [
        ...groups.sunshineSources,
        { entity_id: newSensor.trim(), type: sunshineType },
      ],
    });
    setNewSensor('');
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
                    {(groups[key as keyof EntityGroups] as string[]).map((sensor, index) => (
                      <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {sensor}
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

                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                      size="small"
                      sx={{ flex: 1 }}
                      placeholder="e.g., sensor.rainfall"
                      value={activeGroup === key ? newSensor : ''}
                      onChange={(e) => {
                        setActiveGroup(key);
                        setNewSensor(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addSensor(key);
                      }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<AddOutlined />}
                      onClick={() => addSensor(key)}
                    >
                      Add
                    </Button>
                  </Stack>

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

        {/* Sunshine Sources - combined UI */}
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

              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Source Type</InputLabel>
                  <Select
                    value={sunshineType}
                    label="Source Type"
                    onChange={(e) => setSunshineType(e.target.value as 'sunshine' | 'uv_index')}
                  >
                    <MenuItem value="uv_index">UV Index</MenuItem>
                    <MenuItem value="sunshine">Sunshine</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  sx={{ flex: 1 }}
                  placeholder="e.g., sensor.uv_index"
                  value={activeGroup === 'sunshineSources' ? newSensor : ''}
                  onChange={(e) => {
                    setActiveGroup('sunshineSources');
                    setNewSensor(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addSunshineSource();
                  }}
                />
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddOutlined />}
                  onClick={() => addSunshineSource()}
                >
                  Add
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Single entity fields */}
      <Grid container spacing={2}>
        {/* Mower Entity section */}
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
              <TextField
                fullWidth
                label="Mower Entity ID"
                value={groups.mowerEntity}
                onChange={(e) => updateSingle('mowerEntity', e.target.value)}
                placeholder="lawn_mower.navimow"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={
                  <Box component="span">
                    Last Mow Time Entity <Typography component="span" variant="caption" color="text.disabled">(optional)</Typography>
                  </Box>
                }
                value={groups.lastMowTimeEntity}
                onChange={(e) => updateSingle('lastMowTimeEntity', e.target.value)}
                placeholder="sensor.last_mowed_template (create in HA if needed)"
                helperText="The Navimow integration does not expose last mowed time. To enable this, create a template sensor in HA that tracks when your mower last mowed, or the app will estimate based on its own mow event history."
              />
            </Grid>
          </Grid>
        </Grid>

        {/* Weather section */}
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
              <TextField
                fullWidth
                label="Default Forecast Entity"
                value={groups.weatherForecastEntity}
                onChange={(e) => updateSingle('weatherForecastEntity', e.target.value)}
                placeholder="weather.home"
                helperText="Fallback entity if hourly/daily fields are empty."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Hourly Forecast Entity"
                value={groups.hourlyForecastEntity || ''}
                onChange={(e) => updateSingle('hourlyForecastEntity', e.target.value)}
                placeholder="weather.nws_hourly"
                helperText="Entity for 48-hour hourly forecast. Leave empty to use default."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Daily Forecast Entity"
                value={groups.dailyForecastEntity || ''}
                onChange={(e) => updateSingle('dailyForecastEntity', e.target.value)}
                placeholder="weather.openweathermap"
                helperText="Entity for 7-day daily forecast. Leave empty to use default."
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <TextField
              label="Sun Entity"
              value={groups.sunEntity}
              onChange={(e) => updateSingle('sunEntity', e.target.value)}
              placeholder="sun.sun"
              helperText="Usually sun.sun - provides sunrise/sunset times."
              sx={{ maxWidth: 400 }}
            />
          </Box>
        </Grid>
      </Grid>
    </Stack>
  );
}
