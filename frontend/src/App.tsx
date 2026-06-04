function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-600 text-white p-4">
        <h1 className="text-2xl font-bold">MowingCalc</h1>
        <p className="text-green-100">Smart Lawn Mowing Scheduler</p>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Phase 1 Complete - Foundation Ready</h2>
          <p className="text-gray-600">
            The application scaffolding is set up. The following are coming in future phases:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
            <li>Phase 2: Algorithm Research &amp; Core (growth model + rain delay model)</li>
            <li>Phase 3: Mower Integration (HA service calls)</li>
            <li>Phase 4: Web UI (configuration, history, dashboard)</li>
            <li>Phase 5: Hardening &amp; Kubernetes deployment</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Backend API:</span>
              <span className="text-green-600">Running</span>
            </div>
            <div className="flex justify-between">
              <span>Database (SQLite):</span>
              <span className="text-green-600">Initialized</span>
            </div>
            <div className="flex justify-between">
              <span>Home Assistant:</span>
              <span className="text-yellow-600">Configured (not tested)</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
