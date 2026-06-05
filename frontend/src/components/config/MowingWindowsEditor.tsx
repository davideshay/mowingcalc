import { useState } from 'react';

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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {DAYS.map(day => (
          <button
            key={day}
            type="button"
            onClick={() => setActiveDay(day)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeDay === day
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {day.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {(windows[activeDay] || []).map((window, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="time"
              className="input"
              value={window.start}
              onChange={(e) => updateWindow(activeDay, index, 'start', e.target.value)}
            />
            <span className="text-gray-500">to</span>
            <input
              type="time"
              className="input"
              value={window.end}
              onChange={(e) => updateWindow(activeDay, index, 'end', e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeWindow(activeDay, index)}
              className="btn-secondary p-2"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => addWindow(activeDay)}
          className="btn-secondary text-sm"
        >
          + Add Time Window
        </button>
      </div>
    </div>
  );
}
