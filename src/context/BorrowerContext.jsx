/**
 * BorrowerContext.jsx
 * Global selected borrower state — shared across all pages.
 * Persists to localStorage so it survives page refresh.
 * Also manages XP toast notifications for quest completions.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const BorrowerContext = createContext(null);
// FIX: Date.now() alone has millisecond resolution — two borrowers saved
// in the same millisecond (rapid clicks, tight loops) would collide, and
// saveBorrower's de-dup-by-id logic would silently treat the second as an
// update to the first, overwriting it in history.
const makeId = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const STORAGE_KEY = 'fe_selected_borrower';
const HISTORY_KEY = 'fe_borrower_history';
const QUESTS_KEY  = 'fe_completed_quests';

export function BorrowerProvider({ children }) {
  const [selected,  setSelected]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  });
  const [history,   setHistory]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  });
  const [xpToasts,  setXpToasts]  = useState([]);
  const [completedQuests, setCompletedQuests] = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUESTS_KEY)) || []; } catch { return []; }
  });
  const toastId = useRef(0);

  // Persist selected borrower
  useEffect(() => {
    try {
      if (selected) localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [selected]);

  // Persist history
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }, [history]);

  // Persist completed quests
  useEffect(() => {
    try { localStorage.setItem(QUESTS_KEY, JSON.stringify(completedQuests)); } catch {}
  }, [completedQuests]);

  const selectBorrower = useCallback((borrower) => {
    setSelected(borrower);
  }, []);

  const clearBorrower = useCallback(() => {
    setSelected(null);
  }, []);

  const clearAll = useCallback(() => {
    setSelected(null);
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }, []);

  const saveBorrower = useCallback((borrower) => {
    // borrower: { id, name, score, risk, decision, confidence, features, factors, ts }
    const entry = { ...borrower, id: borrower.id || makeId(), ts: borrower.ts || new Date().toISOString() };
    setSelected(entry);
    setHistory(prev => {
      const filtered = prev.filter(b => b.id !== entry.id);
return [entry, ...filtered].slice(0, 20); // keep last 20
    });
    return entry;
  }, []);

  const addScoreToHistory = useCallback((name, scoreData, features) => {
    const trimmedName = (name || '').trim();
    const ts = new Date().toISOString();
    const scorePoint = { score: scoreData.score, ts };

    // If same name exists in history, update that entry (grow sparkline)
    let existingEntry = null;
    if (trimmedName) {
      existingEntry = history.find(b => b.name?.trim().toLowerCase() === trimmedName.toLowerCase());
    }

    const entry = existingEntry ? {
      ...existingEntry,
      score:      scoreData.score,
      risk:       scoreData.risk,
      decision:   scoreData.decision,
      confidence: scoreData.confidence,
      factors:    scoreData.factors,
      features,
      scoreHistory: [...(existingEntry.scoreHistory || []), scorePoint].slice(-20),
      ts,
    } : {
      id:          makeId(),
      name:        trimmedName || `Borrower #${Math.floor(Math.random() * 9000) + 1000}`,
      score:       scoreData.score,
      risk:        scoreData.risk,
      decision:    scoreData.decision,
      confidence:  scoreData.confidence,
      factors:     scoreData.factors,
      features,
      scoreHistory: [scorePoint],
      ts,
    };

    return saveBorrower(entry);
  }, [saveBorrower, history]);

  const updateBorrowerScoreHistory = useCallback((id, newScore) => {
    setHistory(prev => prev.map(b => {
      if (b.id !== id) return b;
      const newHistory = [...(b.scoreHistory || []), { score: newScore.score, ts: new Date().toISOString() }];
      return {
        ...b,
        score: newScore.score,
        risk:  newScore.risk,
        scoreHistory: newHistory.slice(-20), // keep last 20 scores
      };
    }));
  }, []);

  // ── XP TOAST SYSTEM ──────────────────────────────────────────────────────
  const QUEST_TRIGGERS = {
    // FIX: this previously mapped BOTH credit_scored and bulk_submitted to
    // questId 2 — but the backend's canonical quest 2 ("Run first credit
    // batch") is specifically the bulk-scoring quest. Whichever action fired
    // first would permanently block the other from ever awarding XP, since
    // a quest can only be completed once. credit_scored now maps to quest 3
    // ("Enable SHAP reports"), which matches what /creditscore actually does
    // by default (include_shap defaults to true).
    credit_scored:  { questId: 3, xp: 300, label: 'SHAP explainability enabled' },
    playbook_gen:   { questId: 5, xp: 400, label: 'Playbook generated'          },
    lender_matched: { questId: 7, xp: 600, label: 'First lender match made'     },
    audit_exported: { questId: 8, xp: 500, label: 'RBI audit bundle exported'   },
    webhook_added:  { questId: 6, xp: 350, label: 'Zapier webhook set up'       },
    bulk_submitted: { questId: 2, xp: 500, label: 'First bulk job submitted'    },
  };

  const triggerXP = useCallback((action) => {
    const qt = QUEST_TRIGGERS[action];
    if (!qt) return;
    if (completedQuests.includes(qt.questId)) return; // already earned
    setCompletedQuests(prev => [...prev, qt.questId]);
    const id = ++toastId.current;
    setXpToasts(prev => [...prev, { id, xp: qt.xp, label: qt.label }]);
    setTimeout(() => setXpToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, [completedQuests]);

  const dismissXpToast = useCallback((id) => {
    setXpToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <BorrowerContext.Provider value={{
      selected, history,
      selectBorrower, clearBorrower, clearAll, saveBorrower,
      addScoreToHistory, updateBorrowerScoreHistory,
      xpToasts, triggerXP, dismissXpToast,
      completedQuests,
    }}>
      {children}
    </BorrowerContext.Provider>
  );
}

export const useBorrower = () => useContext(BorrowerContext);
