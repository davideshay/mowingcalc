// Soil type presets with recommended drying factors
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
    minDelayAfterRain: 12,
    heavyRainDelay: 24,
  },
  {
    id: 'loam',
    name: 'Loam',
    description: 'Balanced drainage and moisture retention',
    sunDryingRate: 0.1,
    tempDryingFactor: 0.05,
    minDelayAfterRain: 24,
    heavyRainDelay: 48,
  },
  {
    id: 'clay',
    name: 'Clay Soil',
    description: 'Drains slowly, stays wet longer',
    sunDryingRate: 0.05,
    tempDryingFactor: 0.03,
    minDelayAfterRain: 36,
    heavyRainDelay: 72,
  },
];

export function findSoilPreset(id: string): SoilPreset | undefined {
  return SOIL_PRESETS.find(p => p.id === id);
}
