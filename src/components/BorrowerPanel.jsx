/**
 * BorrowerPanel.jsx
 * Shows selected borrower context bar + history list.
 * Renders at the top of each dashboard page.
 */
import { useNavigate } from 'react-router-dom';
import { X, Clock, TrendingUp, TrendingDown, ChevronRight, User } from 'lucide-react';
import { useBorrower } from '../context/BorrowerContext';
import s from './BorrowerPanel.module.css';

const RISK_COLOR = { low: 'var(--green)', medium: 'var(--gold)', high: 'var(--red)' };

function Sparkline({ data = [] }) {
  if (data.length < 2) return null;
  const scores = data.map(d => d.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const w = 48, h = 20;
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * w;
    const y = h - ((s - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const rising = scores[scores.length - 1] >= scores[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={rising ? 'var(--green)' : 'var(--red)'} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function BorrowerPanel() {
  const { selected, history, selectBorrower, clearBorrower, clearAll } = useBorrower();
  const navigate = useNavigate();

  if (!selected && !history.length) return null;

  return (
    <div className={s.wrap}>
      {/* SELECTED BORROWER BAR */}
      {selected && (
        <div className={s.selectedBar}>
          <div className={s.selectedLeft}>
            <div className={s.avatar}>
              {(selected.name || '?').slice(0,2).toUpperCase()}
            </div>
            <div className={s.selectedInfo}>
              <div className={s.selectedName}>{selected.name || 'Unknown borrower'}</div>
              <div className={s.selectedMeta}>
                <span style={{ color: RISK_COLOR[selected.risk] || 'var(--fg-3)' }}>
                  {selected.risk?.toUpperCase()} RISK
                </span>
                <span className={s.dot}>·</span>
                <span className={s.scoreVal}>{Math.round(selected.score)} score</span>
                <span className={s.dot}>·</span>
                <span>{{ approve:'APPROVED', reject:'REJECTED', review:'REVIEW' }[selected.decision] || selected.decision?.toUpperCase()}</span>
              </div>
            </div>
            {selected.scoreHistory?.length >= 2 && (
              <Sparkline data={selected.scoreHistory}/>
            )}
          </div>
          <div className={s.selectedActions}>
            <button className={s.actionBtn} onClick={() => navigate('/dashboard/match')} title="Find lenders">
              Match lenders <ChevronRight size={11}/>
            </button>
            <button className={s.actionBtn} onClick={() => navigate('/dashboard/playbook')} title="Generate playbook">
              Playbook <ChevronRight size={11}/>
            </button>
            <button className={s.clearBtn} onClick={clearBorrower} title="Clear selection">
              <X size={13}/> Clear
            </button>
          </div>
        </div>
      )}

      {/* HISTORY ROW */}
      {history.length > 0 && (
        <div className={s.historyRow}>
          <div className={s.historyLabel}><Clock size={10}/> Recent</div>
          <div className={s.historyList}>
            {history.slice(0, 8).map(b => (
              <button
                key={b.id}
                className={`${s.historyChip} ${selected?.id === b.id ? s.chipActive : ''}`}
                onClick={() => { selectBorrower(b); navigate('/dashboard/credit'); }}
              >
                <span className={s.chipDot} style={{ background: RISK_COLOR[b.risk] || 'var(--fg-3)' }}/>
                <span className={s.chipName}>{b.name || 'Unknown'}</span>
                <span className={s.chipScore}>{Math.round(b.score)}</span>
              </button>
            ))}
          </div>
          <button className={s.clearAllBtn} onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
