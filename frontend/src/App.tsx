import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Configuration } from './pages/Configuration';
import { History } from './pages/History';
import { AlgorithmDetails } from './pages/AlgorithmDetails';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config" element={<Configuration />} />
          <Route path="/history" element={<History />} />
          <Route path="/algorithm" element={<AlgorithmDetails />} />
        </Routes>
      </Layout>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  );
}

export default App;
