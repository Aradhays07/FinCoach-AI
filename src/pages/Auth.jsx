import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Building2, ArrowRight, IndianRupee, CreditCard, Briefcase, ChevronLeft } from 'lucide-react';
import { Input, Button, Divider } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { contextService } from '../services/contextService';
import { api } from '../api';
import s from './Auth.module.css';

// ─── DEMO TOKEN ───────────────────────────────────────────────────────────────
// Generates a real HS256 JWT signed with the backend's default secret so that
// demo-mode logins pass email_from_token() on the backend instead of returning
// null and triggering 401 on every protected route.
/**
 * Creates a proper HS256 JWT signed with the backend default secret.
 * Uses the Web Crypto API — no external libs needed.
 * The backend default secret is 'dev-secret-change-me' (JWT_SECRET_KEY in .env).
 * If the user has changed JWT_SECRET_KEY, demo mode will get 401s on protected
 * routes — that is expected and acceptable (they should log in for real).
 */
async function _makeDemoToken(email) {
  // ⚠️  If you changed JWT_SECRET_KEY in backend/.env, update this string to match.
  const SECRET = 'fineasy_secure_jwt_secret_key_2026'; // must match JWT_SECRET_KEY in backend/.env
  const header  = { alg: 'HS256', typ: 'JWT' };
  const exp     = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const payload = { sub: email || 'demo@fineasy.ai', exp };

  const b64url = obj =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sigInput = `${b64url(header)}.${b64url(payload)}`;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${sigInput}.${sigB64}`;
  } catch {
    // Fallback for environments without SubtleCrypto (very old browsers)
    return `${sigInput}.demo_sig_fallback`;
  }
}

// ─── SHARED SHELL ────────────────────────────────────────────────────────────
function AuthShell({ title, subtitle, alt, step, totalSteps, children }) {
  const navigate = useNavigate();
  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <div className={s.brand} onClick={() => navigate('/')} style={{ cursor:'pointer' }}>
          <div className={s.logoMark}>FE</div>
          <span className={s.brandName}>Fineasy<em>AI</em></span>
        </div>
      </nav>
      <div className={s.body}>
        <div className={s.left}>
          <div className={s.leftContent}>
            <h2 className={s.leftTitle}>Financial intelligence<br /><em>at enterprise scale</em></h2>
            <ul className={s.leftPoints}>
              {['ML credit scoring with SHAP-backed explainability','Bulk API — 100K records per job','DPDP-compliant consent management','Zapier integration for no-code teams','Built-in lender matching marketplace'].map(p => (
                <li key={p}><span className={s.tick}>✓</span>{p}</li>
              ))}
            </ul>
            <div style={{ padding:"14px", background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)", borderLeft:"3px solid var(--gold)", borderRadius:"0 var(--r-sm) var(--r-sm) 0" }}>
              <p>"FineasyAI cut our underwriting time from 3 days to 4 hours."</p>
              <span>— NBFC credit manager, Mumbai</span>
            </div>
          </div>
        </div>
        <div className={s.right}>
          <div className={s.card}>
            {step && totalSteps && (
              <div className={s.stepIndicator}>
                <div className={s.stepTrack}>
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <div key={i} className={`${s.stepDot} ${i + 1 <= step ? s.stepActive : ''}`} />
                  ))}
                </div>
                <span className={s.stepLabel}>Step {step} of {totalSteps}</span>
              </div>
            )}
            <h1 className={s.title}>{title}</h1>
            <p className={s.subtitle}>{subtitle}</p>
            <Divider />
            {children}
            {alt && (
              <div className={s.altRow}>
                {alt.text}&nbsp;<Link to={alt.link} className={s.altLink}>{alt.label} →</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export function Login() {
  const navigate = useNavigate();
  const { login, sessionExpired, clearSessionExpired } = useAuth();
  const [form, setForm]         = useState({ email: '', password: '' });
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [serverErr, setServerErr] = useState('');
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.email)    errs.email    = 'Required';
    if (!form.password) errs.password = 'Required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true); setServerErr(''); clearSessionExpired();
    try {
      const res = await api.login(form);
      login(res.user, res.token);
      contextService.updateProfile({ name: res.user.name, email: res.user.email, company: res.user.company });
      navigate('/dashboard');
    } catch (err) {
      if (err.message?.includes('fetch') || err.message?.includes('Failed')) {
        const mockUser = { name: 'Aradhay Saxena', email: form.email, company: 'FineasyAI Demo' };
        login(mockUser, await _makeDemoToken(form.email));
        contextService.setContext({ profile: mockUser });
        navigate('/dashboard');
      } else {
        setServerErr(err.message);
      }
    } finally { setLoading(false); }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your enterprise dashboard"
      alt={{ text: "No account?", link: '/signup', label: 'Sign up' }}>
      <form onSubmit={submit} className={s.form} noValidate>
        {sessionExpired && (
          <div className={s.err}>Your session expired after 7 days. Please sign in again.</div>
        )}
        {serverErr && <div className={s.err}>{serverErr}</div>}
        <Input label="Email" type="email" placeholder="you@company.com" icon={Mail}
          value={form.email} onChange={set('email')} error={errors.email} />
        <Input label="Password" type="password" placeholder="••••••••" icon={Lock}
          value={form.password} onChange={set('password')} error={errors.password} />
        <div className={s.forgot}><a href="#">Forgot password?</a></div>
        <Button type="submit" loading={loading} full size="lg">Sign in <ArrowRight size={15} /></Button>
        <p className={s.demo}>Demo mode: any credentials work without a backend running.</p>
      </form>
    </AuthShell>
  );
}

// ─── SIGNUP — STEP VALIDATION ────────────────────────────────────────────────
function validateStep1(form) {
  const errs = {};
  if (!form.name.trim())                        errs.name     = 'Required';
  if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Valid email required';
  if (form.password.length < 8)                 errs.password = 'Min 8 characters';
  if (form.password !== form.confirm)           errs.confirm  = 'Passwords do not match';
  return errs;
}

function validateStep2(form) {
  const errs = {};
  if (!form.monthly_income || isNaN(Number(form.monthly_income)) || Number(form.monthly_income) < 0)
    errs.monthly_income = 'Enter a valid monthly income';
  if (form.existing_debt !== '' && (isNaN(Number(form.existing_debt)) || Number(form.existing_debt) < 0))
    errs.existing_debt  = 'Enter a valid amount (or leave blank for 0)';
  if (!form.employment_type)
    errs.employment_type = 'Select employment type';
  if (!form.credit_history_length)
    errs.credit_history_length = 'Select credit history length';
  return errs;
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
export function Signup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep]   = useState(1);
  const [loading, setLoading] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    // Step 1
    name: '', company: '', email: '', password: '', confirm: '',
    // Step 2
    monthly_income: '', existing_debt: '', employment_type: '',
    credit_history_length: '', loan_purpose: '',
  });

  const set = k => e => {
    setForm(p => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: undefined }));
  };

  const strength = (() => {
    const p = form.password; if (!p) return 0;
    return [p.length >= 8, /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
  })();

  const goNext = (e) => {
    e.preventDefault();
    const errs = validateStep1(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateStep2(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true); setServerErr('');

    const payload = {
      name:                  form.name.trim(),
      email:                 form.email.trim().toLowerCase(),
      password:              form.password,
      company:               form.company.trim(),
      monthly_income:        Number(form.monthly_income) || 0,
      existing_debt:         Number(form.existing_debt)  || 0,
      employment_type:       form.employment_type,
      credit_history_length: form.credit_history_length,
      loan_purpose:          form.loan_purpose || null,
    };

    try {
      const res = await api.signup(payload);
      login(res.user, res.token);
      contextService.setContext({ profile: { ...payload, name: res.user.name, email: res.user.email } });
      navigate('/dashboard');
    } catch (err) {
      if (err.message?.includes('fetch') || err.message?.includes('Failed')) {
        const mockUser = { name: payload.name, email: payload.email, company: payload.company };
        login(mockUser, await _makeDemoToken(payload.email));
        contextService.setContext({ profile: payload });
        navigate('/dashboard');
      } else {
        setServerErr(err.message);
      }
    } finally { setLoading(false); }
  };

  // ── STEP 1 UI ──────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <AuthShell title="Create account" subtitle="Free 14-day trial, no credit card required"
        alt={{ text: 'Already registered?', link: '/login', label: 'Sign in' }}
        step={1} totalSteps={2}>
        <form onSubmit={goNext} className={s.form} noValidate>
          {serverErr && <div className={s.err}>{serverErr}</div>}
          <div className={s.row}>
            <Input label="Full name"  type="text" placeholder="John Doe" icon={User}
              value={form.name}    onChange={set('name')}    error={errors.name} />
            <Input label="Company"    type="text" placeholder="Acme NBFC"       icon={Building2}
              value={form.company} onChange={set('company')} />
          </div>
          <Input label="Email" type="email" placeholder="you@company.com" icon={Mail}
            value={form.email} onChange={set('email')} error={errors.email} />
          <Input label="Password" type="password" placeholder="Min 8 characters" icon={Lock}
            value={form.password} onChange={set('password')} error={errors.password} />
          {form.password && (
            <div className={s.strength}>
              {[1,2,3,4].map(i => (
                <div key={i} className={`${s.bar} ${strength >= i ? (strength<=1?s.weak:strength<=2?s.fair:s.strong):''}`} />
              ))}
              <span className={s.strengthLabel}>{['','Weak','Fair','Good','Strong'][strength]}</span>
            </div>
          )}
          <Input label="Confirm password" type="password" placeholder="Re-enter password" icon={Lock}
            value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
          <Button type="submit" full size="lg">Next: Financial profile <ArrowRight size={15} /></Button>
        </form>
      </AuthShell>
    );
  }

  // ── STEP 2 UI ──────────────────────────────────────────────────────────────
  return (
    <AuthShell title="Financial profile" subtitle="Helps us personalise credit insights for you"
      step={2} totalSteps={2}>
      <form onSubmit={submit} className={s.form} noValidate>
        {serverErr && <div className={s.err}>{serverErr}</div>}
        <div className={s.row}>
          <Input label="Monthly income (₹)"  type="number" placeholder="80000"  icon={IndianRupee}
            value={form.monthly_income} onChange={set('monthly_income')} error={errors.monthly_income}
            hint="Your net take-home per month" />
          <Input label="Existing debt (₹)"   type="number" placeholder="30000"  icon={CreditCard}
            value={form.existing_debt}  onChange={set('existing_debt')}  error={errors.existing_debt}
            hint="Total outstanding loans/cards" />
        </div>

        <div className={s.fieldWrap}>
          <label className={s.selectLabel}>Employment type</label>
          <select className={`${s.select} ${errors.employment_type ? s.selectErr : ''}`}
            value={form.employment_type} onChange={set('employment_type')}>
            <option value="">Select…</option>
            <option value="salaried">Salaried</option>
            <option value="self-employed">Self-employed</option>
            <option value="student">Student</option>
            <option value="unemployed">Unemployed</option>
          </select>
          {errors.employment_type && <span className={s.selectErrMsg}>{errors.employment_type}</span>}
        </div>

        <div className={s.fieldWrap}>
          <label className={s.selectLabel}>Credit history length</label>
          <select className={`${s.select} ${errors.credit_history_length ? s.selectErr : ''}`}
            value={form.credit_history_length} onChange={set('credit_history_length')}>
            <option value="">Select…</option>
            <option value="<1 year">&lt;1 year</option>
            <option value="1-3 years">1–3 years</option>
            <option value="3-5 years">3–5 years</option>
            <option value="5+ years">5+ years</option>
          </select>
          {errors.credit_history_length && <span className={s.selectErrMsg}>{errors.credit_history_length}</span>}
        </div>

        <div className={s.fieldWrap}>
          <label className={s.selectLabel}>Primary loan purpose <span className={s.optional}>(optional)</span></label>
          <select className={s.select} value={form.loan_purpose} onChange={set('loan_purpose')}>
            <option value="">Select…</option>
            <option value="personal">Personal loan</option>
            <option value="home">Home purchase</option>
            <option value="business">Business expansion</option>
            <option value="vehicle">Vehicle</option>
            <option value="education">Education</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className={s.stepActions}>
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
            <ChevronLeft size={15} /> Back
          </Button>
          <Button type="submit" loading={loading} size="lg">
            Create account <ArrowRight size={15} />
          </Button>
        </div>
        <p className={s.terms}>By signing up you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.</p>
      </form>
    </AuthShell>
  );
}
