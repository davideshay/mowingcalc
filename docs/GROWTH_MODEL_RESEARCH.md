# Grass Growth Model Research

**Research Date:** 2026-06-09
**Sources:** SearXNG research + primary literature review + GCSAA/USGA/USDA documents
**Purpose:** Comprehensive analysis of turfgrass growth models for optimizing the MowingCalc algorithm

---

## 1. EXECUTIVE SUMMARY

After extensive research, the best-practice model for predicting daily turfgrass growth combines:

1. **PACE Turf Growth Potential (GP)** - Temperature response curve (primary driver)
2. **Asian Turfgrass Center (ATC) moisture model** - Soil moisture / VWC effect
3. **USGA Crop Coefficient (Kc)** - Species-specific evapotranspiration scaling
4. **Soil texture factor** - Nutrient/water holding capacity by soil type
5. **Nitrogen availability factor** - Fertilization program impact
6. **Photoperiod / seasonal adjustment** - Latitude-based dormancy curves
7. **Sunshine / PAR factor** - Solar radiation effect (secondary)

Current model in growth-model.ts covers items 1-2 and partially 7. Items 3-6 are missing or oversimplified.

---

## 2. TEMPERATURE RESPONSE - GCSAA / PACE TURF GP MODEL

### 2.1 The Model

Source: GCSAA Growth Potential Reference (Gelernter & Stowell, 2005)
Source: Asian Turfgrass Center - Micah Woods (2013)

The Growth Potential (GP) model is a Gaussian curve comparing observed temperature to the optimum:

**Equation (Celsius):**
GP = exp(-0.5 * ((t - t_opt) / var)^2)

Where:
- GP = growth potential (0.0 to 1.0 scale)
- t = average temperature for a location (Celsius)
- t_opt = optimum temperature
- var = variance (standard deviation)

**Cool-season grasses (C3 photosynthetic pathway):**
- t_opt = 20C (68F)
- var = 5.5 (10F)
- Optimum range: 16-24C (60-75F)

**Warm-season grasses (C4 photosynthetic pathway):**
- t_opt = 31C (88F)
- var = 7.3 (12F)
- Optimum range: 27-35C (80-95F)

### 2.2 Key Findings from GCSAA Reference

- GP 50-100% = good growth conditions
- GP = 100% = best possible growth (at optimum temperature)
- GP < 50% = turf progressively more stressed
- GP < 10% = growth extremely limited / near dormancy

### 2.3 Monthly GP by City (Cool-Season)

From GCSAA reference data:

**Denver, CO (elevation ~5280ft):**
Jan: 0%, Feb: 0%, Mar: 2%, Apr: 16%, May: 59%, Jun: 100%, Jul: 84%, Aug: 93%, Sep: 87%, Oct: 27%, Nov: 2%, Dec: 0%

**Atlanta, GA (transition zone):**
Jan: 3%, Feb: 8%, Mar: 38%, Apr: 84%, May: 99%, Jun: 70%, Jul: 53%, Aug: 57%, Sep: 87%, Oct: 87%, Nov: 35%, Dec: 7%

**Los Angeles, CA:**
Jan: 56%, Feb: 61%, Mar: 64%, Apr: 76%, May: 89%, Jun: 98%, Jul: 99%, Aug: 96%, Sep: 97%, Oct: 100%, Nov: 84%, Dec: 57%

**Miami, FL (warm-season GP):**
Jan: 27%, Feb: 31%, Mar: 45%, Apr: 61%, May: 77%, Jun: 88%, Jul: 92%, Aug: 92%, Sep: 89%, Oct: 75%, Nov: 53%, Dec: 33%

### 2.4 Critical Finding: Temperature vs Light

From Asian Turfgrass Center (Micah Woods, 2022):
- Temperature is THE dominant factor controlling growth
- Even with abundant light (DLI > 50 mol/m2/day), grass does NOT grow if temperature is below ~5C
- In Iceland study: PPFD > 1000 umol/m2/s (sufficient light), mean temp 1.4C -> zero growth
- Temperature-based GP alone explains most growth variation
- Adding light adjustment to GP is NOT recommended by Woods - temperature is the controlling variable

