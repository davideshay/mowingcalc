// Soil type presets with recommended drying factors
// Values optimized for 60-70 lb robot mowers (RAIN_DELAY_MODEL_RESEARCH.md)
export interface SoilPreset {
  id: string;
  name: string;
  description: string;
  sunDryingRate: number;
  tempDryingFactor: number;
  minDelayAfterRain: number;
  heavyRainDelay: number;
}

export const SOIL_PRESETS: SoilPreset[] = [
  {
    id: 'sand',
    name: 'Sandy Soil',
    description: 'Drains quickly, dries fast',
    sunDryingRate: 0.2,
    tempDryingFactor: 0.08,
    minDelayAfterRain: 4,  // Surface blade drying time (independent of soil)
    heavyRainDelay: 48,    // Absolute max delay ceiling
  },
  {
    id: 'loam',
    name: 'Loam',
    description: 'Balanced drainage and moisture retention',
    sunDryingRate: 0.1,
    tempDryingFactor: 0.05,
    minDelayAfterRain: 4,  // Surface blade drying time (independent of soil)
    heavyRainDelay: 48,    // Absolute max delay ceiling
  },
  {
    id: 'clay',
    name: 'Clay Soil',
    description: 'Drains slowly, stays wet longer',
    sunDryingRate: 0.05,
    tempDryingFactor: 0.03,
    minDelayAfterRain: 4,  // Surface blade drying time (independent of soil)
    heavyRainDelay: 48,    // Absolute max delay ceiling
  },
];

export function findSoilPreset(id: string): SoilPreset | undefined {
  return SOIL_PRESETS.find(p => p.id === id);
}
