import { useMowEvents, useGrowthHistory, useAlgorithmHistory, useConfig } from '../hooks/useApi';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toDisplayLength, lengthUnit } from '../utils/units';

export function History() {
  const { data: events, loading: eventsLoading } = useMowEvents();
  const { data: growth, loading: growthLoading } = useGrowthHistory();
  const { data: algoHistory, loading: algoLoading } = useAlgorithmHistory();
  const { data: config } = useConfig();
  const units = config?.displayUnits || 'metric';
  const unit = lengthUnit(units);

  if (eventsLoading || growthLoading || algoLoading) {
    return <div className="flex justify-center items-center h-64">Loading history...</div>;
  }

  // Convert growth data for chart display
  const displayGrowth = growth?.map((g: any) => ({
    time: format(new Date(g.timestamp), 'MM/dd HH:mm'),
    growth: toDisplayLength(g.growth_mm, units),
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">History</h1>
        <p className="text-gray-600 mt-1">Mow events, growth tracking, and algorithm runs</p>
      </div>

      {/* Growth chart */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Growth Over Time</h2>
        {growth && growth.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="growth" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No growth data recorded yet
          </div>
        )}
      </div>

      {/* Mow events */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Mow Events</h2>
        {events && events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Started</th>
                  <th className="text-left py-2 px-4">Ended</th>
                  <th className="text-left py-2 px-4">Duration</th>
                  <th className="text-left py-2 px-4">Growth ({unit})</th>
                  <th className="text-left py-2 px-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e: any) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 px-4">{format(new Date(e.started_at), 'MM/dd HH:mm')}</td>
                    <td className="py-2 px-4">{e.ended_at ? format(new Date(e.ended_at), 'MM/dd HH:mm') : '-'}</td>
                    <td className="py-2 px-4">{e.duration_minutes ? `${e.duration_minutes} min` : '-'}</td>
                    <td className="py-2 px-4">{e.growth_at_trigger != null ? toDisplayLength(e.growth_at_trigger, units).toFixed(1) : '-'}</td>
                    <td className="py-2 px-4 max-w-xs truncate">{e.decision_reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No mow events recorded yet.</p>
        )}
      </div>

      {/* Algorithm runs */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Algorithm Run Log</h2>
        {algoHistory && algoHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Time</th>
                  <th className="text-left py-2 px-4">Growth ({unit})</th>
                  <th className="text-left py-2 px-4">Rain Delay (h)</th>
                  <th className="text-left py-2 px-4">Decision</th>
                  <th className="text-left py-2 px-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {algoHistory.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2 px-4">{format(new Date(r.run_time), 'MM/dd HH:mm')}</td>
                    <td className="py-2 px-4">{r.growth_estimate != null ? toDisplayLength(r.growth_estimate, units).toFixed(1) : '-'}</td>
                    <td className="py-2 px-4">{r.rain_delay_hours !== null ? `${r.rain_delay_hours.toFixed(0)}h` : '-'}</td>
                    <td className="py-2 px-4">
                      <span className={`badge ${r.decision === 'mow' ? 'badge-success' : 'badge-info'}`}>
                        {r.decision}
                      </span>
                    </td>
                    <td className="py-2 px-4 max-w-xs truncate">{r.decision_reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No algorithm runs recorded yet.</p>
        )}
      </div>
    </div>
  );
}
