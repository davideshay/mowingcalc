interface HAInputHelpers {
  enabled: boolean;
  nextMowNumber: string;
  growthEstimateNumber: string;
  rainDelayNumber: string;
  mowRecommendedBoolean: string;
  mowReasonSelect: string;
}

interface Props {
  helpers: HAInputHelpers;
  onChange: (helpers: HAInputHelpers) => void;
}

export function HAInputHelpersEditor({ helpers, onChange }: Props) {
  const update = (key: keyof HAInputHelpers, value: any) => {
    onChange({
      ...helpers,
      [key]: value,
    });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-yellow-50 rounded-xl">
        <h4 className="font-medium text-yellow-800 mb-2">What are HA Input Helpers?</h4>
        <p className="text-sm text-yellow-700 mb-2">
          Home Assistant Input Helpers are entities you create in HA that this app writes to. They let you build automations in HA based on the mowing algorithm's output.
        </p>
        <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
          <li><code className="bg-yellow-100 px-1 rounded">input_boolean.mow_recommended</code> → True/False recommendation</li>
          <li><code className="bg-yellow-100 px-1 rounded">input_number.growth_estimate_mm</code> → Current grass growth</li>
          <li><code className="bg-yellow-100 px-1 rounded">input_select.mow_reason</code> → Text explanation</li>
        </ul>
        <p className="text-sm text-yellow-700 mt-2">
          Create these in HA: Settings → Devices & Services → Helpers → Create Helper
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="ha-input-helpers-enabled"
          checked={helpers.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="ha-input-helpers-enabled" className="text-sm font-medium text-gray-700">
          Enable HA Input Helpers
        </label>
      </div>

      {helpers.enabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-7">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Mow Number</label>
            <input
              type="text"
              className="input"
              value={helpers.nextMowNumber}
              onChange={(e) => update('nextMowNumber', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Growth Estimate Number</label>
            <input
              type="text"
              className="input"
              value={helpers.growthEstimateNumber}
              onChange={(e) => update('growthEstimateNumber', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rain Delay Number</label>
            <input
              type="text"
              className="input"
              value={helpers.rainDelayNumber}
              onChange={(e) => update('rainDelayNumber', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mow Recommended Boolean</label>
            <input
              type="text"
              className="input"
              value={helpers.mowRecommendedBoolean}
              onChange={(e) => update('mowRecommendedBoolean', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mow Reason Select</label>
            <input
              type="text"
              className="input"
              value={helpers.mowReasonSelect}
              onChange={(e) => update('mowReasonSelect', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
