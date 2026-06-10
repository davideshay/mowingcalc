import { useMowEvents, useGrowthHistory, useAlgorithmHistory, useConfig } from '../hooks/useApi';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toDisplayLength, lengthUnit } from '../utils/units';
import {
  Box,
  Stack,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
} from '@mui/material';

export function History() {
  const { data: events, loading: eventsLoading } = useMowEvents();
  const { data: growth, loading: growthLoading } = useGrowthHistory();
  const { data: algoHistory, loading: algoLoading } = useAlgorithmHistory();
  const { data: config } = useConfig();
  const units = config?.displayUnits || 'metric';
  const unit = lengthUnit(units);

  if (eventsLoading || growthLoading || algoLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 256 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Convert growth data for chart display
  const displayGrowth = growth?.map((g: any) => ({
    time: format(new Date(g.timestamp), 'MM/dd HH:mm'),
    growth: toDisplayLength(g.growth_mm, units),
  })) || [];

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">History</Typography>
        <Typography variant="body2" color="text.secondary">
          Mow events, growth tracking, and algorithm runs
        </Typography>
      </Box>

      {/* Growth chart */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" component="h2" sx={{ mb: 2 }}>
            Growth Over Time
          </Typography>
          {growth && growth.length > 0 ? (
            <Box sx={{ height: 256 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayGrowth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="growth" stroke="#16a34a" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Box sx={{ height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">No growth data recorded yet</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Mow events */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" component="h2" sx={{ mb: 2 }}>
            Mow Events
          </Typography>
          {events && events.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Started</TableCell>
                    <TableCell>Ended</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Growth ({unit})</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{format(new Date(e.started_at), 'MM/dd HH:mm')}</TableCell>
                      <TableCell>{e.ended_at ? format(new Date(e.ended_at), 'MM/dd HH:mm') : '-'}</TableCell>
                      <TableCell>{e.duration_minutes ? `${e.duration_minutes} min` : '-'}</TableCell>
                      <TableCell>{e.growth_at_trigger != null ? toDisplayLength(e.growth_at_trigger, units).toFixed(1) : '-'}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.decision_reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary">No mow events recorded yet.</Typography>
          )}
        </CardContent>
      </Card>

      {/* Algorithm runs */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" component="h2" sx={{ mb: 2 }}>
            Algorithm Run Log
          </Typography>
          {algoHistory && algoHistory.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Growth ({unit})</TableCell>
                    <TableCell>Rain Delay (h)</TableCell>
                    <TableCell>Decision</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {algoHistory.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.run_time), 'MM/dd HH:mm')}</TableCell>
                      <TableCell>{r.growth_estimate != null ? toDisplayLength(r.growth_estimate, units).toFixed(1) : '-'}</TableCell>
                      <TableCell>{r.rain_delay_hours !== null ? `${r.rain_delay_hours.toFixed(0)}h` : '-'}</TableCell>
                      <TableCell>
                        <Chip
                          color={r.decision === 'mow' ? 'success' : 'default'}
                          label={r.decision}
                          size="small"
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.decision_reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary">No algorithm runs recorded yet.</Typography>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
