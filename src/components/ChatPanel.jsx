import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Zap, Bot, User, RotateCcw, TrendingUp, Layers, Users, BookOpen, BarChart3 } from 'lucide-react';
import DecisionCard from './DecisionCard';
import GenericTable from './GenericTable';
import { ErrorState } from './States';
import { runAgent } from '../services/agentService';
import { useBorrower } from '../context/BorrowerContext';
import { contextService } from '../services/contextService';
import s from './ChatPanel.module.css';

const TOOL_META = {
  credit_score:  { label:'Credit Score',  icon:TrendingUp },
  bulk_score:    { label:'Bulk Score',    icon:Layers     },
  match_lenders: { label:'Lender Match',  icon:Users      },
  benchmarks:    { label:'Benchmarks',    icon:BarChart3  },
  playbook:      { label:'Playbook',      icon:BookOpen   },
};

const DECISION_LABELS = { approve:'Approved', reject:'Rejected', review:'Manual Review' };

const SUGGESTIONS = [
  'Score a borrower with ₹7,20,000 annual income',
  'Find lenders for this borrower',
  'Explain this decision',
  'Compare my platform to industry benchmarks',
  'Generate a retirement planning playbook',
];

function makeGreeting(borrower) {
  if (borrower?.name && borrower?.score) {
    const label = DECISION_LABELS[borrower.decision] || 'Review';
    return `You're viewing **${borrower.name}** — score ${Math.round(borrower.score)}, ${borrower.risk} risk, ${label}.\n\nI can find lenders, generate a playbook, or explain this decision. What would you like to do?`;
  }
  return "Hi — I'm your FineasyAI agent.\n\nI can score borrowers, run bulk analysis, match lenders, fetch benchmarks, and generate playbooks. What would you like to do?";
}

/* ── MESSAGE COMPONENTS ── */
function UserMessage({ content }) {
  return (
    <div className={s.userMsg}>
      <div className={s.userBubble}>{content}</div>
      <div className={s.avatar}><User size={11}/></div>
    </div>
  );
}

function ToolCallingIndicator({ tool }) {
  const meta = TOOL_META[tool] || {};
  return (
    <div className={s.toolCallRow}>
      <div className={s.toolCallChip}>
        <span className={s.toolPulse}/>
        <code>{tool ? `/${tool.replace(/_/g,'-')}` : 'agent'}</code>
        {meta.label && <span className={s.toolLbl}>{meta.label}</span>}
      </div>
    </div>
  );
}

function DecisionMessage({ payload }) {
  return (
    <div className={s.aMsg}>
      <div className={s.aAvatar}><Bot size={11}/></div>
      <div className={s.aBody}><DecisionCard {...payload}/></div>
    </div>
  );
}

function TableMessage({ payload }) {
  const { rows = [], isLenders, job_id } = payload;
  const columns = isLenders ? [
    { key:'name',       label:'Lender',  sortable:true },
    { key:'type',       label:'Type'     },
    { key:'match_pct',  label:'Match',   sortable:true, render:v => <span style={{ color:'var(--gold)',fontWeight:600 }}>{v}%</span> },
    { key:'rate_min',   label:'Rate',    render:(v,r) => `${v}–${r.rate_max}%` },
    { key:'max_amount', label:'Max',     render:v => `₹${(v/100000).toFixed(1)}L` },
  ] : [
    { key:'id',    label:'ID'    },
    { key:'score', label:'Score', sortable:true, render:v => <span style={{ fontFamily:'var(--font-mono)',fontWeight:600 }}>{v}</span> },
    { key:'risk',  label:'Risk',  render:v => {
      const c = { low:'var(--green)', medium:'var(--gold)', high:'var(--red)' };
      return <span style={{ color:c[v]||'var(--fg)',fontWeight:600,textTransform:'capitalize' }}>{v}</span>;
    }},
  ];
  return (
    <div className={s.aMsg}>
      <div className={s.aAvatar}><Bot size={11}/></div>
      <div className={s.aBody}>
        <div className={s.tableWrap}>
          {job_id && <div className={s.tableNote}>Job <code>{job_id}</code> · {rows.length} records</div>}
          <GenericTable columns={columns} data={rows} keyField={isLenders?'name':'id'} emptyTitle="No results" maxHeight="200px"/>
        </div>
      </div>
    </div>
  );
}

