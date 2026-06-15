import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box,
  Typography,
  Checkbox,
  Tooltip,
} from '@mui/material';
import { SensorAnalysis, OutlierFlag } from '../../types/api';

interface Props {
  sensors: SensorAnalysis[];
  unit: string;
  metric: string;
  selectedIds: string[];
  onToggleSelect: (entityId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

type SortField = 'mean' | 'min' | 'max' | 'validCount' | 'entity_id';
type SortDir = 'asc' | 'desc';

function severityChip(severity: string) {
  if (severity === 'critical') {
    return <Chip label="CRITICAL" size="small" color="error" sx={{ fontWeight: 600, fontSize: '0.625rem', height: 20 }} />;
  }
  if (severity === 'warning') {
    return <Chip label="WARNING" size="small" color="warning" sx={{ fontWeight: 600, fontSize: '0.625rem', height: 20 }} />;
  }
  return <Chip label="OK" size="small" color="success" variant="outlined" sx={{ fontWeight: 500, fontSize: '0.625rem', height: 20 }} />;
}

function highestSeverity(flags: OutlierFlag[]): string {
  if (flags.some((f) => f.severity === 'critical')) return 'critical';
  if (flags.some((f) => f.severity === 'warning')) return 'warning';
  return 'ok';
}

function formatValue(val: number | null, unit: string): string {
  if (val === null) return '-';
  return `${val.toFixed(2)} ${unit}`;
}

export function SensorHealthTable({
  sensors,
  unit,
  metric,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
}: Props) {
  const [sortField, setSortField] = useState<SortField>('entity_id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = [...sensors].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'entity_id':
        cmp = a.entity_id.localeCompare(b.entity_id);
        break;
      case 'mean':
        cmp = (a.stats.mean ?? -Infinity) - (b.stats.mean ?? -Infinity);
        break;
      case 'min':
        cmp = (a.stats.min ?? -Infinity) - (b.stats.min ?? -Infinity);
        break;
      case 'max':
        cmp = (a.stats.max ?? -Infinity) - (b.stats.max ?? -Infinity);
        break;
      case 'validCount':
        cmp = a.stats.validCount - b.stats.validCount;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const allSelected = sensors.length > 0 && selectedIds.length === sensors.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const shortId = (id: string) => {
    const parts = id.split('.');
    if (parts.length >= 2) {
      const name = parts[parts.length - 1];
      return name.length > 18 ? name.slice(0, 16) + '...' : name;
    }
    return id.length > 20 ? id.slice(0, 18) + '...' : id;
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <Box
      component="span"
      sx={{
        ml: 0.5,
        fontSize: '0.625rem',
        opacity: sortField === field ? 1 : 0.4,
      }}
    >
      {sortField === field ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25CF'}
    </Box>
  );

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" sx={{ width: 48 }}>
              <Tooltip title={allSelected ? 'Deselect all' : 'Select all'}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => {
                    if (allSelected) onDeselectAll();
                    else onSelectAll();
                  }}
                  size="small"
                  sx={{ padding: '4px' }}
                />
              </Tooltip>
            </TableCell>
            <TableCell>
              <Box
                component="span"
                sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                onClick={() => handleSort('entity_id')}
              >
                Sensor
                <SortIcon field="entity_id" />
              </Box>
            </TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">
              <Tooltip title={metric === 'rainfall' ? 'Total accumulated rain over the analysis period' : 'Average reading across all data points'}>
                <Box
                  component="span"
                  sx={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', borderBottom: '1px dotted', borderColor: 'text.disabled' }}
                >
                  {metric === 'rainfall' ? 'Total' : 'Mean'}
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip title="Smallest non-zero reading detected">
                <Box
                  component="span"
                  sx={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', borderBottom: '1px dotted', borderColor: 'text.disabled' }}
                >
                  Min
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip title="Largest single reading detected">
                <Box
                  component="span"
                  sx={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', borderBottom: '1px dotted', borderColor: 'text.disabled' }}
                >
                  Max
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip title="Non-zero readings / total readings (5-min intervals)">
                <Box
                  component="span"
                  sx={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', borderBottom: '1px dotted', borderColor: 'text.disabled' }}
                >
                  Readings
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>Flags</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((sensor) => {
            const severity = highestSeverity(sensor.flags);
            const isSelected = selectedIds.includes(sensor.entity_id);
            const hasCritical = severity === 'critical';
            return (
              <TableRow
                key={sensor.entity_id}
                sx={{
                  bgcolor: hasCritical ? 'action.hover' : 'inherit',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggleSelect(sensor.entity_id)}
                    size="small"
                    sx={{ padding: '4px' }}
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title={sensor.entity_id}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        fontWeight: hasCritical ? 600 : 400,
                      }}
                    >
                      {shortId(sensor.entity_id)}
                    </Typography>
                  </Tooltip>
                  {sensor.friendly_name && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {sensor.friendly_name}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{severityChip(severity)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                  {metric === 'rainfall'
                    ? formatValue(sensor.stats.total, unit)
                    : formatValue(sensor.stats.mean, unit)}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                  {formatValue(sensor.stats.min, unit)}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                  {formatValue(sensor.stats.max, unit)}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
                    {sensor.stats.validCount}/{sensor.stats.count}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {sensor.flags.length === 0 && (
                      <Typography variant="caption" color="text.disabled">
                        -
                      </Typography>
                    )}
                    {sensor.flags.map((flag, idx) => (
                      <Tooltip key={idx} title={flag.message}>
                        <Chip
                          label={flag.type.replace('_', ' ')}
                          size="small"
                          color={flag.severity === 'critical' ? 'error' : 'warning'}
                          variant="outlined"
                          sx={{
                            fontSize: '0.625rem',
                            height: 18,
                            fontWeight: flag.severity === 'critical' ? 600 : 400,
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
