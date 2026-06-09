import { useState } from 'react';
import { SOIL_PRESETS, findSoilPreset } from '../../config/soilPresets';

interface Props {
  soilType: string;
  rainDelayModel: any;
  onChange: (updates: any) => void;
}

export function RainDelaySection({ soilType, rainDelayModel, onChange }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const preset = findSoilPreset(soilType);

  const handleSoilTypeChange = (newType: string) => {
    const newPreset = findSoilPreset(newType);
    if (newPreset) {
      onChange({
        soilType: newType,
        sunDryingRate: newPreset.sunDryingRate,
        tempDryingFactor: newPreset.tempDryingFactor,
        minDelayAfterRain: newPreset.minDelayAfterRain,
        heavyRainDelay: newPreset.heavyRainDelay,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Soil Type Selection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Soil Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SOIL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSoilTypeChange(p.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                soilType === p.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900">{p.name}</div>
              <div className="text-sm text-gray-600 mt-1">{p.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Mower Settings (NEW) */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Mower Settings</h3>
        <p className="text-sm text-gray-500 mb-4">
          Mower weight affects the compaction threshold. Robot mowers (60-70 lbs) can safely
          mow on wetter soil than conventional riding mowers (300+ lbs).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberInput
            label="Mower weight (lbs)"
            value={rainDelayModel?.mowerWeightLbs ?? 65}
            onChange={(v) => onChange({ mowerWeightLbs: v })}
            hint="60-70 for robot mowers, 200+ for riding mowers"
          />
          <NumberInput
            label="Compaction threshold (% of FC)"
            value={(rainDelayModel?.compactionThreshold ?? 1.05) * 100}
            onChange={(v) => onChange({ compactionThreshold: v / 100 })}
            hint="105% for robot mowers, 100% for conventional"
            step="1"
          />
          <NumberInput
            label="Surface dry factor (%)"
            value={(rainDelayModel?.surfaceDryFactor ?? 0.3) * 100}
            onChange={(v) => onChange({ surfaceDryFactor: v / 100 })}
            hint="Extra drying beyond safe threshold for optimal cut quality"
            step="5"
          />
        </div>
      </div>

      {/* Rain Delay Settings */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Rain Delay Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberInput
            label="Minimum delay after any rain (hours)"
            value={rainDelayModel?.minDelayAfterRain}
            onChange={(v) => onChange({ minDelayAfterRain: v })}
            hint="Absolute floor: even light rain waits this long for surface blades to dry."
          />
          <NumberInput
            label="Maximum rain delay (hours)"
            value={rainDelayModel?.heavyRainDelay}
            onChange={(v) => onChange({ heavyRainDelay: v })}
            hint="Absolute ceiling: model output never exceeds this regardless of how hard it rained."
          />
        </div>
      </div>

      {/* Drying Factors (Advanced) */}
      {advanced && (
        <div className="border border-gray-200 rounded-xl p-6 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Drying Factors</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (preset) {
                    onChange({
                      sunDryingRate: preset.sunDryingRate,
                      tempDryingFactor: preset.tempDryingFactor,
                    });
                  }
                }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Reset to defaults
              </button>
              <button
                type="button"
                onClick={() => setAdvanced(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                X Close
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput
              label="Sun drying rate (per hour)"
              value={rainDelayModel?.sunDryingRate}
              onChange={(v) => onChange({ sunDryingRate: v })}
              hint="How much rain delay is reduced by sunshine"
            />
            <NumberInput
              label="Temperature drying factor"
              value={rainDelayModel?.tempDryingFactor}
              onChange={(v) => onChange({ tempDryingFactor: v })}
              hint="How much rain delay is reduced by temperature"
            />
          </div>
        </div>
      )}

      {!advanced && (
        <button
          type="button"
          onClick={() => setAdvanced(true)}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          Show advanced drying factors &rarr;
        </button>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  hint,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        className="input"
        value={parseFloat(value.toFixed(2))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