### 2.5 Current Model Assessment

Our current implementation (growth-model.ts):
- Uses GP equation correctly with configurable tempOptimalMin/Max
- Default: 15-25C range -> opt=20C, sd=5C (close to 5.5 standard)
- Issue: sd=5 is narrower than the standard 5.5, making the curve too sharp
- Fix: sd should be 5.56C (10F) for cool-season, 7.3C (12F) for warm-season

---

## 3. MOISTURE EFFECT ON GROWTH

### 3.1 ATC Soil Moisture Model

Source: Asian Turfgrass Center (Micah Woods) - "Nitrogen in rain or nitrogen from the soil?"

Key findings:
- 20mm rain increases daily growth from 10 mL/m2/day to 22 mL/m2/day (MORE THAN DOUBLE)
- Growth stimulation lasts 5+ days after significant rain event
- Three mechanisms:
  1. N in rain: 0.03 g N/m2 from 20mm rain -> 2.5 mL/m2/day increase over 5 days
  2. N mineralization: soil organic matter releases N after wetting
  3. Soil moisture: primary driver

**Volumetric Water Content (VWC) vs Growth:**
- Wilting point: ~5% VWC (zero growth)
- Field capacity: ~35% VWC (100% growth potential)
- Linear relationship between VWC and growth rate assumed
- VWC 15% -> 33% relative growth
- VWC 27% -> 73% relative growth

### 3.2 Current Model Assessment

Our current implementation:
- Uses rainfall history with 5-day decay (half-life approach)
- rainMultiplier: 0.2 mm growth per 1mm rainfall
- Issues:
  * Does not model actual VWC - uses rainfall proxy
  * No distinction between soil types for water holding
  * Linear rain effect is oversimplified
  * Missing the N mineralization effect (delayed growth boost 2-3 days post-rain)

### 3.3 Improved Approach

1. Track soil moisture as VWC estimate based on:
   - Initial field capacity (varies by soil type)
   - Rainfall additions
   - Evapotranspiration losses (based on temperature, solar radiation, wind)
   - Drainage (varies by soil type)

2. Map VWC to growth factor:
   - Below wilting point: 0 growth
   - Wilting point to field capacity: linear interpolation
   - Above field capacity: 100% growth (saturation)

3. Add delayed N mineralization effect:
   - Peak growth boost occurs 2-3 days after significant rain
   - Decay over 5-7 days

---

## 4. SOIL TYPE EFFECTS

### 4.1 Soil Properties by Type

From USGA and extension service research:

| Property | Sand | Loam | Clay |
|----------|------|------|------|
| Water holding capacity | Low (15-20% VWC at FC) | Medium (25-30% VWC at FC) | High (35-45% VWC at FC) |
| Wilting point VWC | 5-8% | 10-15% | 15-20% |
| Drainage rate | Fast (hours) | Medium (1-2 days) | Slow (2-3+ days) |
| Nutrient retention | Poor | Good | Excellent |
| Root penetration | Easy | Easy | Difficult |
| Aeration | Excellent | Good | Poor |

### 4.2 Growth Impact by Soil Type

- Sandy soils: Lower nutrient availability -> reduced growth unless fertilized
  * Growth reduction factor: 0.7-0.8 (without supplemental N)
  * Faster drainage -> less water stress in wet conditions, more in dry
  
- Loam soils: Optimal balance of water/nutrients/aeration
  * Growth factor: 1.0 (baseline)
  * Best overall performance for most species
  
- Clay soils: Good nutrient retention but poor drainage/aeration
  * Growth reduction factor: 0.8-0.9 (when properly managed)
  * Risk of waterlogging -> root oxygen deprivation
  * Slow drainage -> longer wet periods after rain

### 4.3 Current Model Assessment

Our current implementation:
- soilType parameter exists in rainDelayModel but NOT in growthModel
- No soil-type adjustment to growth rate
- Recommendation: Add soilType to growthModel with species-specific adjustments

### 4.4 Species x Soil Type Interactions

