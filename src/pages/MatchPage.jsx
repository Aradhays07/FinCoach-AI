import { useState, useEffect } from 'react';
import { Card, Button, Badge, Input } from '../components/UI';
import { Search, TrendingUp, IndianRupee, Star } from 'lucide-react';
import { EmptyState } from '../components/States';
import { useBorrower } from '../context/BorrowerContext';
import { useMatchLendersStats } from '../hooks/useApi';
import { api } from '../api';
import s from './MatchPage.module.css';

export default function MatchPage() {
  const { selected, triggerXP } = useBorrower();
  const { data: statsData, refetch: statsRefetch } = useMatchLendersStats();
  const [score,   setScore]   = useState('742');
  const [amount,  setAmount]  = useState('350000');
  const [purpose, setPurpose] = useState('personal');
  const [results, setResults] = useState(null);
  const [resultsMsg, setResultsMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Pre-fill from selected borrower
  useEffect(() => {
    if (!selected) return;
    if (selected.score) setScore(String(Math.round(selected.score)));
    if (selected.features?.INCOME) {
      // Suggest 50% of annual income as loan amount, capped at 50L
      const suggested = Math.min(5000000, Math.round(selected.features.INCOME * 0.5));
      setAmount(String(suggested));
    }
  }, [selected?.id]);

  const run = async () => {
    setLoading(true); setError(''); setResults(null); setResultsMsg('');
    try {
      const res = await api.matchLenders({
        score:  parseInt(score)  || 700,
        amount: parseInt(amount) || 300000,
        purpose,
      });
      setResults(res.matches || []);
      // Backend distinguishes "no lenders in DB at all" (needs seed.py) from
      // "no lenders matched this borrower's criteria" via res.message.
      if (!res.matches?.length && res.message) setResultsMsg(res.message);
      triggerXP('lender_matched');
      statsRefetch(); // pick up the match we just logged
    } catch (err) {
      setError(err.message || 'Lender matching failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Lender–Borrower Matching</h1>
          <p className={s.sub}>Match scored users to the best-fit NBFCs on the platform. Earn a referral fee on every disbursement.</p>
        </div>
        <Badge variant="gold">Marketplace</Badge>
      </div>

      {selected && (
        <div className={s.prefillBanner}>
          <span className={s.prefillDot}/>
          Pre-filled from <strong>{selected.name || 'selected borrower'}</strong> — score {Math.round(selected.score)}
        </div>
      )}

      <div className={s.statsRow}>
        {[
          { label:'Total matches',    val: statsData?.total_matches ?? '—' },
          { label:'Avg match %',      val: statsData?.avg_match_pct != null ? `${statsData.avg_match_pct}%` : '—' },
          { label:'Lenders in pool',  val: statsData?.lenders_in_pool ?? '—' },
        ].map(st => (
          <Card key={st.label} variant="raised" className={s.miniStat}>
            <div className={s.miniLabel}>{st.label}</div>
            <div className={s.miniVal}>{st.val}</div>
          </Card>
        ))}
      </div>

      <div className={s.twoCol}>
        <div>
          <Card variant="raised" className={s.inputCard}>
            <div className={s.cardTitle}>Match a borrower</div>
            <div className={s.fields}>
              <Input label="Credit score"    type="number" placeholder="742"    value={score}  onChange={e => setScore(e.target.value)}  icon={TrendingUp}/>
              <Input label="Loan amount (₹)" type="number" placeholder="350000" value={amount} onChange={e => setAmount(e.target.value)} icon={IndianRupee}/>
              <div className={s.fieldWrap}>
                <label className={s.selectLabel}>Loan purpose</label>
                <select className={s.select} value={purpose} onChange={e => setPurpose(e.target.value)}>
                  <option value="personal">Personal loan</option>
                  <option value="business">Business loan</option>
                  <option value="home">Home loan</option>
                  <option value="vehicle">Vehicle loan</option>
                  <option value="education">Education loan</option>
                </select>
              </div>
            </div>
            {error && <div style={{ fontSize:12,color:'var(--red)',marginBottom:10,padding:'8px 12px',background:'var(--red-light)',borderRadius:'var(--r-sm)' }}>{error}</div>}
            <Button full loading={loading} onClick={run} size="lg">
              <Search size={14}/> Find matching lenders
            </Button>
          </Card>

          {results !== null && (
            <div className={s.results} style={{ marginTop:14 }}>
              <div className={s.resultsHeader}>
                <span>{results.length} lenders matched</span>
                <span>Sorted by match %</span>
              </div>
              {results.length === 0
                ? <EmptyState title="No lenders found" desc={resultsMsg || "No lenders match this profile. If this is a fresh setup, run seed.py first to populate the lender database."}/>
                : results.map((l, i) => (
                  <Card key={l.name || i} variant="raised" className={`${s.lenderCard} ${i === 0 ? s.topMatch : ''}`}>
                    {i === 0 && <div className={s.topBadge}><Star size={9}/> Best match</div>}
                    <div className={s.lenderTop}>
                      <div className={s.lenderAvatar}>{(l.name||'?').slice(0,2).toUpperCase()}</div>
                      <div className={s.lenderInfo}>
                        <div className={s.lenderName}>{l.name}</div>
                        <div className={s.lenderType}>{l.type}</div>
                      </div>
                      <div className={s.matchScore}>
                        <div className={s.matchPct}>{l.match_pct}%</div>
                        <div className={s.matchLabel}>match</div>
                      </div>
                    </div>
                    <div className={s.lenderDetails}>
                      <span>Rate: {l.rate_min}–{l.rate_max}%</span>
                      <span>Max: ₹{(l.max_amount/100000).toFixed(1)}L</span>
                      {l.fee != null && <span>Fee: ₹{l.fee}</span>}
                    </div>
                  </Card>
                ))
              }
            </div>
          )}
        </div>

        <Card variant="raised">
          <div className={s.cardTitle}>Recent matches</div>
          <div className={s.recentList}>
            {!statsData?.recent?.length ? (
              <div style={{ textAlign:'center',padding:'24px 0',fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)' }}>
                No matches run yet — try one on the left.
              </div>
            ) : statsData.recent.map((r, i) => (
              <div key={i} className={s.recentRow}>
                <div className={s.recentAvatar}>{r.score}</div>
                <div className={s.recentBody}>
                  <div className={s.recentUser}>{r.top_match || `${r.match_count} lender${r.match_count === 1 ? '' : 's'} matched`}</div>
                  <div className={s.recentMeta}>{r.match_count} lenders · {r.top_pct != null ? `${r.top_pct}% top match` : ''}</div>
                </div>
                <div className={s.recentRight}>
                  <span className={s.recentTime}>{r.date}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
