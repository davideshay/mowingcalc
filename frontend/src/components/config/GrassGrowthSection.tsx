import { useState } from 'react';
import { GRASS_PRESETS, findGrassPreset } from '../../config/grassPresets';

interface Props {
  grassType: string;
  growthLowerLimit: number;
  growthUpperLimit: number;
  growthModel: any;
  onChange: (updates: any) => void;
}

export function GrassGrowthSection({ grassType, growthLowerLimit, growthUpperLimit, growthModel, onChange }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const preset = findGrassPreset(grassType);

  const handleGrassTypeChange = (newType: string) => {
    const newPreset = findGrassPreset(newType);
    if (newPreset) {
      onChange({
        grassType: newType,
        growthLowerLimit: newPreset.growthLowerLimit,
        growthUpperLimit: newPreset.growthUpperLimit,
        growthModel: { ...newPreset.growthModel },
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Grass Type Selection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Grass Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GRASS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleGrassTypeChange(p.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                grassType === p.id
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

      {/* When to Mow */}
      <div>
        <h3 className="text-lg font-semibold mb-4">When to Mow</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberInput
            label="Mow when growth reaches (mm)"
            value={growthLowerLimit}
            onChange={(v) => onChange({ growthLowerLimit: v })}
            hint="Minimum growth to trigger mowing"
          />
          <NumberInput
            label="Emergency mow threshold (mm)"
            value={growthUpperLimit}
            onChange={(v) => onChange({ growthUpperLimit: v })}
            hint="Maximum growth before emergency mow"
          />
        </div>
      </div>

      {/* Growth Model (Advanced) */}
      {advanced && (
        <div className="border border-gray-200 rounded-xl p-6 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Growth Model Parameters</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (preset) {
                    onChange({
                      growthModel: { ...preset.growthModel },
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
                ✕ Close
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput
              label="Base growth rate (mm/day)"
              value={growthModel?.baseRatePerDay}
              onChange={(v) => onChange({ growthModel: { ...growthModel, baseRatePerDay: v } })}
            />
            <NumberInput
              label="Rain multiplier"
              value={growthModel?.rainMultiplier}
              onChange={(v) => onChange({ growthModel: { ...growthModel, rainMultiplier: v } })}
            />
            <NumberInput
              label="Optimal temp min (°C)"
              value={growthModel?.tempOptimalMin}
              onChange={(v) => onChange({ growthModel: { ...growthModel, tempOptimalMin: v } })}
            />
            <NumberInput
              label="Optimal temp max (°C)"
              value={growthModel?.tempOptimalMax}
              onChange={(v) => onChange({ growthModel: { ...growthModel, tempOptimalMax: v } })}
            />
            <NumberInput
              label="Sun growth boost"
              value={growthModel?.sunGrowthBoost}
              onChange={(v) => onChange({ growthModel: { ...growthModel, sunGrowthBoost: v } })}
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
          Show advanced growth model parameters →
        </button>
      )}
    </div>
  );
}

function NumberInput({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        className="input"
        value={parseFloat(value.toFixed(2))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step="any"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
