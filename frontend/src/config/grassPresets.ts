// Grass type presets with research-backed growth model parameters
// Source: GROWTH_MODEL_RESEARCH.md (GCSAA, USGA, ATC, USDA research)
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
    soilType: 'sand' | 'loam' | 'clay';
    latitude: number;
  };
  growthLowerLimit: number;
  growthUpperLimit: number;
}

export const GRASS_PRESETS: GrassPreset[] = [
  {
    id: 'kentucky_bluegrass',
    name: 'Kentucky Bluegrass',
    description: 'Cool-season grass, peak growth 1.5-2.5mm/day at 16-24C',
    growthModel: {
      baseRatePerDay: 2.0, // Research: 1.5-2.5 mm/day at optimum (medium N)
      rainMultiplier: 0.2,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.15,
      soilType: 'loam',
      latitude: 40,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
  {
    id: 'tall_fescue',
    name: 'Tall Fescue',
    description: 'Cool-season grass, drought tolerant, peak 2-3mm/day',
    growthModel: {
      baseRatePerDay: 2.5, // Research: 2-3 mm/day at optimum (medium N)
      rainMultiplier: 0.2,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.12,
      soilType: 'loam',
      latitude: 40,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
  {
    id: 'bermuda',
    name: 'Bermuda Grass',
    description: 'Warm-season grass, peak growth 2.5-4mm/day at 27-35C',
    growthModel: {
      baseRatePerDay: 3.0, // Research: 2.5-4 mm/day at optimum (medium N)
      rainMultiplier: 0.25,
      tempOptimalMin: 25,
      tempOptimalMax: 35,
      sunGrowthBoost: 0.2,
      soilType: 'loam',
      latitude: 34,
    },
    growthLowerLimit: 2,
    growthUpperLimit: 5,
  },
  {
    id: 'zoysia',
    name: 'Zoysia Grass',
    description: 'Warm-season grass, moderate growth 1-1.5mm/day at 27-35C',
    growthModel: {
      baseRatePerDay: 1.2, // Research: 1-1.5 mm/day at optimum (medium N)
      rainMultiplier: 0.15,
      tempOptimalMin: 25,
      tempOptimalMax: 35,
      sunGrowthBoost: 0.1,
      soilType: 'loam',
      latitude: 34,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
  {
    id: 'ryegrass',
    name: 'Perennial Ryegrass',
    description: 'Cool-season grass, fast germination, peak 2-3mm/day',
    growthModel: {
      baseRatePerDay: 2.5, // Research: 2-3 mm/day at optimum (medium N)
      rainMultiplier: 0.2,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.15,
      soilType: 'loam',
      latitude: 40,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
  {
    id: 'bentgrass',
    name: 'Creeping Bentgrass',
    description: 'Cool-season grass, golf greens, peak 1.5-2.5mm/day',
    growthModel: {
      baseRatePerDay: 2.0, // Research: 1.5-2.5 mm/day at optimum (medium N)
      rainMultiplier: 0.2,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.1,
      soilType: 'sand', // Golf greens typically sand-based
      latitude: 40,
    },
    growthLowerLimit: 2,
    growthUpperLimit: 4,
  },
  {
    id: 'fine_fescue',
    name: 'Fine Fescues',
    description: 'Cool-season grass, shade tolerant, slow growth 0.8-1.2mm/day',
    growthModel: {
      baseRatePerDay: 1.0, // Research: 0.8-1.2 mm/day at optimum (medium N)
      rainMultiplier: 0.15,
      tempOptimalMin: 15,
      tempOptimalMax: 25,
      sunGrowthBoost: 0.1,
      soilType: 'loam',
      latitude: 40,
    },
    growthLowerLimit: 3,
    growthUpperLimit: 6,
  },
];

export function findGrassPreset(id: string): GrassPreset | undefined {
  return GRASS_PRESETS.find(p => p.id === id);
}
