import { Zap, X } from 'lucide-react';
import { useBorrower } from '../context/BorrowerContext';
import s from './XPToast.module.css';

export default function XPToastContainer() {
  const { xpToasts, dismissXpToast } = useBorrower();
  if (!xpToasts.length) return null;
  return (
    <div className={s.container}>
      {xpToasts.map(t => (
        <div key={t.id} className={s.toast}>
          <div className={s.icon}><Zap size={14} fill="currentColor"/></div>
          <div className={s.body}>
            <div className={s.xp}>+{t.xp} XP</div>
            <div className={s.label}>{t.label}</div>
          </div>
          <button className={s.close} onClick={() => dismissXpToast(t.id)}><X size={11}/></button>
        </div>
      ))}
    </div>
  );
}
