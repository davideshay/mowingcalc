import { useState, useEffect, useRef } from 'react';
import { useConfig, useConfigUpdate, useValidateHA } from '../hooks/useApi';
import { GrassGrowthSection } from '../components/config/GrassGrowthSection';
import { RainDelaySection } from '../components/config/RainDelaySection';
import { MowingWindowsEditor } from '../components/config/MowingWindowsEditor';
import { EntityGroupsEditor } from '../components/config/EntityGroupsEditor';
import { HAInputHelpersEditor } from '../components/config/HAInputHelpersEditor';
import { HAConnectionSection } from '../components/config/HAConnectionSection';

export function Configuration() {
  const { data: config, loading, error } = useConfig();
  const { fullSaveConfig, saving } = useConfigUpdate();
  const [draft, setDraft] = useState<any>(null);
  const initialized = useRef(false);
  const { results, haConnected, validating, validate } = useValidateHA();

  // Sync draft with loaded config
  useEffect(() => {
    if (config && !initialized.current) {
      setDraft(JSON.parse(JSON.stringify(config)));
      initialized.current = true;
    }
  }, [config]);

  if (loading) return <div className="flex justify-center h-64 items-center">Loading config...</div>;
  if (error) return (
    <div className="card border-red-200 bg-red-50">
      <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load configuration</h2>
      <p className="text-red-600">{error}</p>
      <button onClick={() => window.location.reload()} className="btn-primary mt-4">Retry</button>
    </div>
  );

  const updateSection = (section: string, updates: any) => {
    setDraft((d: any) => {
      if (section === 'grass') {
        return {
          ...d,
          grassType: updates.grassType || d.grassType,
          growthLowerLimit: updates.growthLowerLimit !== undefined ? updates.growthLowerLimit : d.growthLowerLimit,
          growthUpperLimit: updates.growthUpperLimit !== undefined ? updates.growthUpperLimit : d.growthUpperLimit,
          growthModel: updates.growthModel || d.growthModel,
        };
      }
      if (section === 'rain') {
        return {
          ...d,
          rainDelayModel: {
            ...d.rainDelayModel,
            soilType: updates.soilType || d.rainDelayModel.soilType,
            minDelayAfterRain: updates.minDelayAfterRain !== undefined ? updates.minDelayAfterRain : d.rainDelayModel.minDelayAfterRain,
            heavyRainDelay: updates.heavyRainDelay !== undefined ? updates.heavyRainDelay : d.rainDelayModel.heavyRainDelay,
            sunDryingRate: updates.sunDryingRate !== undefined ? updates.sunDryingRate : d.rainDelayModel.sunDryingRate,
            tempDryingFactor: updates.tempDryingFactor !== undefined ? updates.tempDryingFactor : d.rainDelayModel.tempDryingFactor,
            mowerWeightLbs: updates.mowerWeightLbs !== undefined ? updates.mowerWeightLbs : d.rainDelayModel.mowerWeightLbs,
            compactionThreshold: updates.compactionThreshold !== undefined ? updates.compactionThreshold : d.rainDelayModel.compactionThreshold,
            surfaceDryFactor: updates.surfaceDryFactor !== undefined ? updates.surfaceDryFactor : d.rainDelayModel.surfaceDryFactor,
          },
        };
      }
      if (section === 'mowingWindows') {
        return { ...d, mowingWindows: updates };
      }
      if (section === 'entityGroups') {
        return { ...d, entityGroups: updates };
      }
      if (section === 'haInputHelpers') {
        return { ...d, haInputHelpers: updates };
      }
      if (section === 'ha') {
        return {
          ...d,
          haUrl: updates.haUrl !== undefined ? updates.haUrl : d.haUrl,
          haToken: updates.haToken !== undefined ? updates.haToken : d.haToken,
          forecastLookaheadDays: updates.forecastLookaheadDays !== undefined ? updates.forecastLookaheadDays : d.forecastLookaheadDays,
        };
      }
      if (section === 'readonly') {
        return { ...d, readonlyMode: updates.readonlyMode };
      }
      if (section === 'units') {
        return { ...d, displayUnits: updates.displayUnits };
      }
      return { ...d, ...updates };
    });
  };

  const onSave = async () => {
    if (draft) {
      try {
        await fullSaveConfig(draft);
        initialized.current = false;
      } catch (err) {
        console.error('Failed to save config:', err);
      }
    }
  };

  const onReset = () => {
    if (config) {
      setDraft(JSON.parse(JSON.stringify(config)));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 py-3 -mx-4 px-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <p className="text-gray-600 mt-1">Edit all mowing scheduler parameters</p>
        </div>
        <div className="flex gap-3">
          <button onClick={validate} disabled={validating || !draft} className="btn-secondary disabled:opacity-50">
            {validating ? 'Validating...' : 'Validate Setup'}
          </button>
          <button onClick={onReset} className="btn-secondary">Reset</button>
          <button onClick={onSave} disabled={saving || !draft} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Validation Results */}
       {results.length > 0 || haConnected !== null ? (
         <div className={`card ${haConnected ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
           <h3 className={`text-lg font-semibold mb-3 ${haConnected ? 'text-green-800' : 'text-red-800'}`}>
             {haConnected ? 'Home Assistant Connected' : 'Home Assistant Not Connected'}
           </h3>
           {haConnected && results.length > 0 && (
             <div className="space-y-2">
               {results.map((result, i) => (
                 <div key={i} className="flex items-center gap-3 text-sm">
                   <span className={`w-2 h-2 rounded-full ${
                     result.status === 'ok' ? 'bg-green-500' :
                     result.status === 'unavailable' ? 'bg-yellow-500' :
                     result.status === 'not_found' ? 'bg-red-500' : 'bg-red-500'
                   }`} />
                   <span className="font-mono text-gray-700">{result.entity_id}</span>
                   <span className="text-gray-500">({result.label})</span>
                   {result.state && result.status === 'ok' && (
                     <span className="text-gray-500">{result.state}</span>
                   )}
                   {result.status === 'unavailable' && (
                     <span className="text-yellow-600">Entity exists but is currently unavailable</span>
                   )}
                   {result.status === 'not_found' && (
                     <span className="text-red-600">Not found</span>
                   )}
                   {result.status === 'error' && (
                     <span className="text-red-600">{result.message}</span>
                   )}
                 </div>
               ))}
             </div>
           )}
           {!haConnected && (
             <p className="text-red-600">
               Cannot connect to Home Assistant. Check your URL and API token settings.
             </p>
           )}
         </div>
       ) : null}

      {!draft && <div className="card"><p className="text-gray-500">Loading...</p></div>}

      {draft && (
        <>
          {/* Display Units */}
          <section className="card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Display Units</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Choose how temperatures and lengths are displayed. All internal calculations remain metric.
                </p>
              </div>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => updateSection('units', { displayUnits: 'metric' })}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    draft.displayUnits === 'metric'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Metric (°C / mm)
                </button>
                <button
                  type="button"
                  onClick={() => updateSection('units', { displayUnits: 'imperial' })}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    draft.displayUnits === 'imperial'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Imperial (°F / in)
                </button>
              </div>
            </div>
          </section>

          {/* Read-Only Mode Toggle */}
          <section className={`card ${draft.readonlyMode ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-semibold ${draft.readonlyMode ? 'text-amber-900' : 'text-green-900'}`}>
                  {draft.readonlyMode ? '🔒 Read-Only Mode' : '🔓 Automatic Mower Control'}
                </h2>
                <p className={`text-sm mt-1 ${draft.readonlyMode ? 'text-amber-800' : 'text-green-800'}`}>
                  {draft.readonlyMode
                    ? 'All mower actions are blocked. The algorithm runs and monitors, but will not trigger the mower.'
                    : 'The algorithm can automatically start your mower. Review settings carefully before enabling.'}
                </p>
              </div>
              <button
                onClick={() => updateSection('readonly', { readonlyMode: !draft.readonlyMode })}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${draft.readonlyMode ? 'bg-amber-500' : 'bg-green-600'}`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${draft.readonlyMode ? 'translate-x-1' : 'translate-x-7'}`}
                />
              </button>
            </div>
          </section>

          {/* Grass & Growth */}
          <section className="card">
            <GrassGrowthSection
              grassType={draft.grassType}
              growthLowerLimit={draft.growthLowerLimit}
              growthUpperLimit={draft.growthUpperLimit}
              growthModel={draft.growthModel}
              onChange={(updates) => updateSection('grass', updates)}
            />
          </section>

          {/* Rain Delay */}
          <section className="card">
            <RainDelaySection
              soilType={draft.rainDelayModel?.soilType}
              rainDelayModel={draft.rainDelayModel}
              onChange={(updates) => updateSection('rain', updates)}
            />
          </section>

          {/* Time Constraints */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Time Constraints</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberInput label="Min time between mows (hours)" value={draft.minTimeBetweenMows} onChange={(v) => updateSection('time', { minTimeBetweenMows: v })} />
              <NumberInput label="Max time between mows (hours)" value={draft.maxTimeBetweenMows} onChange={(v) => updateSection('time', { maxTimeBetweenMows: v })} />
              <NumberInput label="Average mowing duration (minutes)" value={draft.avgMowingDuration} onChange={(v) => updateSection('time', { avgMowingDuration: v })} />
              <NumberInput label="Algorithm run interval (minutes)" value={draft.algorithmRunInterval} onChange={(v) => updateSection('time', { algorithmRunInterval: v })} />
            </div>
          </section>

          {/* Weather Thresholds */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Weather Thresholds</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberInput label="Max precipitation chance (%)" value={draft.maxPrecipitationChance} onChange={(v) => updateSection('weather', { maxPrecipitationChance: v })} />
              <NumberInput label="Weather cache TTL (minutes)" value={draft.weatherCacheTTL} onChange={(v) => updateSection('weather', { weatherCacheTTL: v })} />
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold mb-4">Forecast Lookahead</h3>
              <div className="p-4 bg-green-50 rounded-xl mb-4">
                <p className="text-sm text-green-800">
                  How many days ahead should the algorithm check for rain? It uses hourly forecasts
                  for the first 24 hours, then daily forecasts beyond that. If rain is expected and
                  grass growth is sufficient, it will mow proactively before the soil gets wet.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberInput
                  label="Lookahead days (1-7)"
                  value={draft.forecastLookaheadDays}
                  onChange={(v) => updateSection('weather', { forecastLookaheadDays: Math.max(1, Math.min(7, v)) })}
                />
              </div>
            </div>
          </section>

          {/* HA Connection */}
          <section className="card">
            <HAConnectionSection
              haUrl={draft.haUrl}
              haToken={draft.haToken}
              onChange={(updates) => updateSection('ha', updates)}
            />
          </section>

          {/* Mowing Windows */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Mowing Windows</h2>
            <MowingWindowsEditor windows={draft.mowingWindows} onChange={(v) => updateSection('mowingWindows', v)} />
          </section>

          {/* Entity Groups */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Entity Groups</h2>
            <EntityGroupsEditor groups={draft.entityGroups} onChange={(v) => updateSection('entityGroups', v)} />
          </section>

          {/* HA Input Helpers */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">HA Input Helpers</h2>
            <HAInputHelpersEditor helpers={draft.haInputHelpers} onChange={(v) => updateSection('haInputHelpers', v)} />
          </section>
        </>
      )}
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
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
    </div>
  );
}
