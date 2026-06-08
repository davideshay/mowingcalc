import { useAlgorithmState, useMowerStatus, useMowerControl, useConfig } from '../hooks/useApi';
import { format, formatDistanceToNow } from 'date-fns';

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

export function Dashboard() {
  const { data: algo, loading: algoLoading } = useAlgorithmState();
  const { data: mower } = useMowerStatus();
  const { startMow, triggering } = useMowerControl();
  const { data: config } = useConfig();
  const isReadonly = config?.readonlyMode === true;

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

      {/* Read-only mode banner */}
      {isReadonly && (
        <div className="card bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <h3 className="font-semibold text-amber-900">Read-Only Mode Enabled</h3>
              <p className="text-sm text-amber-800 mt-1">
                The mower is connected in read-only mode. All mower actions (start, stop, pause) are blocked.
                The algorithm will still run and recommend mowing, but no actions will be taken.
                Disable this in Configuration to enable automatic mower control.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main decision card */}
      <div className={`card ${algo?.should_mow ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-300'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {algo?.should_mow ? '🌱 Mow Now Recommended' : '⏰ Wait - No Mow Needed'}
            </h2>
            <p className="text-gray-600 mt-2">{algo?.reason}</p>
          </div>
          {!isReadonly && algo?.should_mow && (
            <button
              onClick={startMow}
              disabled={triggering}
              className="btn-primary disabled:opacity-50"
            >
              {triggering ? 'Starting...' : 'Start Mower'}
            </button>
          )}
          {isReadonly && algo?.should_mow && (
            <span className="text-sm font-medium text-amber-600 bg-amber-100 px-3 py-2 rounded-lg">
              Action blocked (read-only)
            </span>
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
            {algo?.is_safe_to_mow
              ? 'Soil moisture OK'
              : algo?.rain_delay_details?.last_significant_rain
                ? `Rain ${hoursAgo(algo.rain_delay_details.last_significant_rain)} (${algo.rain_delay_details.last_rain_mm}mm)`
                : 'Wait for drying'}
          </div>
          {!algo?.is_safe_to_mow && algo?.rain_delay_details?.last_significant_rain && (
            <div className="mt-1 text-xs text-amber-600">
              Safe at {format(new Date(Date.now() + (algo.rain_delay_hours || 0) * 3600000), 'h:mm a')}
            </div>
          )}
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
