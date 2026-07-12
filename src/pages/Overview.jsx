import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Stat, Card, Badge } from '../components/UI';
import {
  TrendingUp, Users, Zap, IndianRupee, ArrowUpRight,
  ArrowDownRight, Activity, Layers, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';
import { useTracker } from '../hooks/useApi';
import { SkeletonCard, SkeletonChart, SkeletonTable, ErrorState } from '../components/States';
import ChatPanel from '../components/ChatPanel';
import s from './Overview.module.css';

/* ── CONSTANTS ── */
const RISK_CLR = { high:'#f0484e', medium:'#f5b942', low:'#2de08a', unknown:'#4e5870' };
const SEG_PAL  = ['#2de08a','#60c8ff','#f5b942','#a78bfa','#f0484e'];
const GRID_CLR = 'rgba(255,255,255,0.035)';
const AX       = { fill:'#4e5870', fontSize:10, fontFamily:'JetBrains Mono' };

/* ── TOOLTIP ── */
const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.tooltip}>
      <div className={s.ttLabel}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color:p.color, fontWeight:600, fontSize:11, fontFamily:'JetBrains Mono' }}>
          {p.name}: {typeof p.value === 'number' && p.value > 999 ? p.value.toLocaleString('en-IN') : p.value}
        </div>
      ))}
    </div>
  );
};

/* ── MARKET TICKER (via backend proxy) ── */
const SYMBOLS = [
  { sym:'^NSEI',       label:'NIFTY 50'   },
  { sym:'^BSESN',      label:'SENSEX'     },
  { sym:'^NSEBANK',    label:'BANKNIFTY'  },
  { sym:'RELIANCE.NS', label:'RELIANCE'   },
  { sym:'HDFCBANK.NS', label:'HDFC BANK'  },
  { sym:'INFY.NS',     label:'INFOSYS'    },
  { sym:'TCS.NS',      label:'TCS'        },
];

