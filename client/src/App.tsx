import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import AuthScreen from './screens/AuthScreen';
import DashboardScreen from './screens/DashboardScreen';
import AgreementsScreen from './screens/AgreementsScreen';
import ResearchScreen from './screens/ResearchScreen';
import MarketingScreen from './screens/MarketingScreen';
import TilesScreen from './screens/TilesScreen';
import PerformanceScreen from './screens/PerformanceScreen';

function AppRoutes() {
  const { auth } = useAuth();

  if (!auth) return <AuthScreen />;

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"             element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"    element={<DashboardScreen />} />
          <Route path="/performance"  element={<PerformanceScreen />} />
          <Route path="/agreements"   element={<AgreementsScreen />} />
          <Route path="/research"     element={<ResearchScreen />} />
          <Route path="/marketing"    element={<MarketingScreen />} />
          <Route path="/map"          element={<TilesScreen />} />
          <Route path="*"             element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