function TextMessage({ payload }) {
  const content = typeof payload === 'string' ? payload : payload?.content || '';
  return (
    <div className={s.aMsg}>
      <div className={s.aAvatar}><Bot size={11}/></div>
      <div className={s.aBody}>
        <div className={s.bubble}>
          {content.split('\n').map((line, i) => (
            <p key={i} className={
              line.startsWith('**') || line.startsWith('•') || line.startsWith('Step') || line.startsWith('Positive') || line.startsWith('Negative')
                ? s.boldLine : s.line
            }>{line.replace(/^\*\*|\*\*$/g,'')}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorMessage({ payload }) {
  return (
    <div className={s.aMsg}>
      <div className={s.aAvatar}><Bot size={11}/></div>
      <div className={s.aBody}><ErrorState message={payload?.message || 'Something went wrong.'}/></div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className={s.aMsg}>
      <div className={s.aAvatar}><Bot size={11}/></div>
      <div className={s.thinking}><span/><span/><span/></div>
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === 'user')         return <UserMessage content={msg.content}/>;
  if (msg.role === 'tool-calling') return <ToolCallingIndicator tool={msg.tool}/>;
  switch (msg.type) {
    case 'decision': return <DecisionMessage payload={msg.payload}/>;
    case 'table':    return <TableMessage    payload={msg.payload}/>;
    case 'error':    return <ErrorMessage    payload={msg.payload}/>;
    default:         return <TextMessage     payload={msg.payload ?? { content: msg.content }}/>;
  }
}

/* ── MAIN COMPONENT ── */
export default function ChatPanel({ className = '' }) {
  const { selected } = useBorrower();
  const selectedRef  = useRef(selected);

  // Keep ref in sync so send() always has latest borrower without stale closure
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const [msgs,     setMsgs]     = useState(() => [{ id:1, role:'assistant', type:'text', payload:{ content: makeGreeting(selected) } }]);
  const [input,    setInput]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [showSugg, setShowSugg] = useState(true);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const idCtr     = useRef(10);
  const nid       = () => ++idCtr.current;

  // Update greeting when borrower selection changes (only if no conversation started)
  useEffect(() => {
    setMsgs(prev => {
      if (prev.length > 1) return prev;
      return [{ id:1, role:'assistant', type:'text', payload:{ content: makeGreeting(selected) } }];
    });
  }, [selected?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [msgs]);

  const push = useCallback((msg) => setMsgs(prev => [...prev, { id:nid(), ...msg }]), []);

  const send = useCallback(async (text) => {
    const txt = (text || input).trim();
    if (!txt || busy) return;
    setInput('');
    setShowSugg(false);

    const currentBorrower = selectedRef.current;

    setMsgs(prev => [...prev, { id:nid(), role:'user', content:txt }]);
    setBusy(true);
    const tcId = nid();
    setMsgs(prev => [...prev, { id:tcId, role:'tool-calling', tool:null }]);

    try {
      // Build rich context: merge contextService state + live BorrowerContext borrower
      const csCtx   = contextService.getContext();
      const context = {
        ...csCtx,
        borrower: currentBorrower || null,
        lastScore: currentBorrower?.score ?? csCtx.lastScore ?? null,
        lastDecision: currentBorrower || csCtx.lastDecision || null,
      };

      const response = await runAgent(txt, context);

      // Sync scored decision back to contextService
      if (response.toolUsed === 'credit_score' && response.payload?.score != null) {
        contextService.recordDecision(response.payload.score, response.payload);
      }

      if (response.toolUsed) {
        setMsgs(prev => prev.map(m => m.id === tcId ? { ...m, tool: response.toolUsed } : m));
        await new Promise(r => setTimeout(r, 380));
      }
      setMsgs(prev => prev.filter(m => m.id !== tcId));
      push({
        role:'assistant',
        type:response.type,
        payload:response.payload,
        content:response.type === 'text' ? (response.payload?.content ?? '') : undefined,
      });
    } catch (err) {
      setMsgs(prev => prev.filter(m => m.id !== tcId));
      push({ role:'assistant', type:'error', payload:{ message: err.message || 'Request failed. Backend may be offline.' } });
    } finally {
      setBusy(false);
    }
  }, [input, busy, push]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = useCallback(() => {
    setMsgs([{ id:1, role:'assistant', type:'text', payload:{ content: makeGreeting(selectedRef.current) } }]);
    setShowSugg(true);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  return (
    <div className={`${s.panel} ${className}`}>
      <div className={s.hdr}>
        <div className={s.hLeft}>
          <span className={s.dot}/>
          <span className={s.hTitle}>FineasyAI Agent</span>
          <span className={s.hSub}>· {Object.keys(TOOL_META).length} tools</span>
        </div>
        <button className={s.resetBtn} onClick={reset} title="Reset"><RotateCcw size={12}/></button>
      </div>

      <div className={s.pills}>
        {Object.entries(TOOL_META).map(([id, meta]) => (
          <button key={id} className={s.pill} onClick={() => send(meta.label + ' request')}>
            <meta.icon size={10}/>{meta.label}
          </button>
        ))}
      </div>

      <div className={s.msgs}>
        {msgs.map(m => <Message key={m.id} msg={m}/>)}
        {busy && !msgs.find(m => m.role === 'tool-calling') && <ThinkingIndicator/>}
        {showSugg && (
          <div className={s.suggs}>
            {SUGGESTIONS.map((sg, i) => (
              <button key={i} className={s.sugg} onClick={() => send(sg)}>{sg}</button>
            ))}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div className={s.inputRow}>
        <div className={s.inputWrap}>
          <Zap size={12} className={s.inputIcon}/>
          <textarea
            ref={inputRef}
            className={s.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask me to score, match, benchmark…"
            rows={1}
            disabled={busy}
          />
        </div>
        <button
          className={`${s.sendBtn} ${(!input.trim() || busy) ? s.sendOff : ''}`}
          onClick={() => send()}
          disabled={!input.trim() || busy}
        ><Send size={12}/></button>
      </div>
    </div>
  );
}
