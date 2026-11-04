// App.jsx

import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Home from './pages/Home';
import BuzzerMonitor from './pages/BuzzerMonitor';
import AdminRobot from './pages/AdminRobot';
import GlobalAlertToast from './components/GlobalAlertToast';
import ReturnToast from './components/ReturnToast';
import { RosbridgeProvider } from './context/RosbridgeContext';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <RosbridgeProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/buzzer" element={<BuzzerMonitor />} />
            <Route path="/admin-robot" element={<AdminRobot />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <GlobalAlertToast />
        <ReturnToast />
        <Toaster />
      </RosbridgeProvider>
    </QueryClientProvider>
  )
}

export default App