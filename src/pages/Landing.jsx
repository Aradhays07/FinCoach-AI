import { useNavigate } from 'react-router-dom';
import { Button, Badge } from '../components/UI';
import { ArrowRight, CheckCircle2, TrendingUp, Zap, Shield, BarChart3, Users, Layers } from 'lucide-react';
import s from './Landing.module.css';

const FEATURES = [
  { icon: Layers, title: 'Bulk Decisioning API', desc: 'Process 100K applications in one async batch call with webhook delivery and full SHAP audit trails.', tag: 'Core' },
  { icon: BarChart3, title: 'Sector Risk Indices', desc: 'Bespoke ML models for gig workers, farmers, and MSMEs — segments where bureau scores fail completely.', tag: 'Data' },
  { icon: Users, title: 'Lender–Borrower Matching', desc: 'Scored users auto-matched to best-fit NBFCs on the platform. You earn a referral fee on every disbursement.', tag: 'Marketplace' },
  { icon: TrendingUp, title: 'Cohort Benchmarks', desc: "See how your portfolio compares to anonymised peer NBFCs. The insight that prevents churn.", tag: 'Analytics' },
  { icon: Zap, title: 'Zapier Integration', desc: 'No-code automation for HR teams — connect FineasyAI to 6,000+ apps without engineering time.', tag: 'Platform' },
  { icon: Shield, title: 'DPDP Compliance Layer', desc: 'Granular consent management, immutable audit logs, and one-click RBI compliance export.', tag: 'Legal' },
];

const STATS = [
  { value: '₹250B', label: 'Addressable market' },
  { value: 'Live',  label: 'Model latency & SHAP coverage — see Model Metrics' },
  { value: '18%', label: 'NPA reduction' },
  { value: '190M', label: 'Underserved borrowers' },
];

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className={s.page}>

      {/* Nav */}
      <nav className={s.nav}>
        <div className={s.brand} onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className={s.logoMark}>FE</div>
          <span className={s.brandName}>Fineasy<em>AI</em></span>
        </div>
        <div className={s.navLinks}>
          <a href="#features">Features</a>
          <a href="#stats">Metrics</a>
        </div>
        <div className={s.navActions}>
          <Button variant="outline" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
          <Button size="sm" onClick={() => navigate('/signup')}>Get started <ArrowRight size={14} /></Button>
        </div>
      </nav>

      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <Badge variant="green" dot>Now with Bulk API & Zapier integration</Badge>
          <h1 className={s.heroTitle}>
            Enterprise credit<br />
            <em>intelligence</em> for India
          </h1>
          <p className={s.heroSub}>
            ML-powered credit scoring, lender matching, and AI financial coaching — white-labelled for banks, NBFCs, and HR platforms.
          </p>
          <div className={s.heroCta}>
            <Button size="lg" onClick={() => navigate('/signup')}>Start free trial <ArrowRight size={16} /></Button>
            <Button variant="ghost" size="lg" onClick={() => navigate('/login')}>View dashboard</Button>
          </div>
          <div className={s.heroTrust}>
            {['DPDP compliant', 'RBI audit ready', 'SOC 2 Type II'].map(t => (
              <span key={t} className={s.trustItem}><CheckCircle2 size={13} />{t}</span>
            ))}
          </div>
        </div>

        {/* Code card */}
        <div className={s.heroVisual}>
          <div className={s.codeCard}>
            <div className={s.codeHeader}>
              <span className={s.codeDot} style={{ background: '#ff5f57' }} />
              <span className={s.codeDot} style={{ background: '#febc2e' }} />
              <span className={s.codeDot} style={{ background: '#28c840' }} />
              <span className={s.codeLang}>POST /bulk-score</span>
            </div>
            <pre className={s.codeBody}>{`{
  "applicants": [...],  // up to 100K
  "webhook_url": "https://...",
  "include_shap": true,
  "policy_id": "nbfc_standard_v2"
}

→ 200 OK
{
  "job_id": "job_8f3a92b",
  "status": "queued",
  "eta_seconds": 12
}`}</pre>
          </div>
          <div className={s.floatCard} style={{ top: '12px', right: '-24px' }}>
            <div className={s.floatLabel}>Avg score</div>
            <div className={s.floatVal}>742</div>
            <div className={s.floatSub} style={{ color: 'var(--accent)' }}>↑ 2.8% this week</div>
          </div>
          <div className={s.floatCard} style={{ bottom: '20px', left: '-20px' }}>
            <div className={s.floatLabel}>Disbursals matched</div>
            <div className={s.floatVal}>1,284</div>
            <div className={s.floatSub} style={{ color: 'var(--ice)' }}>this month</div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className={s.stats}>
        {STATS.map(st => (
          <div key={st.label} className={s.statItem}>
            <div className={s.statVal}>{st.value}</div>
            <div className={s.statLabel}>{st.label}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section id="features" className={s.features}>
        <div className={s.sectionHead}>
          <h2>Everything your lending stack needs</h2>
          <p>Six high-impact modules — use one, or deploy the entire platform under your brand.</p>
        </div>
        <div className={s.featureGrid}>
          {FEATURES.map(f => (
            <div key={f.title} className={s.featureCard}>
              <div className={s.featureTop}>
                <div className={s.featureIcon}><f.icon size={20} /></div>
                <span className={s.featureTag}>{f.tag}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={s.ctaSection}>
        <div className={s.ctaBox}>
          <h2>Ready to deploy?</h2>
          <p>Join NBFCs and fintechs using FineasyAI to reduce NPA and engage customers at scale.</p>
          <div className={s.ctaActions}>
            <Button size="lg" onClick={() => navigate('/signup')}>Create account <ArrowRight size={16} /></Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/login')}>Sign in</Button>
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerBrand}>
          <div className={s.logoMark}>FE</div>
          <span className={s.brandName}>Fineasy<em>AI</em></span>
        </div>
        <p>© 2026 FineasyAI · Built by <strong>Aradhay Saxena</strong></p>
      </footer>
    </div>
  );
}