function MarketTicker() {
  const [quotes, setQuotes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [stale, setStale]   = useState(false);
  const [msg, setMsg]       = useState('');

  const fetch_ = useCallback(async () => {
    try {
      const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res  = await fetch(`${BACKEND}/market/quotes`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStale(!!data.stale);
      if (data.quotes?.length) {
        setQuotes(data.quotes);
        setStatus('ok');
      } else {
        setMsg(data.message || '');
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 60000);
    return () => clearInterval(id);
  }, [fetch_]);

  // Don't render anything if loading or failed — ticker is enhancement not critical
  if (status === 'loading') return (
    <div className={s.ticker} style={{ opacity:0.35 }}>
      <span className={s.tickerBadge}>● LIVE</span>
      <div style={{ padding:'0 16px', fontSize:10, color:'var(--fg-3)', fontFamily:'var(--font-mono)', letterSpacing:'.06em' }}>
        Fetching market data…
      </div>
    </div>
  );
  // On error show a static fallback strip so the UI doesn't collapse
  if (status === 'error' || !quotes.length) return (
    <div className={s.ticker} style={{ opacity:0.25 }}>
      <span className={s.tickerBadge} style={{ color:'var(--fg-3)' }}>● MKT</span>
      <div style={{ padding:'0 16px', fontSize:10, color:'var(--fg-3)', fontFamily:'var(--font-mono)' }}>
        {msg || 'Market data unavailable — backend proxy required'}
      </div>
    </div>
  );

  const items = [...quotes, ...quotes];
  return (
    <div className={s.ticker}>
      <span className={s.tickerBadge}>{stale ? '● DELAYED' : '● LIVE'}</span>
      <div className={s.tickerTrack}>
        <div className={s.tickerInner}>
          {items.map((q, i) => (
            <span key={i} className={`${s.tickerItem} ${q.change >= 0 ? s.up : s.dn}`}>
              <span className={s.tName}>{q.label}</span>
              <span className={s.tPrice}>{q.price?.toLocaleString('en-IN', { maximumFractionDigits:2 })}</span>
              <span className={s.tChg}>
                {q.change >= 0 ? '▲' : '▼'} {Math.abs(q.change).toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


function LiveClock() {
  const fmt = () => new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' });
  const [time, setTime] = useState(fmt);

  useEffect(() => {
    // Tick immediately to correct any stale initial value, then every 30s
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 30000);
    return () => clearInterval(id);
  }, []);

  return <span className={s.ts}>{time} IST</span>;
}

/* ── DONUT LABEL ── */
const DLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.07) return null;
  const R = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * R);
  const y = cy + r * Math.sin(-midAngle * R);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize:10, fontFamily:'JetBrains Mono', fontWeight:700 }}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
};

/* ── MAIN ── */
export default function Overview() {
  const { user }                       = useAuth();
  const { data, loading, error, refetch } = useTracker();

  const h        = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  const stats    = data?.stats    || {};
  const trend    = data?.records  || [];
  const segs     = data?.segments || [];
  const activity = data?.activity || [];

  const donutData = segs.map((sg, i) => ({
    name:  sg.name,
    value: sg.val,
    color: RISK_CLR[sg.name?.toLowerCase()] || SEG_PAL[i % SEG_PAL.length],
  }));

  return (
    <div className={s.page}>

      <MarketTicker />

      {/* HEADER */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>
            {greeting}, <em>{user?.name?.split(' ')[0] || 'there'}</em>
          </h1>
          <p className={s.sub}>
            {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            &nbsp;·&nbsp;FineasyAI Dashboard
          </p>
        </div>
        <div className={s.headerRight}>
          <Badge variant="gold" dot>Live</Badge>
          <button className={s.refreshBtn} onClick={refetch} title="Refresh">
            <RefreshCw size={13} />
          </button>
          <LiveClock />
        </div>
      </div>

      {/* STAT CARDS */}
      <div className={s.statsRow}>
        {loading
          ? [1,2,3,4].map(i => <SkeletonCard key={i} rows={3} />)
          : error
          ? <div style={{ gridColumn:'1/-1' }}><ErrorState message={error} onRetry={refetch} /></div>
          : <>
              <Stat label="Avg Credit Score"  value={stats.avg_score != null ? String(stats.avg_score) : '—'} change={stats.score_change}   icon={TrendingUp}  accent />
              <Stat label="Active Clients"    value={stats.active_users != null ? stats.active_users.toLocaleString('en-IN') : '—'} change={stats.users_change}   icon={Users}       />
              <Stat label="API Calls Today"   value={stats.api_calls_today != null ? stats.api_calls_today.toLocaleString('en-IN') : '—'} change={stats.calls_change}   icon={Zap}         />
              <Stat label="Revenue MTD"       value={stats.revenue_mtd ?? '—'} change={stats.revenue_change} icon={IndianRupee}  />
            </>
        }
      </div>

      {/* MAIN GRID */}
      <div className={s.grid}>

        {/* LEFT */}
        <div className={s.left}>

          {/* SCORE TREND — full width */}
          <Card variant="raised" className={s.chartCard}>
            <div className={s.cTop}>
              <div>
                <div className={s.cTitle}>Credit Score Trend</div>
                <div className={s.cSub}>6-month rolling average across all clients</div>
              </div>
              {stats.score_change != null && (
                <span className={`${s.pill} ${stats.score_change >= 0 ? s.pillUp : s.pillDn}`}>
                  {stats.score_change >= 0 ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
                  {Math.abs(stats.score_change)}%
                </span>
              )}
            </div>
            {loading ? <SkeletonChart height={150}/> : (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={trend} margin={{ top:4,right:4,left:-22,bottom:0 }}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#2de08a" stopOpacity={0.22}/>
                      <stop offset="100%" stopColor="#2de08a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_CLR} vertical={false}/>
                  <XAxis dataKey="month" tick={AX} axisLine={false} tickLine={false}/>
                  <YAxis domain={['auto','auto']} tick={AX} axisLine={false} tickLine={false}/>
                  <Tooltip content={<TT/>}/>
                  <Area type="monotone" dataKey="score" name="Score" stroke="#2de08a" connectNulls
                    strokeWidth={2} fill="url(#sg)" dot={false}
                    activeDot={{ r:4, fill:'#2de08a', strokeWidth:0 }}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* ROW: API + BULK */}
          <div className={s.twoCol}>
            <Card variant="raised" className={s.chartCard}>
              <div className={s.cTop}>
                <div>
                  <div className={s.cTitle}>API Volume</div>
                  <div className={s.cSub}>Monthly call count</div>
                </div>
                <Activity size={13} style={{ color:'var(--fg-3)' }}/>
              </div>
              {loading ? <SkeletonChart height={120}/> : (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={trend} margin={{ top:4,right:4,left:-22,bottom:0 }} barCategoryGap="38%">
                    <CartesianGrid stroke={GRID_CLR} vertical={false}/>
                    <XAxis dataKey="month" tick={AX} axisLine={false} tickLine={false}/>
                    <YAxis tick={AX} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="calls" name="Calls" radius={[3,3,0,0]} fill="#60c8ff" opacity={0.8}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card variant="raised" className={s.chartCard}>
              <div className={s.cTop}>
                <div>
                  <div className={s.cTitle}>Bulk Jobs</div>
                  <div className={s.cSub}>Completed / month</div>
                </div>
                <Layers size={13} style={{ color:'var(--fg-3)' }}/>
              </div>
              {loading ? <SkeletonChart height={120}/> : (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={trend} margin={{ top:4,right:4,left:-22,bottom:0 }} barCategoryGap="38%">
                    <CartesianGrid stroke={GRID_CLR} vertical={false}/>
                    <XAxis dataKey="month" tick={AX} axisLine={false} tickLine={false}/>
                    <YAxis tick={AX} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="bulk_jobs" name="Jobs" radius={[3,3,0,0]} fill="#a78bfa" opacity={0.8}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* ROW: DONUT + ACTIVITY */}
          <div className={s.twoCol}>
            <Card variant="raised" className={s.chartCard}>
              <div className={s.cTitle} style={{ marginBottom:12 }}>Risk Distribution</div>
              {loading ? <SkeletonChart height={140}/> : donutData.length === 0 ? (
                <div className={s.emptyChart}>No data yet — run seed.py or score a borrower to populate charts</div>
              ) : (
                <div className={s.donutWrap}>
                  <ResponsiveContainer width="55%" height={140}>
                    <PieChart>
                      <Pie data={donutData} dataKey="value" cx="50%" cy="50%"
                        innerRadius={36} outerRadius={58} labelLine={false}
                        label={DLabel} strokeWidth={0}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color}/>)}
                      </Pie>
                      <Tooltip content={<TT/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className={s.legend}>
                    {donutData.map((d, i) => (
                      <div key={i} className={s.legendRow}>
                        <span className={s.legendDot} style={{ background:d.color }}/>
                        <span className={s.legendLbl}>{d.name}</span>
                        <span className={s.legendVal}>{d.value?.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card variant="raised">
              <div className={s.cTitle} style={{ marginBottom:12 }}>Recent Activity</div>
              {loading ? <SkeletonTable rows={5} cols={2}/> : activity.length === 0 ? (
                <div className={s.emptyChart}>No recent activity</div>
              ) : (
                <div className={s.actList}>
                  {activity.map((a, i) => (
                    <div key={i} className={s.actRow}>
                      <span className={`${s.actDot} ${s['dot_' + a.type]}`}/>
                      <div className={s.actBody}>
                        <div className={s.actAction}>{a.action}</div>
                        <div className={s.actDetail}>{a.detail}</div>
                      </div>
                      <span className={s.actTime}>{a.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* RIGHT: CHAT */}
        <ChatPanel className={s.chat}/>
      </div>
    </div>
  );
}
