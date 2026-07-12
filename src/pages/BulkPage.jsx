import { useState, useRef } from 'react';
import { Card, Button, Badge, Input } from '../components/UI';
import { Upload, CheckCircle2, AlertCircle, Download, Play, RefreshCw, Layers } from 'lucide-react';
import { SkeletonTable, EmptyState } from '../components/States';
import { api } from '../api';
import { useBorrower } from '../context/BorrowerContext';
import s from './BulkPage.module.css';

const SAMPLE_JSON = `{
  "applicants": [
    {
      "id": "user_001",
      "INCOME": 720000,
      "DEBT": 120000,
      "SAVINGS": 108000,
      "R_DEBT_INCOME": 0.167,
      "R_SAVINGS_INCOME": 0.15,
      "T_EXPENDITURE_12": 432000,
      "T_EXPENDITURE_6": 216000,
      "CAT_DEBT": 1,
      "CAT_CREDIT_CARD": 1,
      "CAT_SAVINGS_ACCOUNT": 1,
      "CAT_GAMBLING_No": 1
    }
  ],
  "include_shap": true,
  "policy_id": "nbfc_standard_v2"
}`;

const statusIcon = (st) => {
  if (st === 'completed') return <CheckCircle2 size={14} className={s.iconGreen}/>;
  if (st === 'running')   return <RefreshCw    size={14} className={`${s.iconBlue} ${s.spin}`}/>;
  return <AlertCircle size={14} className={s.iconRed}/>;
};

// FIX (bug #5): FileReader's `error` event only fires on genuine read
// failures (permissions, device errors) — never on a wrong-encoding read,
// since decoding "succeeds" either way, just with garbled characters. The
// previous windows-1252 retry lived in reader.onerror and could never
// actually run. Decoding via ArrayBuffer + TextDecoder lets us detect the
// mismatch directly (replacement characters) and re-decode correctly —
// needed for CSVs exported from Excel with an Indian/EU locale.
async function readFileAsText(file) {
  const buf  = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (utf8.includes('\uFFFD')) {
    try { return new TextDecoder('windows-1252').decode(buf); } catch { return utf8; }
  }
  return utf8;
}

const statusBadge = (st) => {
  if (st === 'completed') return <Badge variant="green">Completed</Badge>;
  if (st === 'running')   return <Badge variant="blue" dot>Running</Badge>;
  return <Badge variant="red">Failed</Badge>;
};

