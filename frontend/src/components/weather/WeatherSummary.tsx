export function WeatherSummary() {
  // For now, show a placeholder - actual weather data would come from HA integration
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Current Weather</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">🌡️</div>
          <div className="text-sm text-gray-500">Temperature</div>
          <div className="text-lg font-medium">--°C</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">💧</div>
          <div className="text-sm text-gray-500">Humidity</div>
          <div className="text-lg font-medium">--%</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">🌧️</div>
          <div className="text-sm text-gray-500">Rain (24h)</div>
          <div className="text-lg font-medium">--mm</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl mb-2">☀️</div>
          <div className="text-sm text-gray-500">Sunshine</div>
          <div className="text-lg font-medium">--h</div>
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-4">
        Weather data will be displayed once Home Assistant integration is configured.
      </p>
    </div>
  );
}
