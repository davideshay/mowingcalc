// Grass type presets with recommended growth model parameters
export interface GrassPreset {
  id: string;
  name: string;
  description: string;
  growthModel: {
    baseRatePerDay: number;
    rainMultiplier: number;
    tempOptimalMin: number;
    tempOptimalMax: number;
    sunGrowthBoost: number;
  };
  growthLowerLimit: number;
  growthUpperLimit: number;
}

export const GRASS_PRESETS: GrassPreset[] = [
  {
    id: 'kentucky_bluegrass',
    name: 'Kentucky Bluegrass',
    description: 'Cool-season grass, grows best in 15-25°C',
    growthModel: {
      baseRatePerDay: 0.7,
      rainMultiplier: 0.2,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.15,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
  {
    id: 'tall_fescue',
    name: 'Tall Fescue',
    description: 'Cool-season grass, drought tolerant',
    growthModel: {
      baseRatePerDay: 0.6,
      rainMultiplier: 0.2,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.12,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
  {
    id: 'bermuda',
    name: 'Bermuda Grass',
    description: 'Warm-season grass, grows best in 25-35°C',
    growthModel: {
      baseRatePerDay: 1.0,
      rainMultiplier: 0.25,
      tempOptimalMin: 25,
      tempOptimalMax: 35,
      sunGrowthBoost: 0.2,
    },
    growthLowerLimit: 2,
    growthUpperLimit: 5,
  },
  {
    id: 'zoysia',
    name: 'Zoysia Grass',
    description: 'Warm-season grass, slower growth',
    growthModel: {
      baseRatePerDay: 0.5,
      rainMultiplier: 0.15,
      tempOptimalMin: 25,
      tempOptimalMax: 35,
      sunGrowthBoost: 0.1,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
];

export function findGrassPreset(id: string): GrassPreset | undefined {
  return GRASS_PRESETS.find(p => p.id === id);
}
