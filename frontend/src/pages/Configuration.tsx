import { useState, useEffect } from 'react';
import { useConfig, useConfigUpdate } from '../hooks/useApi';

export function Configuration() {
  const { data: config, loading } = useConfig();
  const { fullSaveConfig, saving } = useConfigUpdate();
  const [draft, setDraft] = useState<any>(null);

  // Sync draft with loaded config
  useEffect(() => {
    if (config && !draft) {
      setDraft(config);
    }
  }, [config]);

  if (loading) return <div className="flex justify-center h-64 items-center">Loading config...</div>;

  const onChange = (key: string, value: any) => {
    setDraft((d: any) => ({ ...d, [key]: value }));
  };

  const onSave = async () => {
    if (draft) await fullSaveConfig(draft);
  };

  const onReset = () => setDraft(config);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <p className="text-gray-600 mt-1">Edit all mowing scheduler parameters</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onReset} className="btn-secondary">Reset</button>
          <button onClick={onSave} disabled={saving || !draft} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {!draft && <div className="card"><p className="text-gray-500">Loading...</p></div>}

      {draft && (
        <>
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Grass & Growth</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Grass Type" value={draft.grassType} onChange={(v) => onChange('grassType', v)} />
              <NumberInput label="Lower Limit (mm)" value={draft.growthLowerLimit} onChange={(v) => onChange('growthLowerLimit', v)} />
              <NumberInput label="Upper Limit (mm)" value={draft.growthUpperLimit} onChange={(v) => onChange('growthUpperLimit', v)} />
              <NumberInput label="Base Rate/Day (mm)" value={draft.growthModel?.baseRatePerDay} onChange={(v) => onChange('growthModel', { ...draft.growthModel, baseRatePerDay: v })} />
              <NumberInput label="Rain Multiplier" value={draft.growthModel?.rainMultiplier} onChange={(v) => onChange('growthModel', { ...draft.growthModel, rainMultiplier: v })} />
              <NumberInput label="Temp Optimal Min (C)" value={draft.growthModel?.tempOptimalMin} onChange={(v) => onChange('growthModel', { ...draft.growthModel, tempOptimalMin: v })} />
              <NumberInput label="Temp Optimal Max (C)" value={draft.growthModel?.tempOptimalMax} onChange={(v) => onChange('growthModel', { ...draft.growthModel, tempOptimalMax: v })} />
              <NumberInput label="Sun Growth Boost" value={draft.growthModel?.sunGrowthBoost} onChange={(v) => onChange('growthModel', { ...draft.growthModel, sunGrowthBoost: v })} />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Rain Delay</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberInput label="Min Delay After Rain (h)" value={draft.rainDelayModel?.minDelayAfterRain} onChange={(v) => onChange('rainDelayModel', { ...draft.rainDelayModel, minDelayAfterRain: v })} />
              <NumberInput label="Heavy Rain Delay (h)" value={draft.rainDelayModel?.heavyRainDelay} onChange={(v) => onChange('rainDelayModel', { ...draft.rainDelayModel, heavyRainDelay: v })} />
              <NumberInput label="Sun Drying Rate" value={draft.rainDelayModel?.sunDryingRate} onChange={(v) => onChange('rainDelayModel', { ...draft.rainDelayModel, sunDryingRate: v })} />
              <NumberInput label="Temp Drying Factor" value={draft.rainDelayModel?.tempDryingFactor} onChange={(v) => onChange('rainDelayModel', { ...draft.rainDelayModel, tempDryingFactor: v })} />
              <Select label="Soil Type" value={draft.rainDelayModel?.soilType} options={['sand', 'loam', 'clay']} onChange={(v) => onChange('rainDelayModel', { ...draft.rainDelayModel, soilType: v })} />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Time Constraints</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberInput label="Min Time Between Mows (h)" value={draft.minTimeBetweenMows} onChange={(v) => onChange('minTimeBetweenMows', v)} />
              <NumberInput label="Max Time Between Mows (h)" value={draft.maxTimeBetweenMows} onChange={(v) => onChange('maxTimeBetweenMows', v)} />
              <NumberInput label="Avg Mowing Duration (min)" value={draft.avgMowingDuration} onChange={(v) => onChange('avgMowingDuration', v)} />
              <NumberInput label="Algorithm Run Interval (min)" value={draft.algorithmRunInterval} onChange={(v) => onChange('algorithmRunInterval', v)} />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Weather Thresholds</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberInput label="Max Precipitation Chance (%)" value={draft.maxPrecipitationChance} onChange={(v) => onChange('maxPrecipitationChance', v)} />
              <NumberInput label="Weather Cache TTL (min)" value={draft.weatherCacheTTL} onChange={(v) => onChange('weatherCacheTTL', v)} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} step="any" />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
