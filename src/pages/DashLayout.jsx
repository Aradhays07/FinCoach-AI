import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import BorrowerPanel from '../components/BorrowerPanel';
import ShortcutsModal from '../components/ShortcutsModal';
import { useAuth } from '../context/AuthContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import s from './DashLayout.module.css';

function DashInner() {
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  return (
    <div className={s.layout}>
      <Sidebar />
      <div className={s.right}>
        <BorrowerPanel />
        <main className={s.main}><Outlet /></main>
      </div>
      {showHelp && <ShortcutsModal onClose={() => setShowHelp(false)}/>}
    </div>
  );
}

export default function DashLayout() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className={s.loading}><span className={s.spin}/></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace/>;
  return <DashInner/>;
}
