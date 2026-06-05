import { useState } from 'react';

interface EntityGroups {
  rainfallSensors: string[];
  temperatureSensors: string[];
  sunshineSensors: string[];
  humiditySensors: string[];
  windSpeedSensors: string[];
  weatherForecastEntity: string;
  mowerType: 'switch' | 'lawn_mower' | 'custom';
  mowerEntity: string;
  mowerStateEntity: string;
  mowerBatteryEntity: string;
  lastMowTimeEntity: string;
  sunEntity: string;
}

interface Props {
  groups: EntityGroups;
  onChange: (groups: EntityGroups) => void;
}

export function EntityGroupsEditor({ groups, onChange }: Props) {
  const [newSensor, setNewSensor] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const addSensor = (group: string) => {
    if (!newSensor.trim()) return;
    const current = groups[group as keyof EntityGroups] as string[];
    onChange({
      ...groups,
      [group]: [...current, newSensor.trim()],
    });
    setNewSensor('');
  };

  const removeSensor = (group: string, index: number) => {
    const current = groups[group as keyof EntityGroups] as string[];
    onChange({
      ...groups,
      [group]: current.filter((_, i) => i !== index),
    });
  };

  const updateSingle = (key: string, value: string) => {
    onChange({
      ...groups,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Sensor groups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { key: 'rainfallSensors', label: 'Rainfall Sensors' },
          { key: 'temperatureSensors', label: 'Temperature Sensors' },
          { key: 'sunshineSensors', label: 'Sunshine Sensors' },
          { key: 'humiditySensors', label: 'Humidity Sensors' },
          { key: 'windSpeedSensors', label: 'Wind Speed Sensors' },
        ].map(({ key, label }) => (
          <div key={key} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-700">{label}</h4>
              <span className="badge badge-info">{(groups[key as keyof EntityGroups] as string[]).length}</span>
            </div>

            <div className="space-y-2 mb-3">
              {(groups[key as keyof EntityGroups] as string[]).map((sensor, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-600 truncate">{sensor}</span>
                  <button
                    type="button"
                    onClick={() => removeSensor(key, index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="e.g., sensor.rainfall"
                value={activeGroup === key ? newSensor : ''}
                onChange={(e) => {
                  setActiveGroup(key);
                  setNewSensor(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSensor(key);
                }}
              />
              <button
                type="button"
                onClick={() => addSensor(key)}
                className="btn-primary"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Single entity fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Weather Forecast Entity</label>
          <input
            type="text"
            className="input"
            value={groups.weatherForecastEntity}
            onChange={(e) => updateSingle('weatherForecastEntity', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mower Type</label>
          <select
            className="input"
            value={groups.mowerType}
            onChange={(e) => updateSingle('mowerType', e.target.value)}
          >
            <option value="switch">Switch</option>
            <option value="lawn_mower">Lawn Mower</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mower Entity</label>
          <input
            type="text"
            className="input"
            value={groups.mowerEntity}
            onChange={(e) => updateSingle('mowerEntity', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mower State Entity</label>
          <input
            type="text"
            className="input"
            value={groups.mowerStateEntity}
            onChange={(e) => updateSingle('mowerStateEntity', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mower Battery Entity</label>
          <input
            type="text"
            className="input"
            value={groups.mowerBatteryEntity}
            onChange={(e) => updateSingle('mowerBatteryEntity', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Mow Time Entity</label>
          <input
            type="text"
            className="input"
            value={groups.lastMowTimeEntity}
            onChange={(e) => updateSingle('lastMowTimeEntity', e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sun Entity</label>
          <input
            type="text"
            className="input"
            value={groups.sunEntity}
            onChange={(e) => updateSingle('sunEntity', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
