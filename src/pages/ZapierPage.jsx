import { useState, useEffect } from 'react';
import { Card, Button, Badge, Input } from '../components/UI';
import { Zap, Plus, Trash2, Play, CheckCircle2, XCircle, Copy, ExternalLink } from 'lucide-react';
import { useWebhooks } from '../hooks/useApi';
import { useBorrower } from '../context/BorrowerContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import s from './ZapierPage.module.css';

const TRIGGERS = [
  { id:'score.created',    label:'Credit score created',         desc:'Fires when a new score is generated' },
  { id:'score.changed',    label:'Score changed significantly',  desc:'Score moves by ±50 points' },
  { id:'score.low_risk',   label:'User enters low-risk band',    desc:'Score crosses 700 threshold' },
  { id:'score.high_risk',  label:'User enters high-risk band',   desc:'Score drops below 580' },
  { id:'quest.completed',  label:'Quest completed',              desc:'A user completes a financial quest' },
  { id:'match.made',       label:'Lender match made',            desc:'A user is matched with a lender' },
  { id:'bulk.completed',   label:'Bulk job completed',           desc:'A batch scoring job finishes' },
  { id:'consent.granted',  label:'Consent granted',              desc:'User grants data sharing consent' },
];

const ACTIONS = [
  { id:'score.predict',       label:'Predict credit score',        desc:'Run a credit score for a given user' },
  { id:'playbook.generate',   label:'Generate financial playbook', desc:'Create a personalised Gemini playbook' },
  { id:'quest.complete',      label:'Complete a quest',            desc:'Mark a quest as done for a user' },
  { id:'match.run',           label:'Run lender match',            desc:'Match a user to available lenders' },
];

const SAMPLE_PAYLOAD = `{
  "event": "score.created",
  "timestamp": "2026-05-23T14:32:00Z",
  "data": {
    "user_id": "user_2041",
    "score": 742,
    "risk_band": "low",
    "shap": {
      "debt_to_income_ratio": 0.28,
      "savings_to_income_ratio": 0.19,
      "total_expenditure": 0.09
    },
    "tenant_id": "nbfc_fineasy"
  }
}`;

