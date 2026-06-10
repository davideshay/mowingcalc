import { useState } from 'react';
import { Stack, Typography, Paper, TextField, Box, Button, Collapse, IconButton, Grid } from '@mui/material';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined';
import { SOIL_PRESETS, findSoilPreset } from '../../config/soilPresets';

interface Props {
  soilType: string;
  rainDelayModel: any;
  onChange: (updates: any) => void;
}

export function RainDelaySection({ soilType, rainDelayModel, onChange }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const preset = findSoilPreset(soilType);

  const handleSoilTypeChange = (newType: string) => {
    const newPreset = findSoilPreset(newType);
    if (newPreset) {
      onChange({
        soilType: newType,
        sunDryingRate: newPreset.sunDryingRate,
        tempDryingFactor: newPreset.tempDryingFactor,
        minDelayAfterRain: newPreset.minDelayAfterRain,
        heavyRainDelay: newPreset.heavyRainDelay,
      });
    }
  };

  return (
    <Stack spacing={3}>
      {/* Soil Type Selection */}
      <Box>
        <Typography variant="h6" gutterBottom>Soil Type</Typography>
        <Grid container spacing={2}>
          {SOIL_PRESETS.map((p) => (
            <Grid size={{ xs: 12, sm: 4 }} key={p.id}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: soilType === p.id ? '2px solid' : '1px solid',
                  borderColor: soilType === p.id ? 'primary.main' : 'divider',
                  bgcolor: soilType === p.id ? 'action.selected' : 'background.paper',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    borderColor: soilType === p.id ? 'primary.main' : 'primary.light',
                  },
                }}
                onClick={() => handleSoilTypeChange(p.id)}
              >
                <Typography variant="body1" sx={{ fontWeight: 'medium', color: 'text.primary' }}>
                  {p.name}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                  {p.description}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Mower Settings */}
      <Box>
        <Typography variant="h6" gutterBottom>Mower Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mower weight affects the compaction threshold. Robot mowers (60-70 lbs) can safely
          mow on wetter soil than conventional riding mowers (300+ lbs).
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <NumberInput
              label="Mower weight (lbs)"
              value={rainDelayModel?.mowerWeightLbs ?? 65}
              onChange={(v) => onChange({ mowerWeightLbs: v })}
              helperText="60-70 for robot mowers, 200+ for riding mowers"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <NumberInput
              label="Compaction threshold (% of FC)"
              value={(rainDelayModel?.compactionThreshold ?? 1.05) * 100}
              onChange={(v) => onChange({ compactionThreshold: v / 100 })}
              helperText="105% for robot mowers, 100% for conventional"
              step={1}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <NumberInput
              label="Surface dry factor (%)"
              value={(rainDelayModel?.surfaceDryFactor ?? 0.3) * 100}
              onChange={(v) => onChange({ surfaceDryFactor: v / 100 })}
              helperText="Extra drying beyond safe threshold for optimal cut quality"
              step={5}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Rain Delay Settings */}
      <Box>
        <Typography variant="h6" gutterBottom>Rain Delay Settings</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <NumberInput
              label="Minimum delay after any rain (hours)"
              value={rainDelayModel?.minDelayAfterRain}
              onChange={(v) => onChange({ minDelayAfterRain: v })}
              helperText="Absolute floor: even light rain waits this long for surface blades to dry."
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <NumberInput
              label="Maximum rain delay (hours)"
              value={rainDelayModel?.heavyRainDelay}
              onChange={(v) => onChange({ heavyRainDelay: v })}
              helperText="Absolute ceiling: model output never exceeds this regardless of how hard it rained."
            />
          </Grid>
        </Grid>
      </Box>

      {/* Drying Factors (Advanced) */}
      <Collapse in={advanced}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" component="h3" sx={{ m: 0 }}>Drying Factors</Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={() => {
                  if (preset) {
                    onChange({
                      sunDryingRate: preset.sunDryingRate,
                      tempDryingFactor: preset.tempDryingFactor,
                    });
                  }
                }}
              >
                Reset to defaults
              </Button>
              <IconButton
                size="small"
                onClick={() => setAdvanced(false)}
              >
                <ExpandLessOutlined />
              </IconButton>
            </Stack>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label="Sun drying rate (per hour)"
                value={rainDelayModel?.sunDryingRate}
                onChange={(v) => onChange({ sunDryingRate: v })}
                helperText="How much rain delay is reduced by sunshine"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label="Temperature drying factor"
                value={rainDelayModel?.tempDryingFactor}
                onChange={(v) => onChange({ tempDryingFactor: v })}
                helperText="How much rain delay is reduced by temperature"
              />
            </Grid>
          </Grid>
        </Box>
      </Collapse>

      {!advanced && (
        <Button
          size="small"
          endIcon={<ExpandMoreOutlined />}
          onClick={() => setAdvanced(true)}
          sx={{ textTransform: 'none' }}
        >
          Show advanced drying factors
        </Button>
      )}
    </Stack>
  );
}

function NumberInput({ label, value, onChange, helperText, step }: { label: string; value: number; onChange: (v: number) => void; helperText?: string; step?: number | 'any' }) {
  return (
    <TextField
      type="number"
      label={label}
      size="small"
      fullWidth
      value={parseFloat(value.toFixed(2))}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      slotProps={{ htmlInput: { step: step ?? 'any' } }}
      helperText={helperText}
    />
  );
}
