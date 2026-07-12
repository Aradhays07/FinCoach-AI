import s from './DecisionCard.module.css';
import PDFReport from './PDFReport';
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

export default function DecisionCard({
  status = 'review', confidence = 0, risk = 'medium',
  score, factors, actions = [], applicant, compact = false,
}) {
  const safeFactors = { positive: factors?.positive ?? [], negative: factors?.negative ?? [] };
  const STATUS = {
    approve: { label:'Approved',      icon:CheckCircle2,  badgeCls:s.approve, barCls:s.barApprove },
    reject:  { label:'Rejected',      icon:XCircle,       badgeCls:s.reject,  barCls:s.barReject  },
    review:  { label:'Manual Review', icon:AlertTriangle, badgeCls:s.review,  barCls:s.barReview  },
  };
  const RISK = {
    low:    { label:'Low risk',    cls:s.rLow  },
    medium: { label:'Medium risk', cls:s.rMed  },
    high:   { label:'High risk',   cls:s.rHigh },
  };

  const { label, icon:Icon, badgeCls, barCls } = STATUS[status] ?? STATUS.review;
  const { label:rLabel, cls:rc }               = RISK[risk]     ?? RISK.medium;
  const conf = Math.round(Math.min(100, Math.max(0, confidence)));

  // Arc gauge: use pathLength=100 so offset is simply (100 - conf)
  const arcColor = status === 'approve' ? 'var(--green)' : status === 'reject' ? 'var(--red)' : 'var(--gold)';

  return (
    <div className={`${s.card} ${compact ? s.compact : ''}`}>
      <div className={s.header}>
        <div className={`${s.statusBadge} ${badgeCls}`}>
          <Icon size={compact ? 12 : 14}/><span>{label}</span>
        </div>
        <div className={s.headerRight}>
          {score != null && (
            <div className={s.scoreChip}>
              <span className={s.scoreNum}>{Math.round(score)}</span>
              <span className={s.scoreLabel}>score</span>
            </div>
          )}
          <div className={`${s.riskChip} ${rc}`}>{rLabel}</div>
        </div>
      </div>

      {applicant && !compact && <div className={s.applicant}>Applicant: <strong>{applicant}</strong></div>}

      <div className={s.confRow}>
        <span className={s.confLabel}>Confidence</span>
        <div className={s.gaugeWrap}>
          <svg width={72} height={40} viewBox="0 0 72 42">
            {/* background arc - full half circle */}
            <path d="M 8 38 A 28 28 0 0 1 64 38"
              fill="none" stroke="var(--bg-4)" strokeWidth={5} strokeLinecap="round"
              pathLength={100}
            />
            {/* foreground arc - driven by conf 0-100 */}
            <path d="M 8 38 A 28 28 0 0 1 64 38"
              fill="none" stroke={arcColor} strokeWidth={5} strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              strokeDashoffset={100 - conf}
              style={{ transition:'stroke-dashoffset .8s cubic-bezier(.34,1.56,.64,1)', transitionDelay:'.1s' }}
            />
            <text x={36} y={38} textAnchor="middle"
              style={{ fontSize:11, fontFamily:'JetBrains Mono', fontWeight:700, fill:'var(--fg)' }}>
              {conf}%
            </text>
          </svg>
        </div>
      </div>

      {!compact && (safeFactors.positive.length > 0 || safeFactors.negative.length > 0) && (
        <div className={s.factors}>
          {safeFactors.positive.map((f,i) => <div key={i} className={s.pos}><TrendingUp  size={11}/>{f}</div>)}
          {safeFactors.negative.map((f,i) => <div key={i} className={s.neg}><TrendingDown size={11}/>{f}</div>)}
        </div>
      )}

      {!compact && actions.length > 0 && (
        <div className={s.actions}>
          <div className={s.actLabel}>Recommended actions</div>
          <ul className={s.actList}>{actions.map((a,i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {!compact && score != null && (
        <div className={s.pdfRow}>
          <PDFReport borrower={{ score, risk, decision:status, confidence, factors: safeFactors, actions, name:applicant, ts:new Date().toISOString() }}/>
        </div>
      )}
    </div>
  );
}
