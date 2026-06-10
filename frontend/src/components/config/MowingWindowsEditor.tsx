import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface MowingWindows {
  [key: string]: Array<{ start: string; end: string }>;
}

interface Props {
  windows: MowingWindows;
  onChange: (windows: MowingWindows) => void;
}

export function MowingWindowsEditor({ windows, onChange }: Props) {
  const [activeDay, setActiveDay] = useState('monday');

  const addWindow = (day: string) => {
    const current = windows[day] || [];
    onChange({
      ...windows,
      [day]: [...current, { start: '08:00', end: '18:00' }],
    });
  };

  const removeWindow = (day: string, index: number) => {
    const current = windows[day] || [];
    onChange({
      ...windows,
      [day]: current.filter((_, i) => i !== index),
    });
  };

  const updateWindow = (day: string, index: number, field: 'start' | 'end', value: string) => {
    const current = windows[day] || [];
    const updated = current.map((w, i) => i === index ? { ...w, [field]: value } : w);
    onChange({
      ...windows,
      [day]: updated,
    });
  };

  return (
    <Stack spacing={2}>
      <Tabs
        value={activeDay}
        onChange={(_, day) => setActiveDay(day)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {DAYS.map(day => (
          <Tab key={day} label={day.slice(0, 3)} value={day} />
        ))}
      </Tabs>

      <Stack spacing={1}>
        {(windows[activeDay] || []).map((window, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              type="time"
              size="small"
              label="Start"
              value={window.start}
              onChange={(e) => updateWindow(activeDay, index, 'start', e.target.value)}
              sx={{ minWidth: 140 }}
            />
            <Box sx={{ color: 'text.secondary' }}>to</Box>
            <TextField
              type="time"
              size="small"
              label="End"
              value={window.end}
              onChange={(e) => updateWindow(activeDay, index, 'end', e.target.value)}
              sx={{ minWidth: 140 }}
            />
            <IconButton
              size="small"
              onClick={() => removeWindow(activeDay, index)}
              color="error"
            >
              <DeleteOutlinedIcon />
            </IconButton>
          </Box>
        ))}

        <IconButton
          onClick={() => addWindow(activeDay)}
          sx={{ alignSelf: 'flex-start' }}
        >
          <AddOutlinedIcon />
        </IconButton>
      </Stack>
    </Stack>
  );
}
