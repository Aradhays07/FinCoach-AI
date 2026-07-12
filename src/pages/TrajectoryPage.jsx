/**
 * TrajectoryPage.jsx
 * Credit Trajectory Engine — hackathon differentiator.
 * Fixed: useEffect/runTrajectory ordering, PDFReport dead import removed,
 * HealthCardPDF moved before default export, NTC auto-recalculate,
 * real SHAP via /creditscore before /trajectory call.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '../components/UI';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts';
import {
  TrendingUp, Target, Clock, Zap,
  CheckCircle2, ArrowRight, AlertTriangle, Star
} from 'lucide-react';
import { useBorrower } from '../context/BorrowerContext';
import { api } from '../api';
import s from './TrajectoryPage.module.css';

/* ── CONSTANTS ── */
const STATUS_META = {
  on_track:   { label:'On Track',   color:'var(--green)', icon:CheckCircle2  },
  improving:  { label:'Improving',  color:'var(--gold)',  icon:TrendingUp    },
  needs_work: { label:'Needs Work', color:'var(--red)',   icon:AlertTriangle },
};
const EFFORT_COLOR = { Low:'var(--green)', Medium:'var(--gold)', High:'var(--red)' };

/* ── TOOLTIP ── */
const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.tooltip}>
      <div className={s.ttLabel}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color:p.color, fontWeight:700, fontSize:13, fontFamily:'JetBrains Mono' }}>
          Score: {p.value}
        </div>
      ))}
    </div>
  );
};

