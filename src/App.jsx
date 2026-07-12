import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BorrowerProvider } from './context/BorrowerContext';
import XPToastContainer from './components/XPToast';
import Landing from './pages/Landing';
import { Login, Signup } from './pages/Auth';
import DashLayout from './pages/DashLayout';
import Overview from './pages/Overview';
import BulkPage from './pages/BulkPage';
import MatchPage from './pages/MatchPage';
import ZapierPage from './pages/ZapierPage';
import { BenchmarksPage, CompliancePage, CreditScorePage, QuestsPage, PlaybookPage, ModelMetricsPage } from './pages/FeaturePages';
import TrajectoryPage from './pages/TrajectoryPage';

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BorrowerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <DashLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="credit" element={<CreditScorePage />} />
              <Route path="bulk" element={<BulkPage />} />
              <Route path="match" element={<MatchPage />} />
              <Route path="benchmarks" element={<BenchmarksPage />} />
              <Route path="quests" element={<QuestsPage />} />
              <Route path="playbook" element={<PlaybookPage />} />
              <Route path="zapier" element={<ZapierPage />} />
              <Route path="compliance" element={<CompliancePage />} />
              <Route path="trajectory" element={<TrajectoryPage />} />
              <Route path="metrics" element={<ModelMetricsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <XPToastContainer />
        </BrowserRouter>
      </BorrowerProvider>
    </AuthProvider>
  );
}
