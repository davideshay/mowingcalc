import { useAlgorithmState, useConfig } from '../hooks/useApi';
import { format } from 'date-fns';
import { WeatherSummary } from '../components/weather/WeatherSummary';

export function AlgorithmDetails() {
  const { data: algo, loading: algoLoading } = useAlgorithmState();
  const { data: config, loading: configLoading } = useConfig();

  if (algoLoading || configLoading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  const growthModel = config?.growthModel || {};
  const rainModel = config?.rainDelayModel || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Algorithm Details</h1>
        <p className="text-gray-600 mt-1">Growth model breakdown and current calculations</p>
      </div>

      {/* Growth Model */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Growth Model</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Current State</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Growth since mow:</dt><dd className="font-medium">{algo?.growth_mm?.toFixed(1)} mm</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Daily rate:</dt><dd className="font-medium">{algo?.daily_growth_mm?.toFixed(2)} mm/day</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Hours since mow:</dt><dd className="font-medium">{algo?.hours_since_mow?.toFixed(0)}h</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Model Parameters</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Base rate:</dt><dd className="font-medium">{growthModel.baseRatePerDay} mm/day</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Temp range:</dt><dd className="font-medium">{growthModel.tempOptimalMin}-{growthModel.tempOptimalMax}C</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Rain multiplier:</dt><dd className="font-medium">{growthModel.rainMultiplier}x</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Sun boost:</dt><dd className="font-medium">+{growthModel.sunGrowthBoost}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      {/* Rain Delay Model */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Rain Delay Model</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Current State</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Safe to mow:</dt><dd className={`font-medium ${algo?.is_safe_to_mow ? 'text-green-600' : 'text-yellow-600'}`}>{algo?.is_safe_to_mow ? 'Yes' : 'No'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Rain delay:</dt><dd className="font-medium">{algo?.rain_delay_hours?.toFixed(0)}h remaining</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Model Parameters</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Min delay:</dt><dd className="font-medium">{rainModel.minDelayAfterRain}h</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Heavy rain delay:</dt><dd className="font-medium">{rainModel.heavyRainDelay}h</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Sun drying:</dt><dd className="font-medium">{rainModel.sunDryingRate}/h</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Temp factor:</dt><dd className="font-medium">{rainModel.tempDryingFactor}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Soil type:</dt><dd className="font-medium capitalize">{rainModel.soilType}</dd></div>
            </dl>
          </div>
        </div>
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

      {/* Weather Summary */}
      <WeatherSummary />
    </div>
  );
}