export default function BulkPage() {
  const [tab, setTab]           = useState('json');
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [policyId, setPolicyId] = useState('nbfc_standard_v2');
  const { triggerXP } = useBorrower();
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError]       = useState('');
  const [jobs, setJobs]         = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // FIX: shared by both drag-drop and click-to-browse. The dropzone text
  // ("or click to browse") previously had no click handler behind it at all.
  const handleFile = async (file) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      if (file.name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        setJsonInput(text);
        setTab('json');
      } else {
        const lines = text.trim().split(/\r?\n/);
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const applicants = lines.slice(1).filter(Boolean).map((line, idx) => {
          const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const obj = { id: `csv_${idx + 1}` };
          headers.forEach((h, i) => {
            const num = parseFloat(vals[i]);
            obj[h] = isNaN(num) ? vals[i] : num;
          });
          return obj;
        });
        setJsonInput(JSON.stringify({ applicants, include_shap: true, policy_id: 'nbfc_standard_v2' }, null, 2));
        setTab('json');
      }
    } catch {
      setError('Could not parse file. Please upload a valid JSON or CSV.');
    }
  };

  const submit = async () => {
    setLoading(true); setError(''); setSubmitted(null);
    try {
      let payload;
      try { payload = JSON.parse(jsonInput); }
      catch { throw new Error('Invalid JSON — please check your input.'); }

      if (webhookUrl) payload.webhook_url = webhookUrl;
      if (policyId)   payload.policy_id   = policyId;

      const t0  = performance.now();
      const res = await api.bulkScore(payload);
      const elapsedMs = performance.now() - t0;
      const recordCount = payload.applicants?.length || 0;

      setSubmitted(res);
      triggerXP('bulk_submitted');
      setJobs(prev => [{
        id:      res.job_id,
        records: recordCount,
        done:    recordCount,
        status:  res.status || 'queued',
        avg:     res.results?.[0]?.score || null,
        date:    'just now',
        // Real measured round trip, not a fabricated figure — used to
        // compute "Avg processing" below.
        msPerRecord: recordCount ? elapsedMs / recordCount : null,
      }, ...prev]);
    } catch (err) {
      setError(err.message || 'Bulk job failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Bulk Decisioning</h1>
          <p className={s.sub}>Score up to 100,000 applicants per job. Results delivered via webhook with full SHAP audit trails.</p>
        </div>
        <Badge variant="green">API v2</Badge>
      </div>

      <div className={s.statsRow}>
        {[
          { label:'Records processed', val: jobs.reduce((a,j) => a + (j.done||0), 0).toLocaleString() || '0' },
          { label:'Jobs submitted',    val: String(jobs.length)      },
          { label:'Avg processing',    val: (() => {
              const timed = jobs.filter(j => j.msPerRecord != null);
              if (!timed.length) return '—';
              const avg = timed.reduce((a, j) => a + j.msPerRecord, 0) / timed.length;
              return `${avg.toFixed(2)}ms/rec`;
            })() },
          { label:'Success rate',      val: jobs.length
              ? `${Math.round(100 * jobs.filter(j => j.status === 'completed').length / jobs.length)}%`
              : '—' },
        ].map(st => (
          <Card key={st.label} variant="raised" className={s.miniStat}>
            <div className={s.miniLabel}>{st.label}</div>
            <div className={s.miniVal}>{st.val}</div>
          </Card>
        ))}
      </div>

      <div className={s.twoCol}>
        <div className={s.submitCol}>
          <Card variant="raised">
            <div className={s.tabRow}>
              <button className={`${s.tabBtn} ${tab === 'json' ? s.activeTab : ''}`} onClick={() => setTab('json')}>JSON input</button>
              <button className={`${s.tabBtn} ${tab === 'csv'  ? s.activeTab : ''}`} onClick={() => setTab('csv')}>CSV upload</button>
            </div>

            {tab === 'json' ? (
              <div className={s.jsonPanel}>
                <textarea className={s.jsonInput} value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)} rows={16} spellCheck={false}/>
              </div>
            ) : (
              <div className={`${s.dropzone} ${dragOver ? s.dragOver : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false);
                  handleFile(e.dataTransfer.files[0]);
                }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  style={{ display: 'none' }}
                  onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
                />
                <Upload size={28} className={s.uploadIcon}/>
                <p className={s.dropTitle}>Drop your CSV here</p>
                <p className={s.dropSub}>or click to browse · max 100K rows</p>
              </div>
            )}

            <div className={s.formFields}>
              <Input label="Webhook URL (optional)" type="url" placeholder="https://your-server.com/webhook"
                value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}/>
              <Input label="Policy ID" type="text" placeholder="nbfc_standard_v2"
                value={policyId} onChange={e => setPolicyId(e.target.value)}
                hint="Leave blank to use default scoring policy"/>
            </div>

            <div className={s.submitRow}>
              <label className={s.toggle}><input type="checkbox" defaultChecked/> Include SHAP values</label>
              <label className={s.toggle}><input type="checkbox"/> Async mode</label>
            </div>

            {error && <div style={{ fontSize:12,color:'var(--red)',marginBottom:10,padding:'8px 12px',background:'var(--red-light)',borderRadius:'var(--r-sm)' }}>{error}</div>}

            {submitted ? (
              <div className={s.successBox}>
                <CheckCircle2 size={16} className={s.iconGreen}/>
                <div>
                  <div className={s.successTitle}>Job queued successfully</div>
                  <div className={s.successMeta}>ID: <code>{submitted.job_id}</code> · Status: {submitted.status}</div>
                </div>
              </div>
            ) : (
              <Button full loading={loading} onClick={submit} size="lg">
                <Play size={14}/> Submit batch job
              </Button>
            )}
          </Card>
        </div>

        <div>
          <Card variant="raised">
            <div className={s.jobHeader}>
              <div className={s.chartTitle}>Recent jobs</div>
            </div>
            {jobs.length === 0 ? (
              <EmptyState title="No jobs yet" desc="Submit a batch job to see results here."/>
            ) : (
              <div className={s.jobList}>
                {jobs.map(j => (
                  <div key={j.id} className={s.jobRow}>
                    <div className={s.jobLeft}>
                      {statusIcon(j.status)}
                      <div>
                        <div className={s.jobId}><code>{j.id}</code></div>
                        <div className={s.jobMeta}>{j.done?.toLocaleString()} / {j.records?.toLocaleString()} records</div>
                      </div>
                    </div>
                    <div className={s.jobRight}>
                      {statusBadge(j.status)}
                      {j.avg && <span className={s.jobAvg}>avg {Math.round(j.avg)}</span>}
                      <span className={s.jobTime}>{j.date}</span>
                      {j.status === 'completed' && <button className={s.dlBtn}><Download size={12}/></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card variant="flat" className={s.pricingCard}>
            <div className={s.pricingTitle}>Pricing</div>
            <div className={s.pricingRows}>
              <div className={s.pricingRow}><span>Starter</span><span>₹4 / record</span></div>
              <div className={s.pricingRow}><span>Growth</span><span>₹1.8 / record</span></div>
              <div className={s.pricingRow}><span>Enterprise</span><span>Custom</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
