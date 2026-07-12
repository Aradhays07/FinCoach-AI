import { X } from 'lucide-react';
import s from './ShortcutsModal.module.css';

const SHORTCUTS = [
  { key:'N', desc:'New credit score' },
  { key:'M', desc:'Lender match'     },
  { key:'P', desc:'Playbook'         },
  { key:'B', desc:'Bulk decisions'   },
  { key:'T', desc:'Trajectory roadmap' },
  { key:'Esc', desc:'Clear selected borrower' },
  { key:'?', desc:'Toggle this panel' },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.head}>
          <span className={s.title}>Keyboard shortcuts</span>
          <button className={s.close} onClick={onClose}><X size={14}/></button>
        </div>
        <div className={s.list}>
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} className={s.row}>
              <kbd className={s.key}>{key}</kbd>
              <span className={s.desc}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
