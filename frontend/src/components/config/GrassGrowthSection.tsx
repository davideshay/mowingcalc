import { useState } from 'react';
import { Stack, Typography, Paper, TextField, Box, Button, Collapse, IconButton, Grid } from '@mui/material';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined';
import { GRASS_PRESETS, findGrassPreset } from '../../config/grassPresets';
import { toDisplayLength, toDisplayTemp, lengthUnit, tempUnit } from '../../utils/units';
import type { DisplayUnits } from '../../utils/units';

interface Props {
  grassType: string;
  growthLowerLimit: number;
  growthUpperLimit: number;
  growthModel: any;
  displayUnits: DisplayUnits;
  onChange: (updates: any) => void;
}

export function GrassGrowthSection({ grassType, growthLowerLimit, growthUpperLimit, growthModel, displayUnits, onChange }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const preset = findGrassPreset(grassType);
  const unit = lengthUnit(displayUnits);

  const handleGrassTypeChange = (newType: string) => {
    const newPreset = findGrassPreset(newType);
    if (newPreset) {
      onChange({
        grassType: newType,
        growthLowerLimit: newPreset.growthLowerLimit,
        growthUpperLimit: newPreset.growthUpperLimit,
        growthModel: { ...newPreset.growthModel },
      });
    }
  };

  // Convert display value back to mm for storage
  const toMm = (v: number) => displayUnits === 'imperial' ? v * 25.4 : v;
  // Convert display temp back to Celsius for storage
  const toC = (v: number) => displayUnits === 'imperial' ? (v - 32) * 5 / 9 : v;

  return (
    <Stack spacing={3}>
      {/* Grass Type Selection */}
      <Box>
        <Typography variant="h6" gutterBottom>Grass Type</Typography>
        <Grid container spacing={2}>
          {GRASS_PRESETS.map((p) => (
            <Grid size={{ xs: 12, sm: 6 }} key={p.id}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: grassType === p.id ? '2px solid' : '1px solid',
                  borderColor: grassType === p.id ? 'primary.main' : 'divider',
                  bgcolor: grassType === p.id ? 'action.selected' : 'background.paper',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    borderColor: grassType === p.id ? 'primary.main' : 'primary.light',
                  },
                }}
                onClick={() => handleGrassTypeChange(p.id)}
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

      {/* When to Mow */}
      <Box>
        <Typography variant="h6" gutterBottom>When to Mow</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <NumberInput
              label={`Mow when growth reaches (${unit})`}
              value={toDisplayLength(growthLowerLimit, displayUnits)}
              onChange={(v) => onChange({ growthLowerLimit: toMm(v) })}
              helperText="Minimum growth to trigger mowing"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <NumberInput
              label={`Emergency mow threshold (${unit})`}
              value={toDisplayLength(growthUpperLimit, displayUnits)}
              onChange={(v) => onChange({ growthUpperLimit: toMm(v) })}
              helperText="Maximum growth before emergency mow"
            />
          </Grid>
        </Grid>
      </Box>

      {/* Growth Model (Advanced) */}
      <Collapse in={advanced}>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" component="h3" sx={{ m: 0 }}>Growth Model Parameters</Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                onClick={() => {
                  if (preset) {
                    onChange({
                      growthModel: { ...preset.growthModel },
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
                label={`Base growth rate (${unit}/day)`}
                value={toDisplayLength(growthModel?.baseRatePerDay ?? 0, displayUnits)}
                onChange={(v) => onChange({ growthModel: { ...growthModel, baseRatePerDay: toMm(v) } })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label="Rain multiplier"
                value={growthModel?.rainMultiplier}
                onChange={(v) => onChange({ growthModel: { ...growthModel, rainMultiplier: v } })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label={`Optimal temp min (${tempUnit(displayUnits)})`}
                value={toDisplayTemp(growthModel?.tempOptimalMin ?? 15, displayUnits)}
                onChange={(v) => onChange({ growthModel: { ...growthModel, tempOptimalMin: toC(v) } })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label={`Optimal temp max (${tempUnit(displayUnits)})`}
                value={toDisplayTemp(growthModel?.tempOptimalMax ?? 25, displayUnits)}
                onChange={(v) => onChange({ growthModel: { ...growthModel, tempOptimalMax: toC(v) } })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label="Sun growth boost"
                value={growthModel?.sunGrowthBoost}
                onChange={(v) => onChange({ growthModel: { ...growthModel, sunGrowthBoost: v } })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Soil Type"
                size="small"
                fullWidth
                value={growthModel?.soilType || 'loam'}
                onChange={(e) => onChange({ growthModel: { ...growthModel, soilType: e.target.value } })}
              >
                <option value="sand">Sand (fast drainage, low nutrients)</option>
                <option value="loam">Loam (optimal balance)</option>
                <option value="clay">Clay (slow drainage, good nutrients)</option>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <NumberInput
                label="Latitude (degrees)"
                value={growthModel?.latitude}
                onChange={(v) => onChange({ growthModel: { ...growthModel, latitude: v } })}
                helperText="For seasonal dormancy (e.g., 40 = NY, 34 = LA)"
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
          Show advanced growth model parameters
        </Button>
      )}
    </Stack>
  );
}

function NumberInput({ label, value, onChange, helperText }: { label: string; value: number; onChange: (v: number) => void; helperText?: string }) {
  return (
    <TextField
      type="number"
      label={label}
      size="small"
      fullWidth
      value={parseFloat(value.toFixed(2))}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      slotProps={{ htmlInput: { step: 'any' } }}
      helperText={helperText}
    />
  );
}
