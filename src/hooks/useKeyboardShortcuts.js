/**
 * useKeyboardShortcuts.js
 * Global keyboard shortcuts for the dashboard.
 * N = new score (Credit Score page)
 * H = history / borrowers (Credit Score page)
 * M = lender match
 * P = playbook
 * Escape = clear selected borrower
 * ? = show shortcuts help
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBorrower } from '../context/BorrowerContext';

export function useKeyboardShortcuts() {
  const navigate   = useNavigate();
  const { clearBorrower } = useBorrower();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Skip if typing in input/textarea
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'n': case 'N': navigate('/dashboard/credit');   break;
        case 'm': case 'M': navigate('/dashboard/match');    break;
        case 'p': case 'P': navigate('/dashboard/playbook'); break;
        case 'b': case 'B': navigate('/dashboard/bulk');     break;
        case 't': case 'T': navigate('/dashboard/trajectory'); break;
        case 'Escape':       clearBorrower();                break;
        case '?':            setShowHelp(v => !v);           break;
        default: break;
      }
    };
    const customHandler = () => setShowHelp(v => !v);
    window.addEventListener('keydown', handler);
    window.addEventListener('fineasy:shortcuts', customHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('fineasy:shortcuts', customHandler);
    };
  }, [navigate, clearBorrower]);

  return { showHelp, setShowHelp };
}