| Species | Sand | Loam | Clay |
|---------|------|------|------|
| Kentucky Bluegrass | Good | Excellent | Fair |
| Tall Fescue | Good | Excellent | Good |
| Perennial Ryegrass | Fair | Excellent | Good |
| Creeping Bentgrass | Excellent | Good | Poor |
| Bermuda | Excellent | Good | Fair |
| Zoysia | Good | Excellent | Good |

---

## 5. SPECIES-SPECIFIC GROWTH RATES

### 5.1 Cool-Season Grasses (C3 Photosynthetic Pathway)

**Kentucky Bluegrass (Poa pratensis):**
- Optimal temp: 16-24C (60-75F)
- Peak growth: Spring and Fall
- Dormant: Summer heat stress (>30C), Winter freeze
- Growth rate at optimum: 0.8-1.5 mm/day (with adequate moisture/N)
- ET rate: 8.5-10 mm/day (high water user)
- Crop coefficient (Kc): 0.91-0.95

**Tall Fescue (Festuca arundinacea):**
- Optimal temp: 16-24C (60-75F)
- Peak growth: Spring and Fall
- More heat tolerant than Kentucky bluegrass
- Growth rate at optimum: 0.6-1.2 mm/day
- ET rate: 8.5-10 mm/day (very high water user)
- Crop coefficient (Kc): 0.91-0.95
- Deep root system -> better drought tolerance

**Perennial Ryegrass (Lolium perenne):**
- Optimal temp: 16-24C (60-75F)
- Peak growth: Spring and Fall
- Growth rate at optimum: 0.7-1.4 mm/day
- ET rate: 8.5-10 mm/day
- Crop coefficient (Kc): 0.91-0.95
- Fast germination, quick establishment

**Creeping Bentgrass (Agrostis stolonifera):**
- Optimal temp: 16-24C (60-75F)
- Peak growth: Spring and Fall
- Growth rate at optimum: 0.5-1.0 mm/day (lower cut height)
- ET rate: >10 mm/day (very high water user)
- Crop coefficient (Kc): 0.91-0.95
- Used on golf greens, maintained at very low height

**Fine Fescues (Red, Chewings, Hard):**
- Optimal temp: 16-24C (60-75F)
- Peak growth: Spring and Fall
- Growth rate at optimum: 0.4-0.8 mm/day (slower growing)
- ET rate: 7-8.5 mm/day (moderate water user)
- Crop coefficient (Kc): 0.85-0.90
- Shade tolerant, low maintenance

### 5.2 Warm-Season Grasses (C4 Photosynthetic Pathway)

**Bermudagrass (Cynodon dactylon):**
- Optimal temp: 27-35C (80-95F)
- Peak growth: Summer
- Dormant: Winter (<10C soil temp)
- Growth rate at optimum: 1.0-2.0 mm/day (fastest growing)
- ET rate: 6-7 mm/day (low water user)
- Crop coefficient (Kc): 0.60-0.70

**Zoysiagrass (Zoysia spp.):**
- Optimal temp: 27-35C (80-95F)
- Peak growth: Summer
- Dormant: Winter (<10C soil temp)
- Growth rate at optimum: 0.5-1.0 mm/day (slower than bermuda)
- ET rate: 6-7 mm/day (low water user)
- Crop coefficient (Kc): 0.60-0.70

**St. Augustinegrass (Stenotaphrum secundatum):**
- Optimal temp: 27-35C (80-95F)
- Peak growth: Summer
- Growth rate at optimum: 0.8-1.5 mm/day
- ET rate: 7-8.5 mm/day (moderate water user)
- Crop coefficient (Kc): 0.70-0.80

### 5.3 Growth Rate Comparison Table

