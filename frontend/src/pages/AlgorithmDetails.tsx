import React from 'react';
import { useAlgorithmState, useConfig, useForecast, useWeatherHistory } from '../hooks/useApi';
import { format } from 'date-fns';
import { WeatherSummary } from '../components/weather/WeatherSummary';
import { WeatherGrid } from '../components/weather/WeatherGrid';
import { formatLength, formatTemp, toDisplayLength } from '../utils/units';

function conditionIcon(condition: string, isDaytime?: boolean) {
  const map: Record<string, string> = {
    sunny: isDaytime === false ? '\uD83C\uDF19' : '\u2600\uFE0F',
    clear: isDaytime === false ? '\uD83C\uDF19' : '\u2600\uFE0F',
    cloudy: '\u2601\uFE0F',
    'partlycloudy': '\u26C5',
    'partly-cloudy': '\u26C5',
    'partly_cloudy': '\u26C5',
    rainy: '\uD83C\uDF27\uFE0F',
    drizzle: '\uD83C\uDF27\uFE0F',
    snowy: '\u2744\uFE0F',
    windy: '\uD83D\uDCA8',
    fog: '\uD83C\uDF2B\uFE0F',
    night: '\uD83C\uDF19',
    'clear-night': '\uD83C\uDF19',
    'sunny-night': '\uD83C\uDF19',
    'cloudy-night': '\u2601\uFE0F',
    'partlycloudy-night': '\u26C5',
  };
  return map[condition.toLowerCase()] || (isDaytime === false ? '\uD83C\uDF19' : '\uD83C\uDF24\uFE0F');
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'N/A';
  try {
    return format(new Date(ts), 'EEE MMM d, h:mm a');
  } catch {
    return ts;
  }
}

function hoursAgo(ts: string | null): string {
  if (!ts) return 'N/A';
  try {
    const diff = (Date.now() - new Date(ts).getTime()) / 3600000;
    if (diff < 1) return `${Math.round(diff * 60)}m ago`;
    if (diff < 24) return `${diff.toFixed(1)}h ago`;
    return `${(diff / 24).toFixed(1)}d ago`;
  } catch {
    return 'N/A';
  }
}

function intensityColor(intensity: string): string {
  switch (intensity) {
    case 'none': return 'text-gray-500';
    case 'light': return 'text-blue-500';
    case 'moderate': return 'text-yellow-600';
    case 'heavy': return 'text-red-600';
    default: return 'text-gray-500';
  }
}