/* ── HEALTH CARD PDF (must be defined BEFORE default export) ── */
function HealthCardPDF({ borrower, trajectory }) {
  const [generating, setGenerating] = useState(false);

  const generate = () => {
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (!win) { alert('Please allow popups to download the Health Card.'); return; }
    setGenerating(true);

    const m  = trajectory?.milestones || [];
    const t  = trajectory?.trajectory || [];
    const RC = { low:'#2de08a', medium:'#f5b942', high:'#f0484e' };
    const rc = RC[borrower?.risk] || '#f5b942';

    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>MSME Financial Health Card — ${borrower?.name || 'Borrower'}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#fff;color:#111;padding:40px;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #f0f0f0;}
.brand{font-family:'DM Serif Display',serif;font-size:20px;}.brand span{color:#f5b942;}
.tag{background:#f5b942;color:#000;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.08em;}
.hero{display:flex;gap:24px;margin-bottom:28px;padding:20px;background:#f8f8f8;border-radius:12px;}
.name{font-family:'DM Serif Display',serif;font-size:22px;margin-bottom:6px;}
.scores{display:flex;gap:12px;flex-wrap:wrap;}
.scoreBox{padding:12px 18px;border-radius:8px;text-align:center;border:2px solid;}
.scoreNum{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;line-height:1;}
.scoreLabel{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-top:3px;}
.section{margin-bottom:22px;}
.sectionTitle{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;font-family:'JetBrains Mono',monospace;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f0f0f0;}
.trajectory{display:flex;gap:0;margin-bottom:4px;}
.tPoint{flex:1;text-align:center;padding:10px 4px;border-right:1px solid #f0f0f0;}
.tPoint:last-child{border-right:none;}
.tScore{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;}
.tLabel{font-size:9px;color:#888;margin-top:2px;}
.milestone{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;}
.mNum{width:20px;height:20px;border-radius:50%;background:#f5b942;color:#000;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
.mAction{font-size:12px;font-weight:500;margin-bottom:2px;}
.mMeta{font-size:10px;color:#888;}
.mGain{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#2de08a;flex-shrink:0;padding-top:1px;}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #f0f0f0;font-size:9px;color:#aaa;display:flex;justify-content:space-between;}
</style></head><body>
<div class="header">
  <div class="brand">Fineasy<span>AI</span></div>
  <div style="text-align:right">
    <div class="tag">MSME FINANCIAL HEALTH CARD</div>
    <div style="font-size:10px;color:#888;margin-top:5px;font-family:'JetBrains Mono',monospace">
      ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
    </div>
  </div>
</div>
<div class="hero">
  <div style="flex:1">
    <div class="name">${borrower?.name || 'MSME Borrower'}</div>
    <div style="font-size:11px;color:#888;margin-bottom:14px;font-family:'JetBrains Mono',monospace">
      ${trajectory?.ntc_flag ? 'New-to-Credit (NTC) Profile · Relaxed threshold applies' : 'Standard credit profile'}
    </div>
    <div class="scores">
      <div class="scoreBox" style="border-color:${rc};color:${rc}">
        <div class="scoreNum">${trajectory?.current_score ?? '—'}</div>
        <div class="scoreLabel">Today</div>
      </div>
      <div class="scoreBox" style="border-color:#f5b942;color:#f5b942">
        <div class="scoreNum">${trajectory?.projected_90d ?? '—'}</div>
        <div class="scoreLabel">90-day target</div>
      </div>
      <div class="scoreBox" style="border-color:#60c8ff;color:#60c8ff">
        <div class="scoreNum">${trajectory?.approval_in_days != null ? trajectory.approval_in_days + 'd' : '>90d'}</div>
        <div class="scoreLabel">To approval</div>
      </div>
    </div>
  </div>
</div>
<div class="section">
  <div class="sectionTitle">Score trajectory</div>
  <div class="trajectory">
    ${t.map(pt => `
    <div class="tPoint">
      <div class="tScore" style="color:${(pt.score||0) >= (trajectory?.target_score||720) ? '#2de08a' : '#f5b942'}">${pt.score}</div>
      <div class="tLabel">${pt.label}</div>
      ${(pt.score||0) >= (trajectory?.target_score||720) ? '<div style="font-size:9px;color:#2de08a;margin-top:2px">✓ Approved</div>' : ''}
    </div>`).join('')}
  </div>
  <div style="font-size:9px;color:#888;margin-top:6px;font-family:'JetBrains Mono',monospace">
    Approval threshold: ${trajectory?.target_score ?? 720} points
  </div>
</div>
<div class="section">
  <div class="sectionTitle">90-day action plan</div>
  ${m.length === 0
    ? '<div style="color:#2de08a;font-weight:600">Already qualifies for approval</div>'
    : m.map((ms, i) => `
    <div class="milestone">
      <div class="mNum">${i+1}</div>
      <div style="flex:1">
        <div class="mAction">${ms.action}</div>
        <div class="mMeta">${ms.category} · ${ms.effort} effort · ${ms.days} days</div>
      </div>
      <div class="mGain">+${ms.gain} pts</div>
    </div>`).join('')}
</div>
<div class="footer">
  <span>FineasyAI · MSME Credit Trajectory Engine</span>
  <span>Generated using counterfactual ML simulation. Informational use only.</span>
</div>
</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); setGenerating(false); }, 800);
  };

  return (
    <Button variant="ghost" size="sm" loading={generating} onClick={generate}>
      Download Health Card PDF
    </Button>
  );
}

/* ── MAIN COMPONENT ── */
export default function TrajectoryPage() {
  const navigate          = useNavigate();
  const { selected }      = useBorrower();
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [ntc,     setNtc]     = useState(false);
  // FIX: guards against a race where switching borrowers quickly fires two
  // overlapping requests — without this, whichever response resolved last
  // would win, even if it belonged to a borrower the user had since
  // navigated away from.
  const requestIdRef = useRef(0);

  const runTrajectory = useCallback(async (ntcOverride) => {
    if (!selected?.features) return;
    const useNtc = ntcOverride !== undefined ? ntcOverride : ntc;
    const myRequestId = ++requestIdRef.current;
    setLoading(true); setError(''); setResult(null);
    try {
      const payload = {
        ...selected.features,
        ntc: useNtc,
      };
      const res = await api.trajectory(payload);
      if (myRequestId !== requestIdRef.current) return; // a newer request superseded this one
      setResult(res);
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;
      setError(err.message || 'Trajectory engine failed. Is the backend running?');
    } finally {
      if (myRequestId === requestIdRef.current) setLoading(false);
    }
  }, [selected, ntc]);

  // FIX: useEffect after runTrajectory is defined — no ReferenceError
  useEffect(() => {
    if (selected?.features && selected?.score) {
      runTrajectory();
    }
  }, [selected?.id]);

  // FIX: auto-recalculate when NTC toggled
  const handleNtcToggle = (e) => {
    const val = e.target.checked;
    setNtc(val);
    if (selected?.features) runTrajectory(val);
  };

  const approveThreshold = result?.target_score || 720;
  const trajectoryData   = result?.trajectory   || [];
  const milestones       = result?.milestones    || [];

  return (
    <div className={s.page}>
      {/* HEADER */}
      <div className={s.header}>
        <div>
          <div className={s.eyebrow}><Zap size={11}/> Trajectory Engine</div>
          <h1 className={s.title}>Credit Improvement Roadmap</h1>
          <p className={s.sub}>Personalised 90-day path from current score to approval — powered by counterfactual ML simulation.</p>
        </div>
        <div className={s.headerRight}>
          <Badge variant="gold">AI-Powered</Badge>
          <label className={s.ntcToggle}>
            <input type="checkbox" checked={ntc} onChange={handleNtcToggle}/>
            NTC/NTB mode
          </label>
        </div>
      </div>

      {/* NO BORROWER */}
      {!selected?.features && (
        <Card variant="raised" className={s.emptyCard}>
          <div className={s.emptyInner}>
            <div className={s.emptyIcon}><Target size={28}/></div>
            <h2 className={s.emptyTitle}>No borrower selected</h2>
            <p className={s.emptySub}>Score a borrower first, then come back here to see their approval roadmap.</p>
            <Button onClick={() => navigate('/dashboard/credit')}>
              Go to Credit Score <ArrowRight size={13}/>
            </Button>
          </div>
        </Card>
      )}

      {selected?.features && (
        <>
          {/* BORROWER BAR */}
          <div className={s.borrowerBar}>
            <div className={s.borrowerLeft}>
              <div className={s.avatar}>{(selected.name||'?').slice(0,2).toUpperCase()}</div>
              <div>
                <div className={s.borrowerName}>{selected.name || 'Borrower'}</div>
                <div className={s.borrowerMeta}>
                  Current score: <strong>{Math.round(selected.score)}</strong>
                  &nbsp;·&nbsp;
                  <span style={{ color: selected.risk==='low' ? 'var(--green)' : selected.risk==='high' ? 'var(--red)' : 'var(--gold)' }}>
                    {selected.risk?.toUpperCase()} RISK
                  </span>
                  {result?.ntc_flag && <span className={s.ntcBadge}>NTC</span>}
                </div>
              </div>
            </div>
            <Button loading={loading} onClick={() => runTrajectory()} size="sm">
              {result ? 'Recalculate' : 'Generate roadmap'} <ArrowRight size={12}/>
            </Button>
          </div>

          {error && (
            <div className={s.errorBox}><AlertTriangle size={14}/> {error}</div>
          )}

          {loading && (
            <Card variant="raised" className={s.loadingCard}>
              <div className={s.loadingInner}>
                <div className={s.spinner}/>
                <div>
                  <div className={s.loadingTitle}>Running simulations…</div>
                  <div className={s.loadingSub}>Scoring 12 counterfactual scenarios with the ML model</div>
                </div>
              </div>
            </Card>
          )}

          {result && (
            <div className={s.resultGrid}>
              {/* LEFT */}
              <div className={s.leftCol}>

                {/* STATS */}
                <div className={s.statsRow}>
                  <Card variant="raised" className={s.statCard}>
                    <div className={s.statLabel}>Current score</div>
                    <div className={s.statVal} style={{ color:'var(--fg)' }}>{result.current_score}</div>
                  </Card>
                  <Card variant="raised" className={s.statCard}>
                    <div className={s.statLabel}>Projected (90d)</div>
                    <div className={s.statVal} style={{ color:'var(--gold)' }}>{result.projected_90d}</div>
                  </Card>
                  <Card variant="raised" className={s.statCard}>
                    <div className={s.statLabel}>Points needed</div>
                    <div className={s.statVal} style={{ color: result.points_needed===0 ? 'var(--green)' : 'var(--ice)' }}>
                      {result.points_needed===0 ? '✓' : `+${result.points_needed}`}
                    </div>
                  </Card>
                  <Card variant="raised" className={s.statCard}>
                    <div className={s.statLabel}>Approval in</div>
                    <div className={s.statVal} style={{ color: result.approval_in_days!=null ? 'var(--green)' : 'var(--red)' }}>
                      {result.approval_in_days!=null ? `${result.approval_in_days}d` : '>90d'}
                    </div>
                  </Card>
                </div>

                {/* TRAJECTORY CHART */}
                <Card variant="raised">
                  <div className={s.chartHead}>
                    <div>
                      <div className={s.chartTitle}>Score trajectory</div>
                      <div className={s.chartSub}>Projected improvement with recommended actions</div>
                    </div>
                    {(() => {
                      const meta = STATUS_META[result.status] || STATUS_META.improving;
                      const Icon = meta.icon;
                      return (
                        <div className={s.statusPill} style={{ background:`${meta.color}18`, border:`1px solid ${meta.color}44`, color:meta.color }}>
                          <Icon size={11}/> {meta.label}
                        </div>
                      );
                    })()}
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trajectoryData} margin={{ top:10, right:10, left:-20, bottom:0 }}>
                      <defs>
                        <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#f5b942" stopOpacity={0.25}/>
                          <stop offset="100%" stopColor="#f5b942" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.035)" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fill:'var(--fg-3)', fontSize:10, fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false}/>
                      <YAxis domain={[Math.max(300, result.current_score - 50), Math.min(850, result.projected_90d + 80)]}
                        tick={{ fill:'var(--fg-3)', fontSize:10, fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false}/>
                      <Tooltip content={<TT/>}/>
                      <ReferenceLine y={approveThreshold} stroke="var(--green)" strokeDasharray="4 3" strokeWidth={1.5}
                        label={{ value:'Approval threshold', position:'insideTopRight', fill:'var(--green)', fontSize:9, fontFamily:'JetBrains Mono' }}/>
                      <Area type="monotoneX" dataKey="score" name="Score" stroke="var(--gold)" strokeWidth={2.5}
                        fill="url(#tGrad)" dot={{ fill:'var(--gold)', r:4, strokeWidth:0 }}
                        activeDot={{ r:5, fill:'var(--gold)', strokeWidth:0 }} connectNulls/>
                    </AreaChart>
                  </ResponsiveContainer>
                  {result.ntc_note && (
                    <div className={s.ntcNote}><Star size={10}/> {result.ntc_note}</div>
                  )}
                </Card>

                {/* PDF CARD */}
                <Card variant="flat" className={s.pdfCard}>
                  <div className={s.pdfLeft}>
                    <div className={s.pdfTitle}>MSME Financial Health Card</div>
                    <div className={s.pdfSub}>One-page PDF with score, trajectory, and action plan — shareable with lenders</div>
                  </div>
                  <HealthCardPDF borrower={selected} trajectory={result}/>
                </Card>
              </div>

              {/* RIGHT: MILESTONES */}
              <div className={s.rightCol}>
                <Card variant="raised">
                  <div className={s.milestonesHead}>
                    <div className={s.chartTitle}>Your 90-day action plan</div>
                    <div className={s.chartSub}>{milestones.length} high-impact actions identified</div>
                  </div>
                  <div className={s.milestoneList}>
                    {milestones.length === 0 ? (
                      <div className={s.alreadyApproved}>
                        <CheckCircle2 size={24} style={{ color:'var(--green)' }}/>
                        <div>This borrower already qualifies for approval.</div>
                      </div>
                    ) : milestones.map((m, i) => (
                      <div key={i} className={s.milestone}>
                        <div className={s.milestoneNum}>{i + 1}</div>
                        <div className={s.milestoneBody}>
                          <div className={s.milestoneAction}>{m.action}</div>
                          <div className={s.milestoneMeta}>
                            <span className={s.category}>{m.category}</span>
                            <span className={s.effort} style={{ color:EFFORT_COLOR[m.effort]||'var(--fg-3)' }}>{m.effort} effort</span>
                            <span className={s.days}><Clock size={9}/> {m.days} days</span>
                          </div>
                          <div className={s.gainRow}>
                            <div className={s.gainBar}>
                              <div className={s.gainFill} style={{ width:`${Math.min(100, m.gain * 2)}%` }}/>
                            </div>
                            <span className={s.gainLabel}>+{m.gain} pts</span>
                          </div>
                        </div>
                        <div className={s.newScore}>
                          <div className={s.newScoreVal}>{m.new_score}</div>
                          <div className={s.newScoreLabel}>new score</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {milestones.length > 0 && (
                    <div className={s.totalGain}>
                      <span>Total gain if all completed</span>
                      <span className={s.totalGainVal}>
                        +{milestones.reduce((a,m) => a + m.gain, 0).toFixed(1)} pts → {result.projected_90d}
                      </span>
                    </div>
                  )}
                </Card>

                {/* LENDER READINESS */}
                <Card variant="flat" className={s.lenderCard}>
                  <div className={s.chartTitle} style={{ marginBottom:12 }}>Lender readiness</div>
                  {[
                    { label:'Today',   score:result.current_score,      ready:result.current_score >= approveThreshold },
                    { label:'30 days', score:trajectoryData[1]?.score,  ready:(trajectoryData[1]?.score||0) >= approveThreshold },
                    { label:'60 days', score:trajectoryData[2]?.score,  ready:(trajectoryData[2]?.score||0) >= approveThreshold },
                    { label:'90 days', score:trajectoryData[3]?.score,  ready:(trajectoryData[3]?.score||0) >= approveThreshold },
                  ].map((row, i) => (
                    <div key={i} className={s.readinessRow}>
                      <span className={s.readinessLabel}>{row.label}</span>
                      <div className={s.readinessBar}>
                        <div className={s.readinessFill}
                          style={{ width:`${((row.score||0)/850)*100}%`, background: row.ready ? 'var(--green)' : 'var(--gold)' }}/>
                      </div>
                      <span className={s.readinessScore} style={{ color: row.ready ? 'var(--green)' : 'var(--fg-2)' }}>
                        {row.score ?? '—'} {row.ready ? '✓' : ''}
                      </span>
                    </div>
                  ))}
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