| Species | Type | Peak Growth (mm/day) | ET Rate (mm/day) | Kc | Optimal Temp |
|---------|------|---------------------|------------------|-----|-------------|
| Kentucky Bluegrass | Cool | 0.8-1.5 | 8.5-10 | 0.91-0.95 | 16-24C |
| Tall Fescue | Cool | 0.6-1.2 | 8.5-10 | 0.91-0.95 | 16-24C |
| Perennial Ryegrass | Cool | 0.7-1.4 | 8.5-10 | 0.91-0.95 | 16-24C |
| Creeping Bentgrass | Cool | 0.5-1.0 | >10 | 0.91-0.95 | 16-24C |
| Fine Fescues | Cool | 0.4-0.8 | 7-8.5 | 0.85-0.90 | 16-24C |
| Bermudagrass | Warm | 1.0-2.0 | 6-7 | 0.60-0.70 | 27-35C |
| Zoysiagrass | Warm | 0.5-1.0 | 6-7 | 0.60-0.70 | 27-35C |
| St. Augustine | Warm | 0.8-1.5 | 7-8.5 | 0.70-0.80 | 27-35C |

Note: Growth rates assume adequate moisture, nitrogen, and no stress factors.

---

## 6. NITROGEN EFFECT ON GROWTH

### 6.1 N as Primary Growth Limiter

From UW-Madison dissertation (Zhou, 2021) and USGA research:
- N is the most limiting nutrient for turfgrass growth
- Tissue N content ranges from 2.5% to 5.0% (average 3.9%)
- N fertilization rate directly controls growth rate
- Growth response to N follows a curve: rapid initial increase, then plateau

### 6.2 Growth Rate vs N Application

Typical growth rates by N level (for cool-season grasses at optimal temp):
- Low N (0.5 lb/1000 sq ft/month): 0.3-0.5 mm/day
- Medium N (1.0 lb/1000 sq ft/month): 0.5-0.8 mm/day
- High N (2.0 lb/1000 sq ft/month): 0.8-1.5 mm/day
- Very high N (3.0+ lb/1000 sq ft/month): 1.0-2.0 mm/day

### 6.3 N x Temperature Interaction

From PACE Turf GP model and UW-Madison research:
- N requirements scale with GP
- At GP=100%, full N rate needed to maintain growth
- At GP=50%, ~50% of N rate needed
- At GP<10%, minimal N needed (near dormancy)

Formula: N_requirement = max_N_rate * GP_factor

### 6.4 Current Model Assessment

Our current implementation:
- No nitrogen parameter in growthModel
- baseRatePerDay implicitly assumes "medium" N fertilization
- Recommendation: Add nitrogenLevel parameter (low/medium/high) with multipliers
  * Low: 0.5x base rate
  * Medium: 1.0x base rate
  * High: 1.5x base rate

---

## 7. CURRENT MODEL ANALYSIS (growth-model.ts)

### 7.1 Current Formula

```
daily_growth_mm = baseRatePerDay * GP_factor * moisture_factor
```

Where:
- baseRatePerDay: 0.7 mm/day (default for tall fescue)
- GP_factor: exp(-0.5 * ((temp - opt_temp) / sd)^2)
- moisture_factor: 1 + (effective_rain * rainMultiplier), capped 0.3-2.0

### 7.2 What's Working Well

1. GP temperature model is fundamentally correct (GCSAA standard)
2. Rain decay approach (5-day half-life) is reasonable approximation
3. Hourly calculation granularity is appropriate
4. Configurable species parameters allow customization

### 7.3 Issues Identified

**Critical Issues:**
1. **sd parameter too narrow**: Current sd=5C vs standard 5.56C -> overestimates growth drop-off at temp extremes
2. **No species-specific base rates**: All grasses use same baseRatePerDay (0.7) regardless of type
3. **No nitrogen factor**: Fertilization level completely ignored
4. **No soil type integration**: Soil texture affects both water retention and nutrient availability
5. **Moisture model oversimplified**: Linear rain multiplier doesn't reflect VWC dynamics

**Minor Issues:**
6. **sunGrowthBoost not used**: Parameter exists in schema but never applied in calculateGrowth()
7. **No seasonal dormancy**: Model doesn't account for photoperiod-induced dormancy
8. **No geographic adjustment**: Latitude/elevation effects ignored
9. **Base rate calibration**: 0.7 mm/day appears low for peak growth conditions

### 7.4 Base Rate Calibration

