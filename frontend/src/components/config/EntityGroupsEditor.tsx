import { useState } from 'react';

interface SunshineSource {
  entity_id: string;
  type: 'sunshine' | 'uv_index';
}

interface EntityGroups {
  rainfallSensors: string[];
  rainfallUnit: 'millimeters' | 'inches';
  temperatureSensors: string[];
  temperatureUnit: 'celsius' | 'fahrenheit';
  sunshineSources: SunshineSource[];
  weatherForecastEntity: string;
  hourlyForecastEntity: string;
  dailyForecastEntity: string;
  mowerType: 'switch' | 'lawn_mower' | 'custom';
  mowerEntity: string;
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

  // Sunshine sources: combined add with type selector
  const [sunshineType, setSunshineType] = useState<'sunshine' | 'uv_index'>('uv_index');
  const addSunshineSource = () => {
    if (!newSensor.trim()) return;
    onChange({
      ...groups,
      sunshineSources: [
        ...groups.sunshineSources,
        { entity_id: newSensor.trim(), type: sunshineType },
      ],
    });
    setNewSensor('');
  };

  const removeSunshineSource = (index: number) => {
    onChange({
      ...groups,
      sunshineSources: groups.sunshineSources.filter((_, i) => i !== index),
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

            <div className="flex gap-2 mb-2">
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

            {key === 'rainfallSensors' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sensor Unit</label>
                <select
                  className="input text-sm"
                  value={groups.rainfallUnit}
                  onChange={(e) => onChange({ ...groups, rainfallUnit: e.target.value as 'millimeters' | 'inches' })}
                >
                  <option value="millimeters">Millimeters (mm)</option>
                  <option value="inches">Inches (in)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  WeatherFlow AWS hourly_rain sensors report in inches. Set to "Inches" if your sensor uses imperial units.
                </p>
              </div>
            )}

            {key === 'temperatureSensors' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sensor Unit</label>
                <select
                  className="input text-sm"
                  value={groups.temperatureUnit}
                  onChange={(e) => onChange({ ...groups, temperatureUnit: e.target.value as 'celsius' | 'fahrenheit' })}
                >
                  <option value="celsius">Celsius (°C)</option>
                  <option value="fahrenheit">Fahrenheit (°F)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  WeatherFlow AWS sensors report in Fahrenheit by default.
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Sunshine Sources - combined UI */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-gray-700">Sunshine Sources</h4>
            <span className="badge badge-info">{groups.sunshineSources.length}</span>
          </div>

          <div className="space-y-2 mb-3">
            {groups.sunshineSources.map((source, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                  {source.type === 'uv_index' ? 'UV' : 'Sun'}
                </span>
                <span className="flex-1 text-sm text-gray-600 truncate">{source.entity_id}</span>
                <button
                  type="button"
                  onClick={() => removeSunshineSource(index)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-50 rounded-lg mb-3">
            <p className="text-xs text-blue-800">
              Add UV index sensors (e.g. from Ambient Weather). The app converts these to sunshine hours: UV &gt; 0.5 counts as 1 hour of sun.
            </p>
          </div>

          <div className="flex gap-2">
            <select
              className="input w-24"
              value={sunshineType}
              onChange={(e) => setSunshineType(e.target.value as 'sunshine' | 'uv_index')}
            >
              <option value="uv_index">UV Index</option>
              <option value="sunshine">Sunshine</option>
            </select>
            <input
              type="text"
              className="input flex-1"
              placeholder="e.g., sensor.uv_index"
              value={activeGroup === 'sunshineSources' ? newSensor : ''}
              onChange={(e) => {
                setActiveGroup('sunshineSources');
                setNewSensor(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSunshineSource();
              }}
            />
            <button
              type="button"
              onClick={() => addSunshineSource()}
              className="btn-primary"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Single entity fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mower Entity section */}
        <div className="md:col-span-2">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Mower Entity</h3>
          <div className="p-4 bg-blue-50 rounded-xl mb-4">
            <p className="text-sm text-blue-800">
              The Segway Navimow integration creates a <code>lawn_mower</code> entity in Home Assistant.
              Find it under Devices in HA - the entity ID will look like <code>lawn_mower.navimow</code> or
              <code>lawn_mower.your_mower_name</code>. The app reads state, battery, and last mowed time
              directly from this entity's attributes.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mower Type</label>
              <select
                className="input"
                value={groups.mowerType}
                onChange={(e) => updateSingle('mowerType', e.target.value)}
              >
                <option value="lawn_mower">Lawn Mower (Navimow)</option>
                <option value="switch">Switch</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mower Entity ID</label>
              <input
                type="text"
                className="input"
                value={groups.mowerEntity}
                onChange={(e) => updateSingle('mowerEntity', e.target.value)}
                placeholder="lawn_mower.navimow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Mow Time Entity <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                className="input"
                value={groups.lastMowTimeEntity}
                onChange={(e) => updateSingle('lastMowTimeEntity', e.target.value)}
                placeholder="sensor.last_mowed_template (create in HA if needed)"
              />
              <p className="text-xs text-gray-500 mt-1">
                The Navimow integration does not expose last mowed time. To enable this, create a template sensor in HA that tracks when your mower last mowed, or the app will estimate based on its own mow event history.
              </p>
            </div>
          </div>
        </div>

        {/* Weather section */}
        <div className="md:col-span-2 border-t border-gray-200 pt-4">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Weather Forecasts</h3>
          <div className="p-3 bg-amber-50 rounded-lg mb-4">
            <p className="text-xs text-amber-800">
              Use separate weather providers for hourly and daily forecasts. For example, use NWS for hourly (48h) and OpenWeatherMap for daily (8 days). Leave a field empty to use the default forecast entity below.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Forecast Entity</label>
              <input
                type="text"
                className="input"
                value={groups.weatherForecastEntity}
                onChange={(e) => updateSingle('weatherForecastEntity', e.target.value)}
                placeholder="weather.home"
              />
              <p className="text-xs text-gray-500 mt-1">
                Fallback entity if hourly/daily fields are empty.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Forecast Entity</label>
              <input
                type="text"
                className="input"
                value={groups.hourlyForecastEntity || ''}
                onChange={(e) => updateSingle('hourlyForecastEntity', e.target.value)}
                placeholder="weather.nws_hourly"
              />
              <p className="text-xs text-gray-500 mt-1">
                Entity for 48-hour hourly forecast. Leave empty to use default.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Daily Forecast Entity</label>
              <input
                type="text"
                className="input"
                value={groups.dailyForecastEntity || ''}
                onChange={(e) => updateSingle('dailyForecastEntity', e.target.value)}
                placeholder="weather.openweathermap"
              />
              <p className="text-xs text-gray-500 mt-1">
                Entity for 7-day daily forecast. Leave empty to use default.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sun Entity</label>
            <input
              type="text"
              className="input w-64"
              value={groups.sunEntity}
              onChange={(e) => updateSingle('sunEntity', e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Usually <code>sun.sun</code> - provides sunrise/sunset times.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
