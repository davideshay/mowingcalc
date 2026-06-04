import { useAlgorithmState, useMowerStatus, useMowerControl } from '../hooks/useApi';
import { format, formatDistanceToNow } from 'date-fns';

export function Dashboard() {
  const { data: algo, loading: algoLoading } = useAlgorithmState();
  const { data: mower } = useMowerStatus();
  const { startMow, triggering } = useMowerControl();

  if (algoLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Current algorithm decision and system status</p>
      </div>

      {/* Main decision card */}
      <div className={`card ${algo?.should_mow ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-300'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {algo?.should_mow ? '🌱 Mow Now Recommended' : '⏰ Wait - No Mow Needed'}
            </h2>
            <p className="text-gray-600 mt-2">{algo?.reason}</p>
          </div>
          {algo?.should_mow && (
            <button
              onClick={startMow}
              disabled={triggering}
              className="btn-primary disabled:opacity-50"
            >
              {triggering ? 'Starting...' : 'Start Mower'}
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Growth estimate */}
        <div className="card">
          <div className="text-sm font-medium text-gray-500 mb-2">Growth Since Last Mow</div>
          <div className="text-3xl font-bold text-gray-900">
            {algo?.growth_mm?.toFixed(1)}<span className="text-lg text-gray-500 ml-1">mm</span>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            Daily rate: {algo?.daily_growth_mm?.toFixed(2)} mm/day
          </div>
        </div>

        {/* Rain delay */}
        <div className="card">
          <div className="text-sm font-medium text-gray-500 mb-2">Rain Delay</div>
          <div className="text-3xl font-bold text-gray-900">
            {algo?.is_safe_to_mow ? (
              <span className="text-green-600">Safe</span>
            ) : (
              <>
                {algo?.rain_delay_hours?.toFixed(0)}<span className="text-lg text-gray-500 ml-1">hours</span>
              </>
            )}
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {algo?.is_safe_to_mow ? 'Soil moisture OK' : 'Wait for drying'}
          </div>
        </div>

        {/* Hours since mow */}
        <div className="card">
          <div className="text-sm font-medium text-gray-500 mb-2">Hours Since Last Mow</div>
          <div className="text-3xl font-bold text-gray-900">
            {algo?.hours_since_mow?.toFixed(0)}<span className="text-lg text-gray-500 ml-1">h</span>
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {algo?.last_mow_time ? (
              <>Last: {formatDistanceToNow(new Date(algo.last_mow_time), { addSuffix: true })}</>
            ) : (
              'No previous mow recorded'
            )}
          </div>
        </div>

        {/* Mower status */}
        <div className="card">
          <div className="text-sm font-medium text-gray-500 mb-2">Mower Status</div>
          <div className="text-3xl font-bold text-gray-900">
            {mower?.available ? (
              <span className={mower.state === 'mowing' ? 'text-green-600' : 'text-gray-900'}>
                {mower.state?.replace('_', ' ') || 'Unknown'}
              </span>
            ) : (
              <span className="text-yellow-600">Unavailable</span>
            )}
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {mower?.battery_pct !== undefined && `Battery: ${mower.battery_pct}%`}
          </div>
        </div>
      </div>

      {/* Next review */}
      {algo?.next_review && (
        <div className="card">
          <div className="text-sm font-medium text-gray-500 mb-2">Next Algorithm Review</div>
          <div className="text-lg text-gray-900">
            {format(new Date(algo.next_review), 'EEEE, MMMM d, yyyy h:mm a')}
          </div>
        </div>
      )}
    </div>
  );
}
