import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Configuration } from './pages/Configuration';
import { History } from './pages/History';
import { AlgorithmDetails } from './pages/AlgorithmDetails';
import { SensorHealth } from './pages/SensorHealth';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/config" element={<Configuration />} />
            <Route path="/history" element={<History />} />
            <Route path="/algorithm" element={<AlgorithmDetails />} />
            <Route path="/sensors" element={<SensorHealth />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  );
}

export default App;