export default function ZapierPage() {
  const { data: hookData } = useWebhooks();
  const { triggerXP } = useBorrower();
  const { token } = useAuth();

  const [webhooks,   setWebhooks]   = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [newTrigger, setNewTrigger] = useState('score.created');
  const [newUrl,     setNewUrl]     = useState('');
  const [testing,    setTesting]    = useState(null);
  const [testResult, setTestResult] = useState(null); // { id, success }
  const [copied,     setCopied]     = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError,   setAddError]   = useState('');
  const [rowError,   setRowError]   = useState('');

  useEffect(() => {
    if (Array.isArray(hookData) && hookData.length > 0) setWebhooks(hookData);
  }, [hookData]);

  const addWebhook = async () => {
    if (!newUrl.trim()) return;
    setAddLoading(true); setAddError('');
    try {
      const res = await api.addZapierWebhook({ trigger: newTrigger, url: newUrl });
      setWebhooks(prev => [...prev, res]);
      setNewUrl(''); setShowAdd(false);
      triggerXP('webhook_added');
    } catch (err) {
      // FIX: this used to silently fall back to a fake local-only webhook
      // (never actually sent to the backend) and close the form as if it
      // had succeeded — the user would believe automation was configured
      // when nothing was actually saved, and it would vanish on reload.
      // Show the real error instead.
      setAddError(err.message || 'Could not save webhook — is the backend running?');
    } finally {
      setAddLoading(false);
    }
  };

  const deleteWebhook = async (id) => {
    setRowError('');
    const prevWebhooks = webhooks;
    setWebhooks(prev => prev.filter(w => w.id !== id)); // optimistic
    try {
      await api.deleteZapierWebhook(id);
    } catch (err) {
      // FIX: previously swallowed the error and left the webhook removed
      // from the UI even if the backend delete actually failed — it would
      // silently reappear as still-active on the backend while looking
      // deleted here. Roll back and tell the user.
      setWebhooks(prevWebhooks);
      setRowError(err.message || 'Could not delete webhook — is the backend running?');
    }
  };

  const testWebhook = async (id) => {
    setTesting(id); setTestResult(null); setRowError('');
    try {
      const res = await api.testZapierWebhook(id);
      // FIX: previously ignored the backend's real success/failure signal
      // and always showed a green checkmark, even when the webhook URL was
      // dead or the request failed — giving false confidence the
      // integration works.
      setTestResult({ id, success: !!res.success });
      if (!res.success) {
        setRowError(`Test failed${res.http_status ? ` (HTTP ${res.http_status})` : ' — could not reach that URL'}.`);
      }
    } catch (err) {
      setTestResult({ id, success: false });
      setRowError(err.message || 'Test failed — is the backend running?');
    } finally {
      setTesting(null);
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const copyApiKey = () => {
    // FIX: this used to copy a hardcoded fake string ('fe_live_3f9a') that
    // would never actually authenticate any real API request — anyone who
    // pasted it into a Zapier webhook would get silent 401s and have no
    // idea why. Copy the user's real session token instead, which genuinely
    // works as a Bearer token against this API.
    if (!token) return;
    navigator.clipboard.writeText(token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Zapier Integration</h1>
          <p className={s.sub}>Connect FineasyAI to 6,000+ apps — no engineering team required. Automate workflows for HR, operations, and lending teams.</p>
        </div>
        <Badge variant="blue">Platform</Badge>
      </div>

      <div className={s.apiKeyRow}>
        <Card variant="raised" className={s.apiKeyCard}>
          <div className={s.apiKeyLabel}>Your API key for Zapier</div>
          <div className={s.apiKeyRow2}>
            <code className={s.apiKey}>
              {token ? `${token.slice(0, 12)}${'•'.repeat(16)}${token.slice(-4)}` : 'Log in to see your key'}
            </code>
            <Button variant="outline" size="sm" onClick={copyApiKey} disabled={!token}>
              <Copy size={13}/> {copied ? 'Copied!' : 'Copy'}
            </Button>
            <a href="https://zapier.com/apps" target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm"><ExternalLink size={13}/> Open Zapier</Button>
            </a>
          </div>
          <p style={{ fontSize:11, color:'var(--fg-3)', marginTop:8 }}>
            This is your current session token — use it as a Bearer token in Zapier's custom webhook auth. It expires after 7 days; generate a fresh one by logging in again.
          </p>
        </Card>
      </div>

      <div className={s.threeCol}>
        <div className={s.mainCol}>
          <Card variant="raised">
            <div className={s.sectionHead}>
              <div className={s.cardTitle}>Active webhooks</div>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(v => !v)}>
                <Plus size={13}/> Add webhook
              </Button>
            </div>

            {showAdd && (
              <div className={s.addForm}>
                <div className={s.fieldWrap}>
                  <label className={s.selectLabel}>Trigger event</label>
                  <select className={s.select} value={newTrigger} onChange={e => setNewTrigger(e.target.value)}>
                    {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <Input label="Webhook URL" type="url" placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={newUrl} onChange={e => setNewUrl(e.target.value)}/>
                {addError && <div style={{ fontSize:11,color:'var(--red)',marginTop:4 }}>{addError}</div>}
                <div className={s.addActions}>
                  <Button size="sm" loading={addLoading} onClick={addWebhook}>Save webhook</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {rowError && (
              <div style={{ fontSize:11,color:'var(--red)',margin:'0 0 10px',padding:'6px 10px',background:'var(--red-light)',borderRadius:'var(--r-sm)' }}>
                {rowError}
              </div>
            )}

            <div className={s.webhookList}>
              {webhooks.length === 0 ? (
                <div style={{ textAlign:'center',padding:'24px 0',fontSize:12,color:'var(--fg-3)',fontFamily:'var(--font-mono)' }}>
                  No webhooks yet — add one above.
                </div>
              ) : webhooks.map(w => (
                <div key={w.id} className={s.webhookRow}>
                  <div className={s.webhookLeft}>
                    <div className={`${s.statusDot} ${w.active ? s.dotActive : s.dotInactive}`}/>
                    <div>
                      <div className={s.webhookTrigger}>
                        {TRIGGERS.find(t => t.id === w.trigger)?.label || w.trigger}
                      </div>
                      <div className={s.webhookUrl}>{(w.url||'').length > 48 ? w.url.slice(0,48) + '…' : w.url}</div>
                    </div>
                  </div>
                  <div className={s.webhookRight}>
                    <span className={s.webhookFires}>{(w.fires||0).toLocaleString()} fires</span>
                    <span className={s.webhookLast}>{w.last || 'Never'}</span>
                    {testResult?.id === w.id ? (
                      testResult.success
                        ? <CheckCircle2 size={14} style={{ color:'var(--green)' }} title="Test succeeded"/>
                        : <XCircle size={14} style={{ color:'var(--red)' }} title="Test failed"/>
                    ) : (
                      <button className={s.actionBtn} onClick={() => testWebhook(w.id)} disabled={testing === w.id}>
                        {testing === w.id ? <span className={s.micro}/> : <Play size={12}/>}
                      </button>
                    )}
                    <button className={s.actionBtn} style={{ color:'var(--red)' }} onClick={() => deleteWebhook(w.id)}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className={s.sideCol}>
          <Card variant="raised">
            <div className={s.cardTitle} style={{ marginBottom:12 }}>Available triggers</div>
            <div className={s.triggerList}>
              {TRIGGERS.map(t => (
                <div key={t.id} className={s.triggerItem}>
                  <div className={s.triggerDot}/>
                  <div>
                    <div className={s.triggerLabel}>{t.label}</div>
                    <div className={s.triggerDesc}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="raised" style={{ marginTop:14 }}>
            <div className={s.cardTitle} style={{ marginBottom:12 }}>Available actions</div>
            <div className={s.triggerList}>
              {ACTIONS.map(a => (
                <div key={a.id} className={s.triggerItem}>
                  <div className={s.actionDot}/>
                  <div>
                    <div className={s.triggerLabel}>{a.label}</div>
                    <div className={s.triggerDesc}>{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card variant="raised">
        <div className={s.sectionHead}>
          <div className={s.cardTitle}>Sample webhook payload</div>
          <Badge variant="default">score.created</Badge>
        </div>
        <pre className={s.payload}>{SAMPLE_PAYLOAD}</pre>
      </Card>
    </div>
  );
}
