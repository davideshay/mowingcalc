interface Props {
  haUrl: string;
  haToken: string;
  onChange: (updates: { haUrl?: string; haToken?: string }) => void;
}

export function HAConnectionSection({ haUrl, haToken, onChange }: Props) {
  return (
    <div className="space-y-6">
      {/* HA Connection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Home Assistant Connection</h3>
        <div className="p-4 bg-blue-50 rounded-xl mb-4">
          <p className="text-sm text-blue-800">
            Enter your Home Assistant URL and API token. The token can be found in HA under
            Profile → Create Token (Long-Lived Access Token).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HA URL</label>
            <input
              type="url"
              className="input"
              value={haUrl}
              onChange={(e) => onChange({ haUrl: e.target.value })}
              placeholder="http://homeassistant.local:8123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HA API Token</label>
            <input
              type="password"
              className="input"
              value={haToken}
              onChange={(e) => onChange({ haToken: e.target.value })}
              placeholder="eyJ0eXAi..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
