import s from './States.module.css';
import { Database, AlertCircle } from 'lucide-react';

export function Skeleton({ width = '100%', height = 16, radius = 6, className = '' }) {
  return <div className={`${s.skeleton} ${className}`} style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonCard({ rows = 3, className = '' }) {
  return (
    <div className={`${s.skeletonCard} ${className}`}>
      <Skeleton width="40%" height={12} radius={4} />
      <Skeleton width="55%" height={26} radius={4} />
      {rows > 2 && <Skeleton width="30%" height={11} radius={4} />}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className={s.skeletonTable}>
      <div className={s.skeletonHead}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} width={`${Math.floor(80 / cols)}%`} height={11} radius={3} />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={s.skeletonRow}>
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} width={`${50 + (j * 7) % 25}%`} height={13} radius={3} />)}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 200 }) {
  return (
    <div className={s.skeletonChart} style={{ height }}>
      {[70, 45, 85, 60, 90, 55, 75, 50, 80, 65].map((h, i) => (
        <div key={i} className={s.skeletonBar} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Database, title = 'Nothing here yet', desc = '', action, onAction }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyIcon}><Icon size={26} /></div>
      <div className={s.emptyTitle}>{title}</div>
      {desc && <div className={s.emptyDesc}>{desc}</div>}
      {action && onAction && <button className={s.emptyAction} onClick={onAction}>{action}</button>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className={s.errorState}>
      <div className={s.errorIcon}><AlertCircle size={18} /></div>
      <div className={s.errorTitle}>Failed to load</div>
      <div className={s.errorDesc}>{message || 'An unexpected error occurred.'}</div>
      {onRetry && <button className={s.retryBtn} onClick={onRetry}>↻ Retry</button>}
    </div>
  );
}

export function PageLoader() {
  return <div className={s.pageLoader}><div className={s.spin} /></div>;
}