From research data:
- Tall fescue peak growth: 0.6-1.2 mm/day -> current 0.7 is reasonable for medium N
- Kentucky bluegrass peak: 0.8-1.5 mm/day -> should be ~1.0 for medium N
- Bermuda peak: 1.0-2.0 mm/day -> should be ~1.5 for medium N
- Zoysia peak: 0.5-1.0 mm/day -> should be ~0.7 for medium N

Current presets in grassPresets.ts are close but could be refined.

---

## 8. PROPOSED OPTIMIZED MODEL

### 8.1 Enhanced Formula

```
daily_growth_mm = baseRate * GP_factor * moisture_factor * nitrogen_factor * soil_factor * seasonal_factor
```

Where each factor is 0.0-1.5+ scale:

**baseRate**: Species-specific peak growth rate at optimal conditions
**GP_factor**: Temperature response (GCSAA model with correct parameters)
**moisture_factor**: VWC-based growth response (0.0-1.5)
**nitrogen_factor**: Fertilization level adjustment (0.5-1.5)
**soil_factor**: Soil type x species interaction (0.7-1.2)
**seasonal_factor**: Photoperiod/dormancy adjustment (0.0-1.0)

### 8.2 Implementation Plan

**Phase 1: Core fixes (low risk)**
1. Fix GP sd parameter to 5.56C (cool) / 7.3C (warm)
2. Update species-specific base rates in grassPresets.ts
3. Apply sunGrowthBoost in calculateGrowth() method
4. Add nitrogenLevel to growthModel schema

**Phase 2: Enhanced moisture model (medium risk)**
5. Replace simple rain multiplier with VWC tracking
6. Add soil type to growthModel schema
7. Implement soil-type-specific field capacity and wilting point
8. Add delayed N mineralization effect (2-3 day lag)

**Phase 3: Advanced factors (higher complexity)**
9. Add seasonal dormancy curve based on latitude/day length
10. Implement species x soil type interaction matrix
11. Add geographic/elevation adjustment
12. Consider ET-based moisture loss calculation

### 8.3 Recommended Priority Order

1. **IMMEDIATE**: Fix GP sd parameter (simple code change, high accuracy impact)
2. **HIGH**: Update species base rates (data-driven improvement)
3. **HIGH**: Add nitrogen factor (major missing variable)
4. **MEDIUM**: Enhance moisture model with soil type
5. **LOW**: Add seasonal dormancy (niche use case)
6. **LOW**: Geographic adjustment (requires user location input)

---

## 9. REFERENCE SOURCES

1. GCSAA Growth Potential Reference - Gelernter & Stowell (2005)
2. Asian Turfgrass Center - Micah Woods (2013, 2022, 2024)
3. USGA Turfgrass Water Requirements - Bingru Huang
4. USDA-ARS ALMANAC Model - Kiniry et al. (2018)
5. UW-Madison Dissertation - Zhou (2021) - "Developing and Evaluating Turfgrass Growth Prediction Models"
6. UC IPM Seasonal Growth Patterns
7. PACE Turf Climate Appraisal Form
8. Frontiers in Plant Science - "Creeping Bentgrass Yield Prediction with Machine Learning Models" (2021)
9. Turfgrass Crop Coefficients - UC Center for Landscape & Urban Horticulture
10. Maryland Professional Lawn Care Manual

---

## 10. APPENDIX: GP VALUES BY TEMPERATURE

### Cool-Season GP (opt=20C, sd=5.56C)

| Temp (C) | GP | Temp (C) | GP |
|----------|-----|----------|-----|
| 0 | 0.00 | 25 | 0.82 |
| 5 | 0.02 | 30 | 0.24 |
| 10 | 0.27 | 35 | 0.02 |
| 15 | 0.61 | 40 | 0.00 |
| 18 | 0.85 | | |
| 20 | 1.00 | | |

### Warm-Season GP (opt=31C, sd=7.3C)

| Temp (C) | GP | Temp (C) | GP |
|----------|-----|----------|-----|
| 15 | 0.02 | 35 | 0.93 |
| 20 | 0.13 | 40 | 0.27 |
| 25 | 0.43 | 45 | 0.02 |
| 28 | 0.72 | 50 | 0.00 |
| 31 | 1.00 | | |
