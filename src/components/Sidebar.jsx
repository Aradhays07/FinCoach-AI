import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, Target, BookOpen, Layers, Users, Zap, ShieldCheck, LogOut, ChevronRight, BarChart3, Navigation, Gauge } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import s from './Sidebar.module.css';

const NAV = [
  { icon: LayoutDashboard, label: 'Overview',        to: '/dashboard',             group: 'main' },
  { icon: TrendingUp,      label: 'Credit Score',    to: '/dashboard/credit',      group: 'main' },
  { icon: Layers,          label: 'Bulk Decisions',  to: '/dashboard/bulk',        group: 'main' },
  { icon: Users,           label: 'Lender Match',    to: '/dashboard/match',       group: 'main' },
  { icon: BarChart3,       label: 'Benchmarks',      to: '/dashboard/benchmarks',  group: 'main' },
  { icon: Navigation,       label: 'Trajectory',       to: '/dashboard/trajectory',  group: 'main' },
  { icon: Gauge,           label: 'Model Metrics',   to: '/dashboard/metrics',     group: 'main' },
  { icon: Target,          label: 'Quests',          to: '/dashboard/quests',      group: 'tools' },
  { icon: BookOpen,        label: 'Playbook',        to: '/dashboard/playbook',    group: 'tools' },
  { icon: Zap,             label: 'Zapier',          to: '/dashboard/zapier',      group: 'tools' },
  { icon: ShieldCheck,     label: 'Compliance',      to: '/dashboard/compliance',  group: 'tools' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className={s.sidebar}>
      <div className={s.brand}>
        <div className={s.logo}>
          <span className={s.logoMark}>FE</span>
        </div>
        <div className={s.brandText}>
          <div className={s.brandName}>Fineasy<span>AI</span></div>
          <div className={s.brandSub}>B2B Platform</div>
        </div>
      </div>

      <nav className={s.nav}>
        <div className={s.groupLabel}>Analytics</div>
        <div className={s.navGroup}>
          {NAV.filter(n => n.group === 'main').map(({ icon: Icon, label, to }) => (
            <NavLink key={to} to={to} end={to === '/dashboard'}
              className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}>
              <Icon size={15} />
              <span>{label}</span>
              <ChevronRight size={11} className={s.arrow} />
            </NavLink>
          ))}
        </div>
        <div className={s.groupLabel}>Tools</div>
        <div className={s.navGroup}>
          {NAV.filter(n => n.group === 'tools').map(({ icon: Icon, label, to }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}>
              <Icon size={15} />
              <span>{label}</span>
              <ChevronRight size={11} className={s.arrow} />
            </NavLink>
          ))}
        </div>
      </nav>

      <div className={s.bottom}>
        <div className={s.user}>
          <div className={s.avatar}>{initials}</div>
          <div className={s.userInfo}>
            <div className={s.userName}>{user?.name || 'User'}</div>
            <div className={s.userRole}>{user?.company || 'FineasyAI'}</div>
          </div>
        </div>
        <button className={s.shortcutHint} onClick={() => window.dispatchEvent(new CustomEvent('fineasy:shortcuts'))} title="Keyboard shortcuts">
        <span className={s.kbdKey}>?</span> <span>Shortcuts</span>
      </button>
      <button className={s.logout} onClick={() => { logout(); navigate('/'); }}>
          <LogOut size={13} /> <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
