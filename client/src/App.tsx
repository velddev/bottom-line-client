import { useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import PreloadScreen from './components/PreloadScreen';
import AuthScreen from './screens/AuthScreen';
import DashboardScreen from './screens/DashboardScreen';
import ResearchScreen from './screens/ResearchScreen';
import MarketingScreen from './screens/MarketingScreen';
import TilesScreen from './screens/TilesScreen';
import PerformanceScreen from './screens/PerformanceScreen';
import ChatScreen from './screens/ChatScreen';

function AppRoutes() {
  const { auth } = useAuth();
  const [assetsReady, setAssetsReady] = useState(false);

  if (!auth) return <AuthScreen />;

  return (
    <>
      {!assetsReady && <PreloadScreen onReady={() => setAssetsReady(true)} />}
      <HashRouter>
          <Layout>
            <Routes>
              <Route path="/"             element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"    element={<DashboardScreen />} />
              <Route path="/performance"  element={<PerformanceScreen />} />
              <Route path="/research"     element={<ResearchScreen />} />
              <Route path="/marketing"    element={<MarketingScreen />} />
              <Route path="/map"          element={<TilesScreen />} />
              <Route path="/chat"         element={<ChatScreen />} />
              <Route path="*"             element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Layout>
        </HashRouter>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
