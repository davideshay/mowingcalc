# Algorithm Research Summary

## Research Date: 2026-06-04
## Sources: SearXNG research + primary literature review

---

## 1. GRASS GROWTH MODEL (Algorithm 1)

### Key Findings

#### Daily Growth Rate (Tall Fescue & Kentucky Bluegrass)
- Both are cool-season grasses with nearly identical growth characteristics
- At optimal conditions: ~0.5-1mm/day under normal conditions
- At peak growth with adequate moisture: up to 2-3mm/day
- Mowing frequency of every 4-5 days at peak growth suggests ~5mm accumulated over 5 days
- At slower periods (every 10-14 days): ~2-3mm/day
- Industry rule: cut no more than 1/3 of grass height per mowing
- Minor difference: Kentucky bluegrass stops growing at lower temps (80F/27C vs 90F/32C)
  - Handled by configurable temp_optimal and temp_sd parameters

#### Temperature Response Curve (GCSAA Growth Potential Model)
Source: GCSAA Growth Potential Reference
- GP = 100 * exp(-0.5 * ((obsT - optT) / sd)^2)
- Cool-season turf: optimum 68F (20C), sd=10F (5.56C)
- Cool-season turf grows best between 60-75F (15.5-23.9C)
- At 68F = 100% GP, at 58F = 64% GP, at 78F = 52% GP
- At 48F = 18% GP, at 88F = 5% GP
- At extreme temps (38F, 98F): ~1% GP

#### Rainfall Effect on Growth (Asian Turfgrass Center - Micah Woods)
Source: https://www.asianturfgrass.com/post/nitrogen-in-rain-or-nitrogen-from-the-soil/
- 20mm rain increases daily growth from 10 mL/m2/day to 22 mL/m2/day (MORE THAN DOUBLE)
- Growth stimulation lasts 5+ days after significant rain event
- Three mechanisms:
  1. N in rain: 0.03 g N/m2 from 20mm rain -> 2.5 mL/m2/day increase over 5 days
  2. N mineralization: soil organic matter releases N after wetting
  3. Soil moisture: primary driver - VWC 15% -> 33% relative growth; VWC 27% -> 73% relative growth
- Wilting point: ~5% VWC (zero growth)
- Field capacity: ~35% VWC (100% growth potential)
- Linear relationship between VWC and growth rate assumed

#### USDA-ARS Tall Fescue Model (ALMANAC)
Source: Kiniry et al. 2018, "Simulating bimodal tall fescue growth with a degree-day-based process-oriented plant model"
- Base temperature: growth starts above base temp in spring
- Optimum temperature: growth peaks then declines as temp exceeds optimum
- Bimodal growth: spring peak, summer dormancy, fall peak
- Dormancy begins on longest day of year, lasts ~5 weeks
- Growth parameters:
  - WA (potential growth rate per unit PAR): 32
  - DLMA (max leaf area index): 5
  - DLAI (fraction of growing season when leaf area starts to decline): 0.50
  - DORMNT (daylength when dormancy begins): 0.677
- 2800 potential heat units from greenup to maturity
- Model validated against field data across 11 sites in Midwest USA

### Implemented Model

The grass growth model combines:
1. Temperature response curve (GCSAA GP model) - primary driver
2. Rainfall/moisture effect (ATC model) - secondary driver
3. Base growth rate calibrated to tall fescue characteristics

Formula:
daily_growth_mm = base_rate * GP_factor * moisture_factor

Where:
- base_rate: 0.7 mm/day (configurable)
- GP_factor: growth potential from temperature (0-1 scale)
- moisture_factor: soil moisture effect (0-1 scale based on VWC)

---

## 2. RAIN DELAY MODEL (Algorithm 2)

### Key Findings

#### Wait Time After Rain
Source: Multiple industry sources (Husqvarna, Sunseeker, LawnStarter)
- General rule: wait 24-48 hours after rainfall before mowing
- Light rain (drizzle): 4-6 hours
- Moderate rain: 24 hours
- Heavy rain: 24-48 hours minimum
- Heavy rain + cloudy: 3-5 days
- Heavy rain + full sun: 2-4 days

#### Soil Drying Times
Source: UMN Extension, ConnectedCrops, Clemson HGIC
- Sandy soil: drains from saturation to field capacity within 24 hours
- Loam soil: 1-2 days
- Clay soil: 2-3 days or more
- Infiltration rates:
  - Sand: up to 10 inches/hour (254 mm/hour)
  - Clay: less than 0.05 inches/hour (1.27 mm/hour)

#### Soil Moisture Thresholds
Source: Oklahoma State Extension
- Wilting point VWC: 5-10% (sand), 10-15% (loam), 15-20% (clay)
- Field capacity VWC: 20% (sand), 30% (loam), 40% (clay)
- Safe mowing threshold: soil at or below field capacity

#### Reasons Not to Mow Wet Grass
1. Uneven/ragged cutting (wet grass bends, tears instead of cutting)
2. Soil compaction (weight of mower crushes air pockets in saturated soil)
3. Disease spread (fungus spreads on wet grass blades)
4. Mower clogging (wet clippings stick to deck)
5. Safety hazard (slipping on wet grass)

### Implemented Model

The rain delay model calculates:
1. Time since last significant rainfall
2. Soil drying rate based on soil type, temperature, sun exposure, wind
3. Estimated soil moisture content at current time
4. Safe-to-mow threshold: soil at or below field capacity

Formula:
delay_hours = base_delay * soil_factor * weather_factor

Where:
- base_delay: 24 hours for moderate rain, 48 hours for heavy rain
- soil_factor: 0.5 (sand), 1.0 (loam), 1.5 (clay)
- weather_factor: 0.5 (full sun), 1.0 (cloudy), 1.5 (cool/cloudy)

---

## 3. IMPLEMENTATION NOTES

### Configuration Parameters
- base_rate_per_day: 0.7 mm/day (tall fescue default)
- temp_optimal_min: 15C
- temp_optimal_max: 25C
- temp_optimal: 20C (68F)
- temp_sd: 5.56C (10F)
- rain_multiplier: 0.2 mm growth per 1mm rainfall
- sun_growth_boost: 0.15 (15% boost with adequate sun)
- min_delay_after_rain: 24 hours
- heavy_rain_delay: 48 hours
- sun_drying_rate: 0.1 (reduction factor per hour of sun)
- temp_drying_factor: 0.05 (reduction per degree above 15C)
- soil_type: configurable (sand, loam, clay)

### Data Sources
- GCSAA Growth Potential Reference: https://www.gcsaa.org/docs/default-source/environment/ipm-section/ipm-planner/reference_growth-potential-newlogo.pdf
- USDA-ARS ALMANAC tall fescue model: https://www.ars.usda.gov/ARSUserFiles/51447/Simulating_bimodal_tall_fescue_growth_with_a_degree-day-based_process-oriented_plant_model.pdf
- Asian Turfgrass Center: https://www.asianturfgrass.com/post/nitrogen-in-rain-or-nitrogen-from-the-soil/
- UMN Extension: https://extension.umn.edu/irrigation/basics-irrigation-scheduling
- USGA Turfgrass Water Requirements: https://www.usga.org/content/dam/usga/pdf/Water%20Resource%20Center/turfgrass-water-requirements.pdf
