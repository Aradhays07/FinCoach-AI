import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Input, Stat, Tag } from '../components/UI';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';
import {
  ShieldCheck, Download, CheckCircle2, AlertCircle,
  Lock, TrendingUp, Building2, MapPin, ChevronRight, Zap, Gauge, RefreshCw, Info
} from 'lucide-react';
import { useBenchmarks, useQuests, useConsentLog, useModelMetrics, useComplianceStats } from '../hooks/useApi';
import { SkeletonCard, SkeletonChart, SkeletonTable, ErrorState, EmptyState } from '../components/States';
import DecisionCard from '../components/DecisionCard';
import { fromCreditScoreResponse } from '../utils/decisionFormatter';
import { useBorrower } from '../context/BorrowerContext';
import { contextService } from '../services/contextService';
import { api } from '../api';
import s from './FeaturePages.module.css';

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.tt}>
      <div className={s.ttL}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color:p.color, fontSize:12, fontWeight:600, fontFamily:'JetBrains Mono' }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

/* ─── BENCHMARKS ─────────────────────────────────────────────────────────── */
export function BenchmarksPage() {
  const { data, loading, error, refetch } = useBenchmarks();
  const bd        = data || {};
  const peerData  = bd.peer_data  || [];
  const stateData = bd.states     || [];

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Cohort Benchmarks</h1>
          <p className={s.sub}>Compare your portfolio against anonymised peer NBFCs on the platform.</p>
        </div>
        <Badge variant="blue">Analytics</Badge>
      </div>
      <div className={s.statsRow}>
        {loading ? [1,2,3,4].map(i => <SkeletonCard key={i}/>) :
         error   ? <div style={{ gridColumn:'1/-1' }}><ErrorState message={error} onRetry={refetch}/></div> : (
          <>
            <Stat label="Your avg score"  value={String(bd.your_avg      ?? '—')} icon={TrendingUp} accent/>
            <Stat label="Platform avg"    value={String(bd.platform_avg  ?? '—')} icon={Building2}/>
            <Stat label="Your NPA rate"   value={bd.your_npa != null   ? `${bd.your_npa}%`   : '—'} icon={AlertCircle}/>
            <Stat label="Platform NPA"    value={bd.platform_npa != null ? `${bd.platform_npa}%` : '—'} icon={AlertCircle}/>
          </>
        )}
      </div>
      <div className={s.twoCol}>
        <Card variant="raised">
          <div className={s.cardTitle} style={{ marginBottom:14 }}>Score vs NPA — peer comparison</div>
          {loading ? <SkeletonChart height={200}/> : error ? <ErrorState message={error} onRetry={refetch}/> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={peerData} margin={{ left:-20, right:0, top:4 }} barCategoryGap="35%">
                  <XAxis dataKey="name" tick={{ fill:'var(--fg-3)', fontSize:10, fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill:'var(--fg-3)', fontSize:10, fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false}/>
                  <Tooltip content={<TT/>}/>
                  <Bar dataKey="score" name="Score" radius={[4,4,0,0]}>
                    {peerData.map((d,i) => <Cell key={i} fill={d.name === 'Your platform' ? 'var(--gold)' : 'var(--fg-4)'}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {bd.peer_data_note && (
                <p style={{ fontSize:10, color:'var(--fg-3)', marginTop:8, lineHeight:1.5 }}>{bd.peer_data_note}</p>
              )}
            </>
          )}
        </Card>
        <Card variant="raised">
          <div className={s.cardTitle} style={{ marginBottom:14 }}>Score by state</div>
          {loading ? <SkeletonTable rows={6} cols={3}/> :
           stateData.length === 0 ? <EmptyState title="No state data"/> :
           stateData.map(d => (
            <div key={d.state} className={s.stateRow}>
              <span className={s.stateLabel}><MapPin size={10}/> {d.state}</span>
              <div className={s.stateBar}><div className={s.stateBarFill} style={{ width:`${Math.max(0,Math.min(100,((d.score-650)/150)*100))}%` }}/></div>
              <span className={s.stateScore}>{d.score}</span>
            </div>
          ))}
        </Card>
      </div>
      {!loading && !error && bd.your_avg != null && bd.platform_avg != null && (
        <Card variant="flat" className={s.insightCard}>
          <div className={s.insightTitle}>Key insight</div>
          <p>Your platform's average credit score is <strong>
            {Math.abs(Math.round((bd.your_avg - bd.platform_avg) * 10) / 10)} points
            {bd.your_avg >= bd.platform_avg ? ' above' : ' below'}
          </strong> the platform-wide average.{' '}
          {bd.your_npa != null && bd.platform_npa != null && (
            bd.your_npa < bd.platform_npa
              ? 'Your NPA rate is lower than the platform average, suggesting room to tighten risk appetite without much revenue impact.'
              : bd.your_npa > bd.platform_npa
              ? 'Your NPA rate is higher than the platform average — consider reviewing your approval thresholds.'
              : 'Your NPA rate is in line with the platform average.'
          )}</p>
        </Card>
      )}
    </div>
  );
}

/* ─── COMPLIANCE ─────────────────────────────────────────────────────────── */
export function CompliancePage() {
  const { data: consentData, loading: cLoading, error: cError, refetch: cRefetch } = useConsentLog();
  const { data: statsData, refetch: statsRefetch } = useComplianceStats();
  const { triggerXP } = useBorrower();
  const consentLog = Array.isArray(consentData) ? consentData : [];
  const [exporting, setExporting] = useState(false);
  const [exported,  setExported]  = useState(false);
  const [exportErr, setExportErr] = useState('');

  const doExport = async () => {
    setExporting(true); setExportErr('');
    try {
      // FIX: this previously just waited 1.2s and showed a checkmark with
      // no real API call — "Generate audit bundle" produced nothing. Call
      // the real endpoint and actually download the resulting JSON bundle.
      const bundle = await api.complianceExport();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `fineasy-audit-bundle-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
      setExported(true);
      triggerXP('audit_exported');
      statsRefetch(); // pick up the export we just recorded
      setTimeout(() => setExported(false), 3000);
    } catch (err) {
      setExportErr(err.message || 'Export failed. Is the backend running?');
    } finally {
      setExporting(false);
    }
  };

  // FIX: every one of these was either a fake "|| N" fallback masking a
  // genuine zero (a brand-new account with 0 real consents would show
  // "3204" as if it were real), a hardcoded literal ('91%', 14) never
  // computed from anything, or a made-up trend percentage with no real
  // historical baseline behind it. All four are now either real computed
  // values or an honest '—' when there's nothing to compute from yet.
  const activeCount   = consentLog.filter(c => c.status === 'active').length;
  const revokedCount  = consentLog.filter(c => c.status === 'revoked').length;
  const consentRate   = consentLog.length ? Math.round(100 * activeCount / consentLog.length) : null;
  const exportCount   = statsData?.export_count;

  const statNums = [
    { label:'Active consents', val: consentLog.length ? activeCount : '—' },
    { label:'Consent rate',    val: consentRate != null ? `${consentRate}%` : '—' },
    { label:'Revocations',     val: consentLog.length ? revokedCount : '—' },
    { label:'Audit exports',   val: exportCount != null ? exportCount : '—' },
  ];

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Compliance & DPDP</h1>
          <p className={s.sub}>DPDP Act 2023-compliant consent management, immutable audit logs, and one-click RBI export.</p>
        </div>
        <Badge variant="green">DPDP Ready</Badge>
      </div>
      <div className={s.statsRow}>
        {statNums.map(st => <Stat key={st.label} label={st.label} value={String(st.val)} change={st.chg} icon={ShieldCheck}/>)}
      </div>
      <div className={s.twoCol}>
        <Card variant="raised">
          <div className={s.sectionHead}>
            <div className={s.cardTitle}>Consent log</div>
            <Badge variant="default">{consentLog.length} recent</Badge>
          </div>
          {cLoading ? <SkeletonTable rows={4} cols={3}/> :
           cError   ? <ErrorState message={cError} onRetry={cRefetch}/> :
           consentLog.length === 0
            ? <EmptyState title="No consent records" desc="Consent events will appear here once users interact with the platform."/>
            : consentLog.map((c, i) => (
              <div key={`${c.user || ''}-${i}`} className={s.consentRow}>
                <div className={s.consentLeft}>
                  <div className={`${s.consentDot} ${c.status === 'active' ? s.dotGreen : s.dotRed}`}/>
                  <div>
                    <div className={s.consentUser}>{c.user}</div>
                    <div className={s.consentModules}>{Array.isArray(c.modules) ? c.modules.join(' · ') : c.modules}</div>
                  </div>
                </div>
                <div className={s.consentRight}>
                  <Badge variant={c.status === 'active' ? 'green' : 'red'}>{c.status}</Badge>
                  <span className={s.consentDate}>{c.date}</span>
                </div>
              </div>
            ))
          }
        </Card>
        <div className={s.complianceRight}>
          <Card variant="raised">
            <div className={s.cardTitle} style={{ marginBottom:12 }}>RBI audit export</div>
            <p className={s.exportDesc}>Generate a complete audit bundle — consent records, credit decisions, SHAP values, and model version metadata — formatted to RBI Digital Lending Guidelines.</p>
            <div className={s.exportMeta}>
              {['Consent audit trail','Credit decision log with SHAP','Model version & accuracy report','Data processing register (DPDP)'].map(item => (
                <div key={item} className={s.exportItem}><CheckCircle2 size={12} className={s.chk}/> {item}</div>
              ))}
            </div>
            <Button full loading={exporting} onClick={doExport}>
              {exported ? <><CheckCircle2 size={13}/> Exported!</> : <><Download size={13}/> Generate audit bundle</>}
            </Button>
            {exportErr && <div style={{ fontSize:12,color:'var(--red)',marginTop:8 }}>{exportErr}</div>}
          </Card>
          <Card variant="flat">
            <div className={s.cardTitle} style={{ marginBottom:10 }}>Data retention policy</div>
            {[['Credit scores','7 years'],['Consent records','Permanent'],['API call logs','90 days'],['SHAP reports','7 years']].map(([k,v]) => (
              <div key={k} className={s.retRow}><span>{k}</span><span>{v}</span></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─── CREDIT SCORE ───────────────────────────────────────────────────────── */
// FIX (bugs #2 and #11): the model expects 85 features — INCOME/DEBT/SAVINGS
// plus per-category (clothing, education, entertainment, fines, gambling,
// groceries, health, housing, tax, travel, utilities) spend ratios. This form
// previously only collected ~6 values and zero-filled the rest, so every
// score was computed against a "no spending in any category" baseline. These
// optional fields let the user enter real category spend; left blank it
// still defaults to 0, but now that's real user input, not a wiring gap.
const SPEND_CATEGORIES = [
  { key: 'CLOTHING',      label: 'Clothing (₹/yr)',        placeholder: '24000'  },
  { key: 'EDUCATION',     label: 'Education (₹/yr)',       placeholder: '60000'  },
  { key: 'ENTERTAINMENT', label: 'Entertainment (₹/yr)',   placeholder: '30000'  },
  { key: 'FINES',         label: 'Fines & penalties (₹/yr)', placeholder: '0'    },
  { key: 'GROCERIES',     label: 'Groceries (₹/yr)',       placeholder: '96000'  },
  { key: 'HEALTH',        label: 'Healthcare (₹/yr)',      placeholder: '36000'  },
  { key: 'HOUSING',       label: 'Housing / rent (₹/yr)',  placeholder: '144000' },
  { key: 'TAX',           label: 'Tax payments (₹/yr)',    placeholder: '48000'  },
  { key: 'TRAVEL',        label: 'Travel (₹/yr)',          placeholder: '30000'  },
  { key: 'UTILITIES',     label: 'Utilities (₹/yr)',       placeholder: '24000'  },
];

export function CreditScorePage() {
  const navigate = useNavigate();
  const { addScoreToHistory, triggerXP, selected: _sel } = useBorrower();

  const catFormFromFeatures = (f) =>
    Object.fromEntries(SPEND_CATEGORIES.map(c => {
      const v = f?.[`T_${c.key}_12`];
      return [c.key, v ? String(Math.round(v)) : ''];
    }));

  const [form, setForm] = useState(() => {
    const f = _sel?.features || {};
    return {
      borrowerName:     _sel?.name || '',
      INCOME:           f.INCOME           ? String(Math.round(f.INCOME))           : '',
      DEBT:             f.DEBT             ? String(Math.round(f.DEBT))             : '',
      SAVINGS:          f.SAVINGS          ? String(Math.round(f.SAVINGS))          : '',
      T_EXPENDITURE_12: f.T_EXPENDITURE_12 ? String(Math.round(f.T_EXPENDITURE_12)) : '',
      R_GAMBLING:       f.R_GAMBLING != null ? String(f.R_GAMBLING) : '0',
    };
  });
  const [catForm, setCatForm] = useState(() => catFormFromFeatures(_sel?.features));
  const [showCategories, setShowCategories] = useState(false);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const setCat = k => e => setCatForm(p => ({ ...p, [k]: e.target.value }));

  // Pre-fill when selected borrower changes
  useEffect(() => {
    if (!_sel?.features) return;
    const f = _sel.features;
    setForm({
      borrowerName:     _sel.name || '',
      INCOME:           f.INCOME           ? String(Math.round(f.INCOME))           : '',
      DEBT:             f.DEBT             ? String(Math.round(f.DEBT))             : '',
      SAVINGS:          f.SAVINGS          ? String(Math.round(f.SAVINGS))          : '',
      T_EXPENDITURE_12: f.T_EXPENDITURE_12 ? String(Math.round(f.T_EXPENDITURE_12)) : '',
      R_GAMBLING:       f.R_GAMBLING != null ? String(f.R_GAMBLING) : '0',
    });
    setCatForm(catFormFromFeatures(f));
    setResult(null);
  }, [_sel?.id]);

  const predict = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const income  = parseFloat(form.INCOME)           || 720000;
      const debt    = parseFloat(form.DEBT)             || 0;
      const savings = parseFloat(form.SAVINGS)          || income * 0.15;
      const gamble  = parseFloat(form.R_GAMBLING)       || 0;

      const catValues = {};
      SPEND_CATEGORIES.forEach(c => { catValues[c.key] = parseFloat(catForm[c.key]) || 0; });
      const catTotal = Object.values(catValues).reduce((a, b) => a + b, 0);
      const other    = parseFloat(form.T_EXPENDITURE_12) || 0;
      const expend   = catTotal + other || income * 0.6; // fall back if nothing entered

      const features = {
        INCOME:  income, DEBT: debt, SAVINGS: savings,
        R_DEBT_INCOME:        debt    / (income  || 1),
        R_SAVINGS_INCOME:     savings / (income  || 1),
        R_DEBT_SAVINGS:       debt    / (savings || 1),
        T_EXPENDITURE_12:     expend,
        T_EXPENDITURE_6:      expend / 2,
        R_EXPENDITURE_INCOME: expend  / (income  || 1),
        R_EXPENDITURE:        expend  / (income  || 1),
        R_EXPENDITURE_SAVINGS: expend / (savings || 1),
        R_EXPENDITURE_DEBT:    expend / (debt    || 1),
        R_GAMBLING:           gamble,
        R_GAMBLING_INCOME:    gamble  / (income  || 1),
        R_GAMBLING_SAVINGS:   (gamble * income) / (savings || 1),
        R_GAMBLING_DEBT:      (gamble * income) / (debt    || 1),
        T_GAMBLING_12:        gamble * income,
        T_GAMBLING_6:         (gamble * income) / 2,
        CAT_DEBT:             debt > 0  ? 1 : 0,
        CAT_CREDIT_CARD:      1,
        CAT_SAVINGS_ACCOUNT:  savings > 0 ? 1 : 0,
        CAT_MORTGAGE:         0,
        CAT_DEPENDENTS:       0,
        CAT_GAMBLING_No:      gamble === 0 ? 1 : 0,
        CAT_GAMBLING_Low:     (gamble > 0 && gamble < 0.05) ? 1 : 0,
      };

      SPEND_CATEGORIES.forEach(c => {
        const v12 = catValues[c.key];
        features[`T_${c.key}_12`]     = v12;
        features[`T_${c.key}_6`]      = v12 / 2;
        features[`R_${c.key}`]        = v12 / (income  || 1);
        features[`R_${c.key}_INCOME`] = v12 / (income  || 1);
        features[`R_${c.key}_SAVINGS`] = v12 / (savings || 1);
        features[`R_${c.key}_DEBT`]    = v12 / (debt    || 1);
      });

      const res = await api.creditScore(features);
      const decision = fromCreditScoreResponse(res);
      setResult({ ...decision, applicant: form.borrowerName || undefined });

      // Save to borrower context + sync contextService + trigger XP
      addScoreToHistory(form.borrowerName, decision, features);
      contextService.recordDecision(decision.score, decision);
      triggerXP('credit_scored');
    } catch (err) {
      setError(err.message || 'Prediction failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const _income  = parseFloat(form.INCOME)           || 720000;
  const _debt    = parseFloat(form.DEBT)             || 0;
  const _savings = parseFloat(form.SAVINGS)          || _income * 0.15;
  const _catTotal = SPEND_CATEGORIES.reduce((sum, c) => sum + (parseFloat(catForm[c.key]) || 0), 0);
  const _other   = parseFloat(form.T_EXPENDITURE_12) || 0;
  const _expend  = (_catTotal + _other) || _income * 0.6;
  const _gamble  = parseFloat(form.R_GAMBLING)       || 0;

  const radarData = [
    // Income: normalised against ₹20L max (realistic NBFC borrower ceiling)
    { f: 'Income',      v: Math.min(100, Math.round((_income / 2000000) * 100)) },
    // Savings ratio: how much saved vs income (target 20% = 100 score)
    { f: 'Savings',     v: Math.min(100, Math.round((_savings / _income) * 500)) },
    // Low Debt: inverse of debt-to-income ratio (0% DTI = 100, 50%+ DTI = 0)
    { f: 'Low Debt',    v: Math.max(0, Math.round(100 - (_debt / _income) * 200)) },
    // Spending discipline: lower spend = better (60% spend = 40 score, 30% = 70 score)
    { f: 'Spending',    v: Math.max(0, Math.round(100 - (_expend / _income) * 100)) },
    // No Gambling: continuous scale — 0 = 100, 0.1 = 80, 0.5 = 0
    { f: 'No Gambling', v: Math.max(0, Math.round(100 - _gamble * 200)) },
  ];

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Credit Score Predictor</h1>
          <p className={s.sub}>ML ensemble model with SHAP explainability. See <a href="/dashboard/metrics" style={{ color:'var(--gold)' }}>Model Metrics</a> for live latency, coverage, and validation figures.</p>
        </div>
        <Badge variant="green">ML v2.4</Badge>
      </div>
      <div className={s.twoCol}>
        <Card variant="raised">
          <div className={s.cardTitle} style={{ marginBottom:16 }}>Input features</div>
          <div className={s.csFields}>
            <Input label="Borrower name (optional)" type="text" placeholder="Rahul Sharma" value={form.borrowerName} onChange={set('borrowerName')} hint="Used to identify in history"/>
            <Input label="Annual income (₹)"         type="number" placeholder="720000" value={form.INCOME}           onChange={set('INCOME')}/>
            <Input label="Total debt (₹)"            type="number" placeholder="120000" value={form.DEBT}             onChange={set('DEBT')}/>
            <Input label="Annual savings (₹)"        type="number" placeholder="108000" value={form.SAVINGS}          onChange={set('SAVINGS')}/>
            <Input label="Gambling ratio (0–1)"       type="number" placeholder="0"     value={form.R_GAMBLING}       onChange={set('R_GAMBLING')} hint="0 = none"/>
          </div>

          <button
            type="button"
            onClick={() => setShowCategories(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'var(--gold)', fontSize:12, fontWeight:600, cursor:'pointer', padding:'4px 0 12px', width:'100%' }}
          >
            <ChevronRight size={12} style={{ transform: showCategories ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}/>
            Spend breakdown by category {_catTotal > 0 ? `(₹${Math.round(_catTotal).toLocaleString('en-IN')}/yr entered)` : '(optional, improves accuracy)'}
          </button>

          {showCategories && (
            <div className={s.csFields} style={{ marginBottom:8 }}>
              {SPEND_CATEGORIES.map(c => (
                <Input key={c.key} label={c.label} type="number" placeholder={c.placeholder}
                  value={catForm[c.key]} onChange={setCat(c.key)}/>
              ))}
              <Input label="Other / miscellaneous annual spend (₹)" type="number" placeholder="0"
                value={form.T_EXPENDITURE_12} onChange={set('T_EXPENDITURE_12')}
                hint="Anything not covered above"/>
            </div>
          )}

          {error && <div style={{ fontSize:12,color:'var(--red)',marginBottom:10,padding:'8px 12px',background:'var(--red-light)',borderRadius:'var(--r-sm)' }}>{error}</div>}
          <Button full loading={loading} onClick={predict} size="lg">Run prediction →</Button>
        </Card>

        <div className={s.resultCol}>
          {result ? (
            <>
              <DecisionCard {...result}/>
              <div className={s.quickActions}>
                <div className={s.qaLabel}><Zap size={11}/> Quick actions</div>
                <div className={s.qaRow}>
                  <button className={s.qaBtn} onClick={() => navigate('/dashboard/match')}>
                    Find lenders <ChevronRight size={12}/>
                  </button>
                  <button className={s.qaBtn} onClick={() => navigate('/dashboard/trajectory')} style={{ background:'var(--green-light)', color:'var(--green)', borderColor:'rgba(45,224,138,0.25)' }}>
                    View roadmap <ChevronRight size={12}/>
                  </button>
                  <button className={s.qaBtn} onClick={() => navigate('/dashboard/playbook')}>
                    Generate playbook <ChevronRight size={12}/>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <Card variant="raised">
              <div className={s.cardTitle} style={{ marginBottom:14 }}>Credit factor radar</div>
              <ResponsiveContainer width="100%" height={270}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border-2)"/>
                  <PolarAngleAxis dataKey="f" tick={{ fill:'var(--fg-3)', fontSize:10, fontFamily:'JetBrains Mono' }}/>
                  <Radar dataKey="v" stroke="var(--gold)" fill="var(--gold)" fillOpacity={0.1} strokeWidth={2}/>
                  <Tooltip content={<TT/>}/>
                </RadarChart>
              </ResponsiveContainer>
              <p className={s.radarHint}>Fill in the form and run a prediction to see the decision.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── QUESTS ─────────────────────────────────────────────────────────────── */
export function QuestsPage() {
  const { data: questsData, loading, error, refetch } = useQuests();
  const { completedQuests } = useBorrower();
  const quests = Array.isArray(questsData) ? questsData.map(q => ({
    ...q,
    done: q.done || completedQuests.includes(q.id),
  })) : [];
  const done    = quests.filter(q => q.done);
  const totalXp = done.reduce((a, q)   => a + (q.xp || 0), 0);
  const maxXp   = quests.reduce((a, q) => a + (q.xp || 0), 0) || 1;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Quest System</h1>
          <p className={s.sub}>Complete quests to unlock platform features and earn XP.</p>
        </div>
        {!loading && <Badge variant="gold">{done.length}/{quests.length} complete</Badge>}
      </div>
      <Card variant="raised" className={s.xpCard}>
        <div>
          <div className={s.xpLabel}>XP earned</div>
          <div className={s.xpVal}>{totalXp.toLocaleString()} <span>/ {maxXp.toLocaleString()}</span></div>
        </div>
        <div className={s.xpBarCol}>
          <div className={s.xpBarOuter}><div className={s.xpBarInner} style={{ width:`${(totalXp/maxXp)*100}%` }}/></div>
          <div className={s.xpPct}>{Math.round((totalXp/maxXp)*100)}% complete</div>
        </div>
      </Card>
      {error ? <ErrorState message={error} onRetry={refetch}/> :
       loading ? <div className={s.questGrid}>{[1,2,3,4,5,6,7,8].map(i => <SkeletonCard key={i}/>)}</div> :
       quests.length === 0 ? <EmptyState title="No quests available" desc="Quests will appear once you set up your account."/> : (
        <div className={s.questGrid}>
          {quests.map(q => (
            <Card key={q.id} variant={q.done ? 'flat' : 'raised'} className={s.questCard}>
              <div className={s.questTop}>
                <Tag color={q.done ? 'green' : 'gray'}>{q.tag}</Tag>
                <span className={s.questXp}>{q.xp} XP</span>
              </div>
              <div className={s.questCheck}>
                {q.done
                  ? <CheckCircle2 size={18} style={{ color:'var(--green)' }}/>
                  : <Lock        size={18} style={{ color:'var(--fg-3)' }}/>
                }
              </div>
              <h3 className={s.questTitle}>{q.title}</h3>
              <p className={s.questDesc}>{q.desc || ''}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── PLAYBOOK ───────────────────────────────────────────────────────────── */
export function PlaybookPage() {
  const { selected: _pbSel, triggerXP } = useBorrower();
  const [goal,    setGoal]    = useState('');
  const [score,   setScore]   = useState(_pbSel?.score ? String(Math.round(_pbSel.score)) : '742');

  useEffect(() => {
    if (_pbSel?.score) setScore(String(Math.round(_pbSel.score)));
  }, [_pbSel?.id]);
  const [result,  setResult]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const generate = async () => {
    if (!goal.trim()) return;
    setLoading(true); setResult(''); setError('');
    try {
      const parsedScore = parseInt(score);
      const res = await api.playbook({ goal, score: Number.isFinite(parsedScore) ? parsedScore : undefined });
      setResult(res.advice || res.content || 'No playbook generated.');
      triggerXP('playbook_gen');
    } catch (err) {
      setError(err.message || 'Playbook generation failed. Check your Gemini API key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>AI Financial Playbook</h1>
          <p className={s.sub}>Gemini-powered personalised financial roadmaps for your end users.</p>
        </div>
        <Badge variant="blue">Gemini Pro</Badge>
      </div>
      {_pbSel && (
        <div className={s.contextBanner}>
          <span className={s.ctxDot}/>
          Loaded from selected borrower: <strong>{_pbSel.name || 'Unknown'}</strong> · Score {Math.round(_pbSel.score)} · {_pbSel.risk} risk
        </div>
      )}
      <div className={s.twoCol}>
        <Card variant="raised">
          <div className={s.cardTitle} style={{ marginBottom:14 }}>Generate playbook</div>
          <div className={s.pbFields}>
            <div className={s.fieldWrap2}>
              <label className={s.fLabel}>User's financial goal</label>
              <textarea className={s.textarea} rows={3}
                placeholder="e.g. How can I retire in 15 years on ₹60,000/month salary?"
                value={goal} onChange={e => setGoal(e.target.value)}/>
            </div>
            <Input label="User's credit score" type="number" placeholder="742"
              value={score} onChange={e => setScore(e.target.value)}/>
          </div>
          {error && <div style={{ fontSize:12,color:'var(--red)',marginBottom:10,padding:'8px 12px',background:'var(--red-light)',borderRadius:'var(--r-sm)' }}>{error}</div>}
          <Button full loading={loading} onClick={generate} size="lg">Generate with Gemini →</Button>
          {result && (
            <div className={s.pbResult}>
              {result.split('\n').map((line, i) => (
                <p key={i} className={line.startsWith('Step') || line.startsWith('Financial') || line.startsWith('#') || line.startsWith('**') ? s.pbBold : s.pbLine}>
                  {line.replace(/^\*\*|\*\*$/g, '')}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card variant="raised">
          <div className={s.cardTitle} style={{ marginBottom:14 }}>Recent playbooks</div>
          {recentPb.length === 0 ? (
            <div style={{ fontSize:12,color:'var(--fg-3)',padding:'20px 0',textAlign:'center',fontFamily:'var(--font-mono)' }}>
              No playbooks generated yet
            </div>
          ) : recentPb.map((p, i) => (
            <div key={i} className={s.pbHistRow}>
              <div className={s.pbHistAvatar}>{p.score ?? '—'}</div>
              <div className={s.pbHistBody}>
                <div className={s.pbHistUser}>{p.goal?.slice(0,40)}{p.goal?.length > 40 ? '…' : ''}</div>
                <div className={s.pbHistGoal}>Score: {p.score ?? '—'}</div>
              </div>
              <span className={s.pbHistDate}>{p.date}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ─── MODEL METRICS (proof of calculation) ──────────────────────────────────
 * Every number on this page comes straight from GET /model/metrics, which
 * measures the live model (latency), the actual SHAP pipeline (explainability
 * coverage), and runs a real trajectory simulation against stored/synthetic
 * applicants (NTC uplift). Scoring accuracy is intentionally NOT shown as a
 * percentage unless real labelled outcomes are supplied via /model/validate —
 * this app previously hardcoded "94% accuracy" with nothing behind it, which
 * is exactly what this page replaces.
 */
function MetricStat({ label, value, sub, tone = 'default' }) {
  return (
    <Card variant="flat" style={{ padding:'16px 18px' }}>
      <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--fg-3)', fontFamily:'var(--font-mono)', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: tone === 'muted' ? 'var(--fg-3)' : 'var(--fg-1)', fontFamily:'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--fg-3)', marginTop:4 }}>{sub}</div>}
    </Card>
  );
}

export function ModelMetricsPage() {
  const { data, loading, error, refetch } = useModelMetrics();
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState(null);
  const [validateErr, setValidateErr] = useState('');

  const runQuickValidate = async () => {
    // Small illustrative call using 3 synthetic labelled records, purely to
    // demonstrate the /model/validate flow inline — a real backtest should
    // POST actual historical outcomes instead.
    setValidating(true); setValidateErr(''); setValidateResult(null);
    try {
      const res = await api.validateModel({
        records: [
          { features: { INCOME: 720000, DEBT: 100000, SAVINGS: 150000, R_DEBT_INCOME: 0.14, R_SAVINGS_INCOME: 0.21 }, actual_score: 760 },
          { features: { INCOME: 300000, DEBT: 200000, SAVINGS: 5000,  R_DEBT_INCOME: 0.67, R_SAVINGS_INCOME: 0.02 }, actual_score: 540 },
          { features: { INCOME: 500000, DEBT: 150000, SAVINGS: 60000, R_DEBT_INCOME: 0.30, R_SAVINGS_INCOME: 0.12 }, actual_score: 660 },
        ],
      });
      setValidateResult(res);
    } catch (err) {
      setValidateErr(err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Model metrics</h1>
          <p className={s.sub}>Proof of calculation — every figure below is measured live against the running model, not a hardcoded claim.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch}><RefreshCw size={13}/> Refresh</Button>
      </div>

      {loading && <SkeletonCard/>}
      {error && <ErrorState message={error} onRetry={refetch}/>}

      {data && (
        <>
          <div className={s.statsRow}>
            <MetricStat
              label="Model latency (p50)"
              value={`${data.model_latency?.p50 ?? '—'} ms`}
              sub={`mean ${data.model_latency?.mean}ms · p95 ${data.model_latency?.p95}ms · ${data.model_latency?.samples} live samples`}
            />
            <MetricStat
              label="Explainability coverage"
              value={`${data.explainability_coverage?.feature_level_coverage_pct ?? '—'}%`}
              sub={`${data.explainability_coverage?.feature_count} model features individually SHAP-attributed`}
            />
            <MetricStat
              label="NTC approval uplift"
              value={data.ntc_approval_uplift?.available ? `+${data.ntc_approval_uplift.uplift_pct_points} pts` : 'N/A'}
              sub={data.ntc_approval_uplift?.available
                ? `${data.ntc_approval_uplift.standard_policy_90d_viability_pct}% → ${data.ntc_approval_uplift.ntc_relaxed_policy_90d_viability_pct}% viable in 90d`
                : data.ntc_approval_uplift?.reason}
            />
            <MetricStat
              label="Scoring accuracy"
              value="No ground truth"
              sub="Needs real outcome data — see below"
              tone="muted"
            />
          </div>

          <div className={s.twoCol}>
            <Card variant="raised">
              <div className={s.cardTitle} style={{ marginBottom:10 }}>NTC approval uplift — methodology</div>
              {data.ntc_approval_uplift?.available ? (
                <>
                  <p className={s.exportDesc}>{data.ntc_approval_uplift.method}</p>
                  <div className={s.retRow}><span>Sample size</span><span>{data.ntc_approval_uplift.sample_size}</span></div>
                  <div className={s.retRow}><span>Sample source</span><span style={{ textAlign:'right', maxWidth:260 }}>{data.ntc_approval_uplift.sample_source}</span></div>
                  <div className={s.retRow}><span>Standard policy (720 target)</span><span>{data.ntc_approval_uplift.standard_policy_90d_viability_pct}% viable</span></div>
                  <div className={s.retRow}><span>NTC-relaxed policy (600 target)</span><span>{data.ntc_approval_uplift.ntc_relaxed_policy_90d_viability_pct}% viable</span></div>
                </>
              ) : (
                <p className={s.exportDesc}>{data.ntc_approval_uplift?.reason}</p>
              )}
            </Card>

            <Card variant="raised">
              <div className={s.cardTitle} style={{ marginBottom:10 }}><Info size={13} style={{ verticalAlign:-2 }}/> Scoring accuracy — why it's blank</div>
              <p className={s.exportDesc}>{data.scoring_accuracy?.reason}</p>
              <p className={s.exportDesc} style={{ marginTop:8 }}>{data.scoring_accuracy?.how_to_get_a_real_number}</p>
              <Button size="sm" variant="outline" loading={validating} onClick={runQuickValidate} style={{ marginTop:10 }}>
                Try it with 3 sample records
              </Button>
              {validateErr && <div style={{ fontSize:12,color:'var(--red)',marginTop:8 }}>{validateErr}</div>}
              {validateResult && (
                <div style={{ marginTop:10, fontSize:12, fontFamily:'var(--font-mono)' }}>
                  <div className={s.retRow}><span>R²</span><span>{validateResult.r2}</span></div>
                  <div className={s.retRow}><span>MAE</span><span>{validateResult.mae}</span></div>
                  <div className={s.retRow}><span>RMSE</span><span>{validateResult.rmse}</span></div>
                </div>
              )}
            </Card>
          </div>

          {data.explainability_coverage?.decision_level && (
            <Card variant="flat" style={{ marginTop:16 }}>
              <div className={s.cardTitle} style={{ marginBottom:8 }}>Decision-level explainability (from stored records)</div>
              <div className={s.retRow}><span>Total scored records</span><span>{data.explainability_coverage.decision_level.total_scored_records}</span></div>
              <div className={s.retRow}><span>Records with SHAP stored</span><span>{data.explainability_coverage.decision_level.records_with_stored_shap}</span></div>
              <p className={s.exportDesc} style={{ marginTop:8 }}>{data.explainability_coverage.decision_level.note}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