export function AlgorithmDetails() {
  const { data: algo, loading: algoLoading } = useAlgorithmState();
  const { data: config, loading: configLoading } = useConfig();
  const { data: forecast, loading: forecastLoading } = useForecast();
  const { data: weatherHistory, loading: weatherLoading } = useWeatherHistory();

  if (algoLoading || configLoading || forecastLoading || weatherLoading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  const growthModel = config?.growthModel || {};
  const rainModel = config?.rainDelayModel || {};
  const details = algo?.rain_delay_details;
  const units = config?.displayUnits || 'metric';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Algorithm Details</h1>
        <p className="text-gray-600 mt-1">Growth model breakdown and current calculations</p>
      </div>

      {/* Growth Model - FULL BREAKDOWN */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Growth Model</h2>

        {/* Growth estimate banner */}
        <div className={`p-4 rounded-lg mb-4 ${algo?.should_mow ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-600">Estimated growth since last mow</span>
              <div className="text-3xl font-bold mt-1 text-gray-900">
                {formatLength(algo?.growth_mm ?? 0, units)}
              </div>
              <span className="text-xs text-gray-500">
                daily rate: {toDisplayLength(algo?.daily_growth_mm ?? 0, units).toFixed(2)} {units === 'imperial' ? 'in' : 'mm'}/day
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Hours since mow</div>
              <div className="text-2xl font-bold text-gray-800">{algo?.hours_since_mow?.toFixed(0)}h</div>
              <div className="text-xs text-gray-500 mt-1">
                Last: {algo?.last_mow_time ? new Date(algo.last_mow_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A'}
              </div>
            </div>
          </div>

          {/* Growth progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Lower limit: {formatLength(config?.growthLowerLimit ?? 0, units)}</span>
              <span>Upper limit: {formatLength(config?.growthUpperLimit ?? 0, units)}</span>
            </div>
            <div className="relative w-full bg-gray-200 rounded-full h-3">
              {/* Lower threshold marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10"
                style={{ left: `${Math.min(100, (config?.growthLowerLimit ?? 3) / (config?.growthUpperLimit ?? 6) * 100)}%` }}
                title={`Lower limit: ${formatLength(config?.growthLowerLimit ?? 0, units)}`}
              />
              {/* Upper threshold marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                style={{ left: '100%' }}
                title={`Upper limit: ${formatLength(config?.growthUpperLimit ?? 0, units)}`}
              />
              {/* Current growth fill */}
              <div
                className={`h-3 rounded-full ${algo?.growth_mm != null && algo.growth_mm >= (config?.growthUpperLimit ?? 6) ? 'bg-red-500' : algo?.growth_mm != null && algo.growth_mm >= (config?.growthLowerLimit ?? 3) ? 'bg-blue-500' : 'bg-gray-400'}`}
                style={{ width: `${Math.min(100, (algo?.growth_mm ?? 0) / (config?.growthUpperLimit ?? 6) * 100)}%` }}
              />
            </div>
            <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 inline-block rounded-full"></span>Lower: {formatLength(config?.growthLowerLimit ?? 0, units)}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 inline-block rounded-full"></span>Upper: {formatLength(config?.growthUpperLimit ?? 0, units)}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-400 inline-block rounded-full"></span>Current: {formatLength(algo?.growth_mm ?? 0, units)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Calculation Breakdown */}
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Calculation Breakdown</h3>
            <dl className="space-y-2 text-sm">
              {/* Temperature stats */}
              <div className="flex justify-between">
                <dt className="text-gray-500">Avg temperature:</dt>
                <dd className="font-medium">{formatTemp(algo?.avg_temperature_c ?? 0, units)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Min temperature:</dt>
                <dd className="font-medium">{formatTemp(algo?.min_temperature_c ?? 0, units)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Max temperature:</dt>
                <dd className="font-medium">{formatTemp(algo?.max_temperature_c ?? 0, units)}</dd>
              </div>
              <div className="border-t pt-2 mt-2">
                <h4 className="text-xs font-medium text-gray-600 mb-1">Growth Factors (each 0-1.5)</h4>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GP factor (temp):</dt>
                  <dd className="font-medium">{(algo?.gp_factor ?? 0).toFixed(3)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Moisture factor:</dt>
                  <dd className="font-medium">{(algo?.moisture_factor ?? 0).toFixed(3)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Sun factor:</dt>
                  <dd className="font-medium">{(algo?.sun_factor ?? 0).toFixed(3)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Soil factor:</dt>
                  <dd className="font-medium">{(algo?.soil_factor ?? 0).toFixed(3)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Seasonal factor:</dt>
                  <dd className="font-medium">{(algo?.seasonal_factor ?? 0).toFixed(3)}</dd>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Combined: {((algo?.gp_factor ?? 0) * (algo?.moisture_factor ?? 0) * (algo?.sun_factor ?? 0) * (algo?.soil_factor ?? 0) * (algo?.seasonal_factor ?? 0)).toFixed(3)} → scaled daily rate
                </p>
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Hours processed:</dt>
                  <dd className="font-medium">{algo?.total_hours_processed ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GP optimal temp:</dt>
                  <dd className="font-medium">{formatTemp(algo?.gp_optimal_temp ?? 20, units)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GP standard deviation:</dt>
                  <dd className="font-medium">{algo?.gp_sd?.toFixed(1)}°C</dd>
                </div>
              </div>
            </dl>
          </div>

          {/* Model Parameters */}
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Model Parameters</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Base rate:</dt>
                <dd className="font-medium">{toDisplayLength(algo?.base_rate_daily ?? 0, units).toFixed(2)} {units === 'imperial' ? 'in' : 'mm'}/day</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Optimal temp range:</dt>
                <dd className="font-medium">{formatTemp(growthModel.tempOptimalMin, units)}-{formatTemp(growthModel.tempOptimalMax, units)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Rain multiplier:</dt>
                <dd className="font-medium">{growthModel.rainMultiplier}x</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sun growth boost:</dt>
                <dd className="font-medium">+{(growthModel.sunGrowthBoost ?? 0).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Soil type:</dt>
                <dd className="font-medium capitalize">{growthModel.soilType || 'loam'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Latitude:</dt>
                <dd className="font-medium">{growthModel.latitude || 40}°</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Grass type:</dt>
                <dd className="font-medium capitalize">{config?.grassType || 'tall_fescue'}</dd>
              </div>

              {/* How the formula works */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="text-xs font-medium text-gray-600 mb-2">Formula (GCSAA Growth Potential + Environmental Factors)</h4>
                <p className="text-xs text-gray-500 font-mono">
                  daily_growth = baseRate × GP × moisture × sun × soil × seasonal
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  GP = exp(-0.5 × ((T - T<sub>opt</sub>) / σ)²)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  T<sub>opt</sub> = {growthModel.tempOptimalMin}-{growthModel.tempOptimalMax}°C, σ = {algo?.gp_sd ?? 5.56}°C
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  moisture = f(VWC, soil_type) — VWC from SoilMoistureTracker
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  sun = 1 + sunshine_fraction × {growthModel.sunGrowthBoost}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  soil = {growthModel.soilType === 'sand' ? 0.85 : growthModel.soilType === 'clay' ? 0.90 : 1.00} ({growthModel.soilType})
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  seasonal = photoperiod curve (lat {growthModel.latitude}°)
                </p>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Rain Delay Model - FULL BREAKDOWN */}
       <div className="card">
         <h2 className="text-lg font-semibold mb-4">Rain Delay Model</h2>

         {/* Safe to mow banner */}
         <div className={`p-4 rounded-lg mb-4 ${algo?.is_safe_to_mow ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
           <div className="flex items-center justify-between">
             <div>
               <span className="text-sm font-medium text-gray-600">Safe to mow?</span>
               <div className={`text-2xl font-bold mt-1 ${algo?.is_safe_to_mow ? 'text-green-700' : 'text-amber-700'}`}>
                 {algo?.is_safe_to_mow ? 'Yes' : 'No'}
               </div>
             </div>
             <div className="text-right">
               {!algo?.is_safe_to_mow && (
                 <>
                   <div className="text-sm text-gray-600">Earliest safe in</div>
                   <div className="text-2xl font-bold text-amber-700">{algo?.rain_delay_hours?.toFixed(0)}h</div>
                   <div className="text-xs text-gray-500 mt-1">Optimal: {algo?.optimal_delay_hours?.toFixed(0)}h</div>
                 </>
               )}
               {algo?.is_safe_to_mow && details?.last_significant_rain && (
                  <>
                    <div className="text-sm text-gray-600">Safe since</div>
                    <div className="text-2xl font-bold text-green-700">Now</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Rain {hoursAgo(details.last_significant_rain)} ({formatTimestamp(details.last_significant_rain)})
                    </div>
                  </>
                )}
               {algo?.is_safe_to_mow && !details?.last_significant_rain && (
                 <div className="text-sm text-green-600">Soil moisture OK</div>
               )}
             </div>
           </div>

           {/* Soil moisture bar with safe/optimal/FC markers */}
           <div className="mt-3">
             <div className="flex justify-between text-xs text-gray-500 mb-1">
               <span>Current: {algo?.estimated_soil_moisture_pct?.toFixed(0)}%</span>
               <span>Field capacity: {algo?.field_capacity_pct}%</span>
             </div>
             <div className="relative w-full bg-gray-200 rounded-full h-3">
               {/* Safe threshold marker (for robot mowers, above FC) */}
               {details?.safe_moisture_threshold != null && details.safe_moisture_threshold > 0 && (
                 <div
                   className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-10"
                   style={{ left: `${Math.min(100, details.safe_moisture_threshold)}%` }}
                   title={`Safe threshold: ${details.safe_moisture_threshold.toFixed(0)}%`}
                 />
               )}
               {/* Optimal threshold marker */}
               {details?.optimal_moisture_threshold != null && details.optimal_moisture_threshold > 0 && (
                 <div
                   className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10"
                   style={{ left: `${Math.min(100, details.optimal_moisture_threshold)}%` }}
                   title={`Optimal threshold: ${details.optimal_moisture_threshold.toFixed(0)}%`}
                 />
               )}
               {/* Current moisture fill */}
               <div
                 className={`h-3 rounded-full ${algo?.estimated_soil_moisture_pct && algo.estimated_soil_moisture_pct > (details?.safe_moisture_threshold ?? algo?.field_capacity_pct ?? 0) ? 'bg-red-500' : 'bg-green-500'}`}
                 style={{ width: `${Math.min(100, (algo?.estimated_soil_moisture_pct || 0))}%` }}
               />
             </div>
             {/* Threshold legend */}
             <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
               <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 inline-block rounded-full"></span>Optimal: {details?.optimal_moisture_threshold?.toFixed(0)}%</span>
               <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 inline-block rounded-full"></span>Safe: {details?.safe_moisture_threshold?.toFixed(0)}%</span>
               <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-400 inline-block rounded-full"></span>FC: {algo?.field_capacity_pct}%</span>
             </div>
           </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Calculation breakdown */}
           <div>
             <h3 className="font-medium text-gray-700 mb-2">Calculation Breakdown</h3>
             <dl className="space-y-2 text-sm">
               <div className="flex justify-between">
                 <dt className="text-gray-500">Last rain:</dt>
                 <dd className="font-medium text-right">
                   {details?.last_significant_rain
                     ? `${hoursAgo(details.last_significant_rain)} (${formatTimestamp(details.last_significant_rain)})`
                     : 'None detected'}
                 </dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Rainfall amount:</dt>
                 <dd className="font-medium">{formatLength(details?.last_rain_mm ?? 0, units)}</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Rain intensity:</dt>
                 <dd className={`font-medium capitalize ${intensityColor(details?.rain_intensity || 'none')}`}>
                   {details?.rain_intensity || 'none'}
                 </dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Hours since rain:</dt>
                 <dd className="font-medium">{details?.hours_since_rain?.toFixed(1)}h</dd>
               </div>
               <div className="border-t pt-2 mt-2">
                 <h4 className="text-xs font-medium text-gray-600 mb-1">Model Output</h4>
                 <div className="flex justify-between">
                   <dt className="text-gray-500">Time to safe (model):</dt>
                   <dd className="font-medium">{details?.time_to_safe_hours?.toFixed(1)}h</dd>
                 </div>
                 <div className="flex justify-between">
                   <dt className="text-gray-500">Time to optimal (model):</dt>
                   <dd className="font-medium">{details?.time_to_optimal_hours?.toFixed(1)}h</dd>
                 </div>
                 <div className="flex justify-between">
                   <dt className="text-gray-500">Min delay floor:</dt>
                   <dd className="font-medium">{details?.min_delay_floor_hours}h</dd>
                 </div>
                 <div className="flex justify-between">
                   <dt className="text-gray-500">Max delay ceiling:</dt>
                   <dd className="font-medium">{details?.max_delay_ceil_hours}h</dd>
                 </div>
                 <div className="flex justify-between">
                    <dt className="text-gray-500">Current moisture (estimated):</dt>
                    <dd className="font-medium">{algo?.estimated_soil_moisture_pct?.toFixed(1)}%</dd>
                  </div>
               </div>
               <div className="border-t pt-2 mt-2">
                 <div className="flex justify-between items-start">
                   <dt className="text-gray-500">Drying time constant (tau)</dt>
                   <dd className="font-medium">{details?.drying_time_constant}h</dd>
                 </div>
                 <p className="text-xs text-gray-400 mt-0.5">Base soil drying rate (sand:24h, loam:72h, clay:168h)</p>
                 <div className="flex justify-between items-start mt-1">
                   <dt className="text-gray-500">Effective tau</dt>
                   <dd className="font-medium">{details?.effective_tau?.toFixed(1)}h</dd>
                 </div>
                 <p className="text-xs text-gray-400 mt-0.5">Actual drying rate = base tau adjusted by sun &amp; temperature modifiers. When both modifiers are 0 (no sun/warmth since last rain), effective tau equals base tau. Lower values mean faster drying.</p>
                 <div className="flex justify-between">
                   <dt className="text-gray-500">Sun drying effect:</dt>
                   <dd className="font-medium">{(details?.sun_drying_modifier ?? 0).toFixed(3)}</dd>
                 </div>
                 <div className="flex justify-between">
                   <dt className="text-gray-500">Temp drying effect:</dt>
                   <dd className="font-medium">{(details?.temp_drying_modifier ?? 0).toFixed(3)}</dd>
                 </div>
               </div>
             </dl>
           </div>

           {/* Model Parameters */}
           <div>
             <h3 className="font-medium text-gray-700 mb-2">Model Parameters</h3>
             <dl className="space-y-2 text-sm">
               <div className="flex justify-between">
                 <dt className="text-gray-500">Mower weight:</dt>
                 <dd className="font-medium">{rainModel.mowerWeightLbs ?? 65} lbs</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Soil type:</dt>
                 <dd className="font-medium capitalize">{rainModel.soilType}</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Compaction threshold:</dt>
                 <dd className="font-medium">{((details?.compaction_threshold ?? 1.05) * 100).toFixed(0)}% of FC</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Surface dry factor:</dt>
                 <dd className="font-medium">{((details?.surface_dry_factor ?? 0.3) * 100).toFixed(0)}%</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Safe threshold:</dt>
                 <dd className="font-medium">{details?.safe_moisture_threshold?.toFixed(0)}%</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Optimal threshold:</dt>
                 <dd className="font-medium">{details?.optimal_moisture_threshold?.toFixed(0)}%</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Min delay (floor):</dt>
                 <dd className="font-medium">{rainModel.minDelayAfterRain}h</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Max delay (ceiling):</dt>
                 <dd className="font-medium">{rainModel.heavyRainDelay}h</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Sun drying:</dt>
                 <dd className="font-medium">{rainModel.sunDryingRate}/h</dd>
               </div>
               <div className="flex justify-between">
                 <dt className="text-gray-500">Temp factor:</dt>
                 <dd className="font-medium">{rainModel.tempDryingFactor}</dd>
               </div>

               {/* How the formula works */}
               <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                 <h4 className="text-xs font-medium text-gray-600 mb-2">Formula (Exponential Decay + Robot Mower Model)</h4>
                 <p className="text-xs text-gray-500 font-mono">
                   SWC(t) = &theta;_res + (SWC<sub>0</sub> - &theta;_res) &times; e<sup>-t/&tau;</sup>
                 </p>
                 <p className="text-xs text-gray-500 mt-1">
                   t_safe = -&tau; &times; ln((C&times;FC - &theta;_res) / (SWC<sub>0</sub> - &theta;_res))
                 </p>
                 <p className="text-xs text-gray-500 mt-1">
                   C = compaction threshold (1.05 for robot, 1.0 for conventional)
                 </p>
                 <p className="text-xs text-gray-500 mt-1">
                   t_optimal = -&tau; &times; ln(((1-SD)&times;FC - &theta;_res) / (SWC<sub>0</sub> - &theta;_res))
                 </p>
                 <p className="text-xs text-gray-500 mt-1">
                   SD = surface dry factor (0.3 default = 30% extra drying for cut quality)
                 </p>
                 <p className="text-xs text-gray-500 mt-1">
                   effective &tau; = &tau; &times; max(0.5, 1 - (sun + temp) &times; 0.2)
                 </p>
               </div>

               {/* Expected safe time */}
               {!algo?.is_safe_to_mow && algo?.safe_to_mow_time && (
                 <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                   <h4 className="text-xs font-medium text-amber-800 mb-1">Earliest safe to mow</h4>
                   <p className="text-sm font-bold text-amber-900">
                     {format(new Date(algo.safe_to_mow_time), 'EEE MMM d, h:mm a')}
                   </p>
                   <p className="text-xs text-amber-700 mt-1">
                     (Optimal: {format(new Date(new Date(algo.safe_to_mow_time).getTime() + (algo?.optimal_delay_hours - algo?.rain_delay_hours || 0) * 3600000), 'EEE MMM d, h:mm a')})
                   </p>
                 </div>
               )}
             </dl>
           </div>
         </div>
       </div>

      {/* Weather History - compact grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Weather History (5 days)</h2>
          {weatherHistory && (
            <div className="text-xs text-gray-500 font-mono">
              {formatLength(weatherHistory.total_rainfall_mm ?? 0, units)} rain &middot; {formatTemp(weatherHistory.avg_temperature_c ?? 0, units)} avg &middot; {weatherHistory.total_sunshine_hours?.toFixed(0)}h sun
            </div>
          )}
        </div>
        <WeatherGrid
          hourly={weatherHistory?.hourly || []}
          units={units}
        />
      </div>

      {/* Decision Info */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Decision Summary</h2>
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-500">Decision:</span>
            <p className="font-medium mt-1">{algo?.reason}</p>
          </div>
          {algo?.next_review && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-500">Next review:</span>
              <p className="font-medium mt-1">{format(new Date(algo.next_review), 'EEEE, MMMM d, yyyy h:mm a')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Hourly Forecast - compact grid, 4 rows x 12 cols = 48 hours */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Hourly Forecast (next 48h)</h2>
        {forecast?.hourly && forecast.hourly.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                {[0, 12, 24, 36].map((offset) => {
                  const chunk = forecast.hourly.slice(offset, offset + 12);
                  if (chunk.length === 0) return null;
                  const startDate = new Date(chunk[0].datetime);
                  const startDateLabel = format(startDate, 'EEE MMM d');
                  return (
                    <React.Fragment key={offset}>
                      {/* Time header row */}
                      <tr className="border-b border-gray-100">
                        <td className="py-0.5 px-1 text-[10px] font-medium text-gray-400" style={{ minWidth: '72px', width: '72px' }}>
                          {offset === 0 ? 'Today' : offset === 36 ? 'Day 3' : offset === 24 ? 'Day 2' : 'Day 1'} ({startDateLabel})
                        </td>
                        {chunk.map((hour, i) => {
                          const time = new Date(hour.datetime);
                          const hr = time.getHours();
                          const h = hr % 12 || 12;
                          const timeLabel = `${h}${hr >= 12 ? 'p' : 'a'}`;
                          return (
                            <td key={i} className="py-0.5 px-1 text-center text-[10px] font-medium text-gray-400" style={{ minWidth: '56px', width: '56px' }}>{timeLabel}</td>
                          );
                        })}
                      </tr>
                      {/* Data row */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="py-0.5 px-1 text-[10px] text-gray-400" style={{ minWidth: '72px', width: '72px' }}></td>
                        {chunk.map((hour, i) => {
                          const time = new Date(hour.datetime);
                          const precipHigh = hour.precipitation_probability > (config?.maxPrecipitationChance || 30);
                          const tip = `${time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} | Precip:${hour.precipitation_probability}% Temp:${Math.round(hour.temperature)}°F`;
                          return (
                            <td
                              key={i}
                              className={`py-1.5 px-1 text-center ${precipHigh ? 'bg-red-50 border-2 border-red-300' : ''}`}
                              style={{ minWidth: '56px', width: '56px' }}
                              title={tip}
                            >
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center text-base leading-none">
                                  <span>{precipHigh ? '\uD83C\uDF27\uFE0F' : conditionIcon(hour.condition, hour.is_daytime)}</span>
                                  {hour.precipitation_probability > 0 && !precipHigh && <span className="text-[10px]">💧</span>}
                                </div>
                                <span className={`text-sm font-mono font-semibold ${
                                  precipHigh ? 'text-red-600' : 'text-gray-800'
                                }`}>{Math.round(hour.temperature)}</span>
                                <span className={`text-[10px] font-medium ${precipHigh ? 'text-red-600' : 'text-gray-500'}`}>
                                  {hour.precipitation_probability}%
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center gap-4 mt-2 px-2">
              <span className="text-xs text-gray-400">Precipitation &gt;{config?.maxPrecipitationChance || 30}% highlighted in red</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No hourly forecast available</p>
        )}
      </div>

      {/* Daily Forecast */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Daily Forecast</h2>
        {forecast?.daily && forecast.daily.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-gray-500">Day</th>
                  <th className="text-center py-2 px-3 text-gray-500">Period</th>
                  <th className="text-center py-2 px-3 text-gray-500">Condition</th>
                  <th className="text-right py-2 px-3 text-gray-500">Temp (F)</th>
                  <th className="text-right py-2 px-3 text-gray-500">Precip %</th>
                </tr>
              </thead>
              <tbody>
                {forecast.daily.slice(0, 16).map((day, i) => {
                  const date = new Date(day.datetime);
                  const precipHigh = day.precipitation_probability > (config?.maxPrecipitationChance || 30);
                  const isDaytime = day.is_daytime;
                  // Override icon to rain cloud when precip exceeds threshold
                  const icon = precipHigh ? '\uD83C\uDF27\uFE0F' : conditionIcon(day.condition, isDaytime);
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${precipHigh ? 'bg-red-50' : ''}`}>
                      <td className="py-2 px-3 whitespace-nowrap">{format(date, 'EEE, MMM d')}</td>
                      <td className="py-2 px-3 text-center text-xs">
                        {isDaytime != null ? (isDaytime ? '☀️ Day' : '🌙 Night') : '-'}
                      </td>
                      <td className="py-2 px-3 text-center text-lg">{icon}</td>
                      <td className="py-2 px-3 text-right">
                        {Math.round(day.temperature)}°
                        {day.templow != null && <span className="text-gray-400"> / {Math.round(day.templow)}°</span>}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium ${precipHigh ? 'text-red-600' : ''}`}>
                        {day.precipitation_probability}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No daily forecast available</p>
        )}
      </div>

      {/* Weather Summary */}
      <WeatherSummary />
    </div>
  );
}
